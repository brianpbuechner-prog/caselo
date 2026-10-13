import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { beforeAll, describe, expect, test } from 'vitest'
import { payloadText } from '../src/lib/ai/client'
import { describePayload } from '../src/lib/ai/describe'
import { allowedNumbers, checkNumbers, findNumbers } from '../src/lib/ai/numbers'
import type { DraftContent } from '../src/lib/ai/validate'
import type { Results } from '../src/lib/compare/analyze'
import type { DeidentifiedSummary } from '../src/lib/summary/build'
import { promptRuleProblems, recordedDrafts, sampleSummaries, summaryFixture, type SampleName } from './helpers/draft'

let samples: Record<SampleName, { summary: DeidentifiedSummary; results: Results }>
let payload: Record<SampleName, string>
beforeAll(async () => {
  samples = await sampleSummaries()
  payload = { q2: payloadText(samples.q2.summary), q1: payloadText(samples.q1.summary) }
})

describe('sample summary fixtures', () => {
  // The fixtures are what the recording test sends. Regenerate them with
  // UPDATE_FIXTURES=1 npm test when the summary format or sample data change.
  test.each(['q2', 'q1'] as SampleName[])('%s matches the current summary', (name) => {
    if (process.env.UPDATE_FIXTURES) writeFileSync(summaryFixture(name), payload[name])
    expect(existsSync(summaryFixture(name))).toBe(true)
    expect(readFileSync(summaryFixture(name), 'utf8')).toBe(payload[name])
  })
})

describe('finding numbers', () => {
  test('counts, percents, decimals, and commas', () => {
    expect(findNumbers('31 students (10%), GPA below 2.00, 1,204 rows').map((t) => [t.value, t.percent])).toEqual([
      [31, false], [10, true], [2, false], [1204, false],
    ])
  })
  test('labels like Q2 are not numbers', () => {
    expect(findNumbers('In Q2, up from Q1')).toEqual([])
  })
})

describe('number check', () => {
  test('accepts counts, rounded rates, rule numbers, tier names, and the <10 threshold', () => {
    const ok = 'Of 301 students, 204 (68%) had no flags and 31 (10%) were in Tier 3. Chronic absence (10% or more) rose from 21% to 23%. GPA below 2.00. Fewer than 10, shown as <10.'
    expect(checkNumbers(ok, allowedNumbers(payload.q2))).toEqual([])
  })

  test('flags numbers that are not in the payload, with context', () => {
    const misses = checkNumbers('Attendance flags rose by 5 percentage points to 23%.', allowedNumbers(payload.q2))
    expect(misses.map((m) => m.text)).toEqual(['5'])
    expect(misses[0].before).toContain('rose by')
    expect(misses[0].after).toContain('percentage points')
  })

  test('rates must be written as the rounded whole percent', () => {
    const allowed = allowedNumbers(payload.q2)
    expect(checkNumbers('23%', allowed)).toEqual([])
    expect(checkNumbers('22.9%', allowed).map((m) => m.text)).toEqual(['22.9%'])
    expect(checkNumbers('27%', allowed).map((m) => m.text)).toEqual(['27%'])
  })

  test('a count is not accepted as a percent', () => {
    // 301 is a count; "301%" is not in the payload.
    expect(checkNumbers('301%', allowedNumbers(payload.q2)).map((m) => m.text)).toEqual(['301%'])
  })
})

describe('suppressed cells are unknown', () => {
  const grade10 = () => samples.q2.summary.byGrade.find((g) => g.grade === '10')!
  const trueGrade10 = () => samples.q2.results.byGrade.find((g) => g.grade === '10')!

  test('the sample has a small ("<10") and a hidden ("*") cell in grade 10', () => {
    expect(grade10().tiers[3].kind).toBe('small')
    expect(grade10().tiers[2].kind).toBe('hidden')
  })

  test('the payload holds no number for them', () => {
    for (const k of [3, 2] as const) {
      expect(grade10().tiers[k].count).toBeNull()
      expect(grade10().tiers[k].rate).toBeNull()
    }
  })

  test('writing the real value of a "<10" or "*" cell is flagged', () => {
    const allowed = allowedNumbers(payload.q2)
    const small = trueGrade10().tiers[3]
    const hidden = trueGrade10().tiers[2]
    expect(checkNumbers(`In grade 10, ${small} students were in Tier 3.`, allowed).map((m) => m.value)).toEqual([small])
    // The hidden count is 10 or more, so check it is not a value the payload allows anyway.
    if (!allowed.plain.has(hidden)) expect(checkNumbers(`In grade 10, ${hidden} students were in Tier 2.`, allowed).map((m) => m.value)).toEqual([hidden])
  })

  test('saying they are unknown passes', () => {
    const text = 'In grade 10, Tier 3 had fewer than 10 students (<10) and the Tier 2 count is not shown (*), to protect small counts.'
    expect(checkNumbers(text, allowedNumbers(payload.q2))).toEqual([])
  })
})

describe('payload description', () => {
  test('is built from the payload', () => {
    expect(describePayload(payload.q2)).toBe(
      'This sends the Q2 summary: total students, tier counts, flagged counts by area (attendance, academics and behavior), counts flagged in two areas, change since Q1 and a by-grade table, plus the rule and tier descriptions. No names, IDs, or individual values. Counts under 10 are shown as <10 or hidden.',
    )
    expect(describePayload(payload.q1)).toContain('It also says behavior was not in the files.')
    expect(describePayload(payload.q1)).not.toContain('change since')
  })
})

// A draft written by hand to follow every rule, for checking the checker.
const GOOD_Q2: DraftContent = {
  narrative: [
    'This summary covers 301 students in Q2, compared with Q1.',
    'Of the 301 students, 204 (68%) had no flags, 66 (22%) were in Tier 2, and 31 (10%) were in Tier 3.',
    'Attendance was the area with the most students flagged: 69 students (23%) missed 10% or more of scheduled days.',
    'In academics, 42 students (14%) were flagged, and in behavior, 21 students (7%) were flagged.',
    'The pair of areas flagged together most often was attendance and academics, with 25 students.',
    'Since Q1, the share of students flagged for attendance went from 21% to 23%, and the share flagged for academics went from 12% to 14%.',
    'The change counts only the 295 students in both snapshots, and 17 of them moved up a tier.',
    'Behavior was not in the Q1 files, so it was not compared.',
    'By grade, grade 9 had the most students in Tier 3, with 12 students (15%), and 22 grade 9 students (28%) were flagged for attendance.',
    'In grades 10, 11, and 12, Tier 3 had fewer than 10 students each, and the Tier 2 counts are not shown, to protect small counts.',
    'Behavior counts in every grade were fewer than 10.',
    'These counts describe what the rules found in the files; the counselor can add context that the data does not show.',
  ].join(' '),
  goals: [
    { area: 'attendance', statement: 'By [date], all students will decrease the chronic absence rate from 23% to [target set by counselor].', baseline: 'Attendance, Q2: 69 students flagged, 23% of 301' },
    { area: 'overall', statement: 'By [date], grade 9 students will decrease the number in Tier 3 from 12 to [target set by counselor].', baseline: 'Grade 9, Tier 3, Q2: 12 students, 15%' },
  ],
  caveats: [
    'Counts under 10 are shown as <10 and their exact values are unknown.',
    'Counts marked * are hidden to protect small counts.',
    'Change since Q1 counts only the 295 students in both snapshots.',
  ],
}

describe('prompt rule checker', () => {
  test('a draft that follows the rules passes', () => {
    expect(promptRuleProblems(GOOD_Q2, payload.q2)).toEqual([])
  })

  const bad = (patch: (d: DraftContent) => void) => {
    const d: DraftContent = JSON.parse(JSON.stringify(GOOD_Q2))
    patch(d)
    return promptRuleProblems(d, payload.q2)
  }

  test('catches a cause', () => {
    expect(bad((d) => (d.narrative += ' Attendance rose, likely due to winter illness.')).join()).toMatch(/cause/)
  })

  test('allows "because" only for what was in the files', () => {
    expect(bad((d) => (d.narrative += ' Behavior was not compared because it was checked only in Q2.')).join()).not.toMatch(/cause/)
    expect(bad((d) => (d.narrative += ' Attendance rose because students were sick.')).join()).toMatch(/cause/)
  })

  test('catches an individual student', () => {
    expect(bad((d) => (d.narrative += ' One student in grade 9 was flagged in all three areas.')).join()).toMatch(/individual/)
    expect(bad((d) => (d.narrative += ' Riley Duarte was flagged for attendance.')).join()).toMatch(/names students/)
  })

  test('catches a number for a suppressed cell', () => {
    expect(bad((d) => (d.narrative += ' Grade 10 had 4 students in Tier 3.')).join()).toMatch(/numbers not in the summary: 4/)
  })

  test('catches goals out of form or a suggested target', () => {
    expect(bad((d) => (d.goals[0].statement = 'Reduce chronic absence.')).join()).toMatch(/ASCA form/)
    expect(bad((d) => (d.goals[0].statement = 'By [date], all students will decrease the chronic absence rate from 23% to 18%.')).join()).toMatch(/ASCA form/)
    expect(bad((d) => d.goals.splice(1)).join()).toMatch(/1 goals/)
  })

  test('catches a missing area that is not named', () => {
    const d: DraftContent = { ...GOOD_Q2, narrative: GOOD_Q2.narrative.replace(/Behavior[^.]*\.\s?/g, '').replace(/, and in behavior, 21 students \(7%\) were flagged/, '') }
    const problems = promptRuleProblems(d, payload.q1)
    expect(problems.join()).toMatch(/does not name missing area behavior/)
  })
})

// Drafts recorded from the real model on the sample data (see
// tests/ai-record.test.ts). Each one must follow every checkable rule.
describe('recorded model drafts', () => {
  const drafts = recordedDrafts()
  test.skipIf(drafts.length > 0)('none recorded yet (run tests/ai-record.test.ts with a key)', () => {})
  for (const r of drafts) {
    test(`${r.file} follows the prompt rules`, () => {
      expect(promptRuleProblems(r.draft, payload[r.sample])).toEqual([])
    })
  }
})

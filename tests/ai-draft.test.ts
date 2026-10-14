import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, test } from 'vitest'
import { payloadText } from '../src/lib/ai/client'
import { describePayload, draftText } from '../src/lib/ai/describe'
import { allowedNumbers, checkNumbers, findNumbers } from '../src/lib/ai/numbers'
import { parseDraftContent, type DraftContent } from '../src/lib/ai/validate'
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

  test('a change in points is always flagged, even when the digits match a count', () => {
    // 3 is allowed (Tier 3), but "3 points" is a calculated change.
    expect(checkNumbers('Academics rose by 3 points.', allowedNumbers(payload.q2)).map((m) => m.text)).toEqual(['3'])
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
const GOOD_Q2: DraftContent = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'hand-draft-q2.json'), 'utf8'))

describe('draft shape', () => {
  test('the hand-written draft parses', () => {
    expect(typeof parseDraftContent(GOOD_Q2)).toBe('object')
  })
  test('a read is required unless marked none', () => {
    const d = JSON.parse(JSON.stringify(GOOD_Q2))
    d.bigPicture[0].read = ''
    expect(parseDraftContent(d)).toMatch(/missing read/)
  })
  test('unknown roles are rejected', () => {
    const d = JSON.parse(JSON.stringify(GOOD_Q2))
    d.connections[0].roles.push('principal')
    expect(parseDraftContent(d)).toMatch(/unexpected value/)
  })
  test('plain text for Copy covers every section', () => {
    const t = draftText(GOOD_Q2)
    for (const h of ['Big picture', 'Counselor', 'Administrator', 'Teachers', 'Support team', 'How it connects', 'Goal drafts', 'Limits']) expect(t).toContain(h)
    expect(t).toContain('Worth asking: ')
    expect(t).toContain('Do less: ')
  })
})

describe('time frames in steps', () => {
  test('weeks and months are not data claims, days are', () => {
    const allowed = allowedNumbers(payload.q2)
    expect(checkNumbers('Run a 6-week group and check in for 4 weeks.', allowed)).toEqual([])
    expect(checkNumbers('Students missed 13 days on average.', allowed).map((m) => m.text)).toEqual(['13'])
  })
})

describe('prompt rule checker', () => {
  test('a draft that follows the rules passes', () => {
    expect(promptRuleProblems(GOOD_Q2, payload.q2)).toEqual([])
  })

  const bad = (patch: (d: DraftContent) => void) => {
    const d: DraftContent = JSON.parse(JSON.stringify(GOOD_Q2))
    patch(d)
    return promptRuleProblems(d, payload.q2).join(' | ')
  }

  test('catches guesses about students lives', () => {
    expect(bad((d) => (d.roles.teachers[0].read = 'Low-income families may lack transportation.'))).toMatch(/guesses/)
  })

  test('catches an individual student', () => {
    expect(bad((d) => (d.bigPicture[0].point = 'One student in grade 9 was flagged in all three areas.'))).toMatch(/individual/)
    expect(bad((d) => (d.bigPicture[0].point = 'Riley Duarte was flagged for attendance.'))).toMatch(/names students/)
  })

  test('catches a number for a suppressed cell', () => {
    expect(bad((d) => (d.bigPicture[0].point = 'Grade 10 had 4 students in Tier 3.'))).toMatch(/numbers not in the summary: 4/)
  })

  test('catches long text and generic steps', () => {
    expect(bad((d) => (d.headline = 'word '.repeat(40)))).toMatch(/headline is 40 words/)
    expect(bad((d) => (d.roles.counselor[0].do = 'Monitor closely.'))).toMatch(/generic/)
  })

  test('catches the wrong number of cards', () => {
    expect(bad((d) => d.roles.teachers.pop())).toMatch(/1 teachers cards/)
    expect(bad((d) => d.connections.pop())).toMatch(/1 connections/)
  })

  test('catches goals out of form or a suggested target', () => {
    expect(bad((d) => (d.goals[0].statement = 'Reduce chronic absence.'))).toMatch(/ASCA form/)
    expect(bad((d) => (d.goals[0].statement = 'By [date], all students will decrease the chronic absence rate from 23% to 18%.'))).toMatch(/ASCA form/)
  })

  test('catches a missing area not named in the limits', () => {
    expect(promptRuleProblems({ ...GOOD_Q2, limits: 'Counts under 10 are unknown.' }, payload.q1).join()).toMatch(/limits do not name missing area behavior/)
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

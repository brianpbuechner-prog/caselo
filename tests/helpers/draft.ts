// Shared setup for the AI draft tests: the two sample summaries, and a
// checker for the prompt rules that can run on any draft.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_THRESHOLDS } from '../../src/config/rules'
import { payloadText } from '../../src/lib/ai/client'
import { draftStrings } from '../../src/lib/ai/describe'
import { allowedNumbers, checkNumbers } from '../../src/lib/ai/numbers'
import { ROLE_KEYS, type DraftContent, type Insight } from '../../src/lib/ai/validate'
import { analyze, type Results } from '../../src/lib/compare/analyze'
import { buildSnapshots } from '../../src/lib/grouping/snapshots'
import { infiniteCampus } from '../../src/lib/sis/infinite-campus/fields'
import { buildSummary, type DeidentifiedSummary } from '../../src/lib/summary/build'
import { createNodeRunner } from './node-db'
import { parseSimple, sampleUpload } from './samples'

export const FIXTURES = join(__dirname, '..', 'fixtures')

/** "q2": Q1 and Q2 students plus Q2 behavior. "q1": Q1 students only (behavior missing). */
export type SampleName = 'q2' | 'q1'

export async function sampleSummaries(): Promise<Record<SampleName, { summary: DeidentifiedSummary; results: Results }>> {
  const db = await createNodeRunner()
  const build = async (files: ReturnType<typeof sampleUpload>[]) => {
    const results = analyze((await buildSnapshots(db, files, infiniteCampus)).snapshots, DEFAULT_THRESHOLDS)
    return { results, summary: buildSummary(results, DEFAULT_THRESHOLDS) }
  }
  return {
    q2: await build([sampleUpload('ic-students-q1.csv', 'Q1'), sampleUpload('ic-students-q2.csv', 'Q2'), sampleUpload('ic-behavior-q2.csv', 'Q2')]),
    q1: await build([sampleUpload('ic-students-q1.csv', 'Q1')]),
  }
}

export const summaryFixture = (name: SampleName) => join(FIXTURES, `sample-summary-${name}.json`)

/** Recorded model drafts: tests/fixtures/draft-<sample>-<model>.json. */
export function recordedDrafts(): { file: string; sample: SampleName; model: string; draft: DraftContent }[] {
  return readdirSync(FIXTURES)
    .filter((f) => /^draft-(q1|q2)-.+\.json$/.test(f))
    .map((file) => {
      const body = JSON.parse(readFileSync(join(FIXTURES, file), 'utf8'))
      return { file, sample: file.split('-')[1] as SampleName, model: body.model, draft: body.draft }
    })
}

// Guesses about students' lives or blame, which the prompt rules out. (Reads
// about patterns in the data, labeled "Likely" or "Worth asking", are allowed.)
const GUESS = /\b(lazy|unmotivated|don'?t care|poverty|poor families|low[- ]income|home life|divorce|drugs?|gangs?|race|racial|ethnic\w*|immigra\w*|disabilit\w*|diagnos\w*|ADHD|depress\w*|trauma\w*|bad parent\w*)\b/i
const INDIVIDUAL = /\b(a|one|the|this|that) (particular |individual |specific )?student\b(?! (count|population|body|group|outcome|support|list))|\bstudents? named\b|\btop \d+ students\b/i
const GENERIC = /\b(monitor (closely|progress)|continue to (support|monitor)|raise awareness|reach out to families)\b/i
const GOAL = /^By \[date\], .+ will (increase|decrease) .+ from .+ to \[target set by counselor\]\.?$/

const SAMPLE_FILES = ['ic-students-q1.csv', 'ic-students-q2.csv', 'ic-behavior-q2.csv']
let names: string[] | null = null
function studentNames(): string[] {
  names ??= [
    ...new Set(
      SAMPLE_FILES.flatMap((f) =>
        parseSimple(f)
          .filter((r) => r['student.firstName'] && r['student.lastName'])
          .map((r) => `${r['student.firstName']} ${r['student.lastName']}`),
      ),
    ),
  ]
  return names
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length

// Word limits from the prompt. The check allows a quarter more before it
// complains, so one long word or a number does not fail a draft.
const LIMITS = { headline: 25, label: 8, point: 20, read: 25, do: 20, doLess: 15, step: 20, limits: 40 }
function tooLong(problems: string[], where: string, text: string, limit: number) {
  const n = words(text)
  if (n > Math.ceil(limit * 1.25)) problems.push(`${where} is ${n} words (limit ${limit})`)
}

function checkInsight(problems: string[], where: string, c: Insight) {
  tooLong(problems, `${where} label`, c.label, LIMITS.label)
  tooLong(problems, `${where} point`, c.point, LIMITS.point)
  tooLong(problems, `${where} read`, c.read, LIMITS.read)
  tooLong(problems, `${where} do`, c.do, LIMITS.do)
  tooLong(problems, `${where} do less`, c.doLess, LIMITS.doLess)
  if (!/\d/.test(c.number)) problems.push(`${where} has no number`)
  if (c.readKind === 'none' && c.read) problems.push(`${where} has a read marked none`)
  const generic = c.do.match(GENERIC)
  if (generic) problems.push(`${where} step is generic: "${generic[0]}"`)
}

/** Every prompt rule that can be checked by reading the draft. Returns the problems found. */
export function promptRuleProblems(draft: DraftContent, payload: string): string[] {
  const problems: string[] = []
  const strings = draftStrings(draft)
  const text = strings.join('\n')
  const summary = JSON.parse(payload) as DeidentifiedSummary

  const allowed = allowedNumbers(payload)
  const misses = strings.flatMap((t) => checkNumbers(t, allowed))
  if (misses.length) problems.push(`numbers not in the summary: ${misses.map((m) => m.text).join(', ')}`)

  const guess = text.match(GUESS)
  if (guess) problems.push(`guesses about students' lives or blames: "${guess[0]}"`)
  const individual = text.match(INDIVIDUAL)
  if (individual) problems.push(`mentions an individual student: "${individual[0]}"`)
  const named = studentNames().filter((n) => text.includes(n))
  if (named.length) problems.push(`names students: ${named.join(', ')}`)

  for (const c of summary.missingRules) if (!new RegExp(`\\b${c}\\b`, 'i').test(draft.limits)) problems.push(`limits do not name missing area ${c}`)
  for (const c of summary.change?.notCompared ?? []) if (!new RegExp(`\\b${c}\\b`, 'i').test(text)) problems.push(`does not say ${c} was not compared`)

  tooLong(problems, 'headline', draft.headline, LIMITS.headline)
  tooLong(problems, 'limits', draft.limits, LIMITS.limits)
  if (draft.keyNumbers.length < 3 || draft.keyNumbers.length > 4) problems.push(`${draft.keyNumbers.length} key numbers`)
  for (const [i, k] of draft.keyNumbers.entries()) tooLong(problems, `key number ${i + 1} label`, k.label, LIMITS.label)
  if (draft.bigPicture.length < 2 || draft.bigPicture.length > 3) problems.push(`${draft.bigPicture.length} big picture cards`)
  draft.bigPicture.forEach((c, i) => checkInsight(problems, `big picture ${i + 1}`, c))
  for (const r of ROLE_KEYS) {
    if (draft.roles[r].length !== 2) problems.push(`${draft.roles[r].length} ${r} cards`)
    draft.roles[r].forEach((c, i) => checkInsight(problems, `${r} ${i + 1}`, c))
  }
  if (draft.connections.length < 2 || draft.connections.length > 3) problems.push(`${draft.connections.length} connections`)
  draft.connections.forEach((c, i) => {
    if (c.roles.length < 2) problems.push(`connection ${i + 1} names one role`)
    if (c.steps.some((st) => !c.roles.includes(st.role))) problems.push(`connection ${i + 1} has a step for a role it does not list`)
    for (const st of c.steps) tooLong(problems, `connection ${i + 1} step`, st.step, LIMITS.step)
  })

  if (draft.goals.length < 2 || draft.goals.length > 3) problems.push(`${draft.goals.length} goals`)
  for (const g of draft.goals) if (!GOAL.test(g.statement.trim())) problems.push(`goal not in ASCA form: "${g.statement}"`)
  return problems
}

export { payloadText }

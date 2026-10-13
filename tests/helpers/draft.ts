// Shared setup for the AI draft tests: the two sample summaries, and a
// checker for the prompt rules that can run on any draft.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_THRESHOLDS } from '../../src/config/rules'
import { payloadText } from '../../src/lib/ai/client'
import { draftText } from '../../src/lib/ai/describe'
import { allowedNumbers, checkNumbers } from '../../src/lib/ai/numbers'
import type { DraftContent } from '../../src/lib/ai/validate'
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

const CAUSE = /\b(due to|because|likely|suggests?|suggesting|driven by|as a result( of)?|caused( by)?|attributable|stems? from|owing to|leads? to|contribut(es|ed|ing) to)\b/i
const DATA_REASON = /\bbecause (it|they|this|that) (was|were|is|are) (only )?(checked|not checked|in the files|not in the files)[^.;]*/gi
const INDIVIDUAL = /\b(a|one|the|this|that|each) (particular |individual |specific )?student\b(?! (count|population|body|group|outcome|support))|\bstudents? named\b|\btop \d+ students\b/i
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

/** Every prompt rule that can be checked by reading the draft. Returns the problems found. */
export function promptRuleProblems(draft: DraftContent, payload: string): string[] {
  const problems: string[] = []
  const text = draftText(draft)
  const summary = JSON.parse(payload) as DeidentifiedSummary

  const misses = checkNumbers(text, allowedNumbers(payload))
  if (misses.length) problems.push(`numbers not in the summary: ${misses.map((m) => m.text).join(', ')}`)

  // "because" is allowed only when it explains what data was in the files
  // ("not compared because it was checked only in Q2"), not a result.
  const cause = text.replace(DATA_REASON, '').match(CAUSE)
  if (cause) problems.push(`gives a cause: "${cause[0]}"`)

  const individual = text.match(INDIVIDUAL)
  if (individual) problems.push(`mentions an individual student: "${individual[0]}"`)
  const named = studentNames().filter((n) => text.includes(n))
  if (named.length) problems.push(`names students: ${named.join(', ')}`)

  for (const c of summary.missingRules) if (!new RegExp(`\\b${c}\\b`, 'i').test(text)) problems.push(`does not name missing area ${c}`)

  const n = words(draft.narrative)
  if (n < 150 || n > 250) problems.push(`narrative is ${n} words`)

  if (draft.goals.length < 2 || draft.goals.length > 3) problems.push(`${draft.goals.length} goals`)
  for (const g of draft.goals) if (!GOAL.test(g.statement.trim())) problems.push(`goal not in ASCA form: "${g.statement}"`)
  if (!draft.caveats.length) problems.push('no caveats')
  return problems
}

export { payloadText }

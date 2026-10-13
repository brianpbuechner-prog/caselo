// Plain-language helpers for the AI draft: the one-line description of what
// would be sent (built from the payload itself), and the draft as editable
// text.

import { MIN_SHOWN, type DraftContent } from './validate'

const AREA: Record<string, string> = { attendance: 'attendance', academics: 'academics', behavior: 'behavior' }

function join(words: string[]): string {
  if (words.length < 2) return words.join('')
  return `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`
}

/** One line describing the payload, built by reading the payload text. */
export function describePayload(payload: string): string {
  const s = JSON.parse(payload) as {
    label: string
    rules: string[]
    missingRules: string[]
    pairs: unknown[]
    change: { from: string } | null
    byGrade: unknown[]
  }
  const parts = ['total students', 'tier counts', `flagged counts by area (${join(s.rules.map((r) => AREA[r] ?? r))})`]
  if (s.pairs.length) parts.push('counts flagged in two areas')
  if (s.change) parts.push(`change since ${s.change.from}`)
  if (s.byGrade.length) parts.push('a by-grade table')
  const missing = s.missingRules.length ? ` It also says ${join(s.missingRules.map((r) => AREA[r] ?? r))} ${s.missingRules.length === 1 ? 'was' : 'were'} not in the files.` : ''
  return `This sends the ${s.label} summary: ${join(parts)}, plus the rule and tier descriptions.${missing} No names, IDs, or individual values. Counts under ${MIN_SHOWN} are shown as <${MIN_SHOWN} or hidden.`
}

/** The draft as one editable block of text. */
export function draftText(d: DraftContent): string {
  return [
    d.narrative.trim(),
    'Goal drafts',
    d.goals.map((g) => `- ${g.statement.trim()}\n  Baseline: ${g.baseline.trim()}`).join('\n'),
    'Caveats',
    d.caveats.map((c) => `- ${c.trim()}`).join('\n'),
  ].join('\n\n')
}

/** A draft's date for display, such as "October 13, 2026". */
export function draftDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

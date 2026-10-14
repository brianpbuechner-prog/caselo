// Plain-language helpers for the AI draft: the one-line description of what
// would be sent (built from the payload itself), and the draft as editable
// text.

import { MIN_SHOWN, ROLE_KEYS, type DraftContent, type Insight, type RoleKey } from './validate'

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

export const ROLE_LABELS: Record<RoleKey, string> = {
  counselor: 'Counselor',
  administrator: 'Administrator',
  teachers: 'Teachers',
  supportTeam: 'Support team',
}

const READ_LABEL = { question: 'Worth asking', likely: 'Likely', none: '' } as const

function insightText(c: Insight): string {
  const lines = [`${c.number} ${c.label}`, c.point]
  if (c.readKind !== 'none' && c.read) lines.push(`${READ_LABEL[c.readKind]}: ${c.read}`)
  lines.push(`Do: ${c.do}`)
  if (c.doLess) lines.push(`Do less: ${c.doLess}`)
  return lines.map((l, i) => (i === 0 ? `- ${l}` : `  ${l}`)).join('\n')
}

/** The draft as plain text, for Copy. */
export function draftText(d: DraftContent): string {
  return [
    d.headline,
    d.keyNumbers.map((k) => `${k.value} ${k.label}`).join('\n'),
    `Big picture\n${d.bigPicture.map(insightText).join('\n')}`,
    ...ROLE_KEYS.map((r) => `${ROLE_LABELS[r]}\n${d.roles[r].map(insightText).join('\n')}`),
    `How it connects\n${d.connections
      .map((c) => [`- ${c.number} ${c.label} (${c.roles.map((r) => ROLE_LABELS[r]).join(', ')})`, `  ${c.point}`, ...c.steps.map((s) => `  ${ROLE_LABELS[s.role]}: ${s.step}`)].join('\n'))
      .join('\n')}`,
    `Goal drafts\n${d.goals.map((g) => `- ${g.statement}\n  Baseline: ${g.baseline}`).join('\n')}`,
    `Limits\n${d.limits}`,
  ].join('\n\n')
}

/** Every piece of text in a draft, for the number check. */
export function draftStrings(d: DraftContent): string[] {
  const card = (c: Insight) => [c.number, c.label, c.point, c.read, c.do, c.doLess]
  return [
    d.headline,
    ...d.keyNumbers.flatMap((k) => [k.value, k.label]),
    ...d.bigPicture.flatMap(card),
    ...ROLE_KEYS.flatMap((r) => d.roles[r].flatMap(card)),
    ...d.connections.flatMap((c) => [c.number, c.label, c.point, ...c.steps.map((s) => s.step)]),
    ...d.goals.flatMap((g) => [g.statement, g.baseline]),
    d.limits,
  ]
}

/** A draft's date for display, such as "October 13, 2026". */
export function draftDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

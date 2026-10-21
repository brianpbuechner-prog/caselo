// Which way a student is heading between two snapshots, and who is close
// to a line. Plain rules, each with a reason a counselor can read.
//
//   Finding footing  fewer signals than last time
//   Slipping         a new signal, or absence, GPA, or behavior moved
//                    toward a line by a set amount
//   Gaining ground   moved away from a line, nothing moved toward one
//   Steady           everything else

import type { Thresholds } from '../../config/rules'
import type { Direction } from '../language'
import { fmtPct, RULE_LABELS, type Evaluation, type RuleCategory } from '../rules/engine'

export interface Movement {
  direction: Direction
  /** Plain-language reasons, e.g. "Absent 2.0% in Q1, 7.5% in Q2". */
  reasons: string[]
}

const has = (e: Evaluation, c: RuleCategory) => e.flags.some((f) => f.category === c)

/** Enough school days in a snapshot to trust an attendance percentage. */
function enoughDays(e: Evaluation, t: Thresholds): boolean {
  const days = e.row.scheduledDays
  // Unknown day counts (district percentage only) are trusted.
  return days == null || days >= t.moveMinDays
}

export function movement(
  latest: Evaluation,
  previous: Evaluation,
  comparable: RuleCategory[],
  labels: { from: string; to: string },
  t: Thresholds,
): Movement {
  const worse: string[] = []
  const better: string[] = []
  const { from, to } = labels

  if (comparable.includes('attendance') && latest.absencePct != null && previous.absencePct != null && enoughDays(latest, t) && enoughDays(previous, t)) {
    const d = latest.absencePct - previous.absencePct
    const text = `Absent ${fmtPct(previous.absencePct)} in ${from}, ${fmtPct(latest.absencePct)} in ${to}`
    if (d >= t.moveAbsencePoints) worse.push(text)
    else if (d <= -t.moveAbsencePoints) better.push(text)
  }
  if (comparable.includes('academics') && latest.gpa != null && previous.gpa != null) {
    const d = latest.gpa - previous.gpa
    const text = `GPA ${previous.gpa.toFixed(2)} in ${from}, ${latest.gpa.toFixed(2)} in ${to}`
    // A small tolerance so 0.30 counts as 0.3 despite rounding.
    if (d <= -t.moveGpa + 1e-9) worse.push(text)
    else if (d >= t.moveGpa - 1e-9) better.push(text)
  }
  if (comparable.includes('behavior') && latest.incidents != null && previous.incidents != null && latest.incidents !== previous.incidents) {
    const n = (x: number) => `${x} ${x === 1 ? 'incident' : 'incidents'}`
    const text = `${n(previous.incidents)} in ${from}, ${n(latest.incidents)} in ${to}`
    if (latest.incidents > previous.incidents) worse.push(text)
    else better.push(text)
  }

  const gained = comparable.filter((c) => has(latest, c) && !has(previous, c))
  const lost = comparable.filter((c) => !has(latest, c) && has(previous, c))
  const newSignals = gained.map((c) => `New ${RULE_LABELS[c].toLowerCase()} signal`)
  const cleared = lost.map((c) => `${RULE_LABELS[c]} signal cleared`)

  if (lost.length > gained.length) return { direction: 'finding', reasons: [...cleared, ...better] }
  if (gained.length || worse.length) return { direction: 'slipping', reasons: [...newSignals, ...worse] }
  if (better.length) return { direction: 'gaining', reasons: better }
  return { direction: 'steady', reasons: [] }
}

/** Reasons a student with no signals is close to a line. Empty when not close. */
export function nearLine(e: Evaluation, t: Thresholds): string[] {
  if (e.flags.length > 0) return []
  const out: string[] = []
  if (e.absencePct != null && e.absencePct >= t.chronicAbsencePct - t.nearAbsencePoints && e.absencePct < t.chronicAbsencePct && enoughDays(e, t)) {
    out.push(`Absent ${fmtPct(e.absencePct)}; the line is ${t.chronicAbsencePct}%`)
  }
  if (e.gpa != null && e.gpa >= t.gpaBelow && e.gpa < t.gpaBelow + t.nearGpa) {
    out.push(`GPA ${e.gpa.toFixed(2)}; the line is ${t.gpaBelow.toFixed(2)}`)
  }
  if (e.incidents != null && t.behaviorIncidentsAtLeast > 1 && e.incidents === t.behaviorIncidentsAtLeast - 1) {
    out.push(`${e.incidents} ${e.incidents === 1 ? 'incident' : 'incidents'}; the line is ${t.behaviorIncidentsAtLeast}`)
  }
  return out
}

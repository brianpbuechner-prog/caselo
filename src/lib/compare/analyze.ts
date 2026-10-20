// Turn snapshots into results: evaluate every student in every snapshot,
// then describe the latest snapshot and the change from the one before it.

import type { Thresholds } from '../../config/rules'
import type { Snapshot } from '../model'
import { availableRules, evaluate, RULE_CATEGORIES, tierFor, type Evaluation, type RuleCategory, type Tier } from '../rules/engine'
import type { Category } from '../sis/types'
import { movement, nearLine, type Movement } from './movement'

export type ChangeStatus = 'up' | 'down' | 'same' | 'new'

export const CHANGE_LABELS: Record<ChangeStatus, string> = {
  up: 'More signals than last time',
  down: 'Fewer signals than last time',
  same: 'Same support level',
  new: 'New in this snapshot',
}

export interface StudentResult {
  key: string
  latest: Evaluation
  /** One entry per snapshot, null where the student was not in that snapshot. */
  history: (Evaluation | null)[]
  previous: Evaluation | null
  change: ChangeStatus | null
  /** Tiers counting only categories present in both snapshots, for comparison. */
  comparableTiers: { previous: Tier; latest: Tier } | null
  /** Direction since the previous snapshot, when the student is in both. */
  movement: Movement | null
  /** Why a student with no signals is close to a line. Empty when not. */
  near: string[]
}

export interface SnapshotSummary {
  label: string
  categories: Category[]
  rules: Record<RuleCategory, boolean>
  students: number
  tiers: Record<Tier, number>
  flagged: Record<RuleCategory, number>
}

export interface GradeSummary {
  grade: string
  students: number
  tiers: Record<Tier, number>
  flagged: Record<RuleCategory, number>
}

export interface Transitions {
  from: string
  to: string
  tierUp: number
  tierDown: number
  newlyFlagged: Record<RuleCategory, number>
  noLongerFlagged: Record<RuleCategory, number>
  inBoth: number
  onlyInPrevious: number
  onlyInLatest: number
  /** Rule categories present in both snapshots. Tier changes count only these. */
  comparable: RuleCategory[]
}

export interface Results {
  labels: string[]
  students: StudentResult[]
  summaries: SnapshotSummary[]
  byGrade: GradeSummary[]
  transitions: Transitions | null
  /** Rule categories with no data in the latest snapshot. */
  missingRules: RuleCategory[]
}

const zeroFlags = (): Record<RuleCategory, number> => ({ attendance: 0, academics: 0, behavior: 0 })
const zeroTiers = (): Record<Tier, number> => ({ 1: 0, 2: 0, 3: 0 })

const has = (e: Evaluation, c: RuleCategory) => e.flags.some((f) => f.category === c)

export function gradeSortValue(g: string): number {
  const n = Number(g)
  if (!Number.isNaN(n)) return n
  const named: Record<string, number> = { PK: -2, EC: -2, K: 0, KG: 0, KF: 0, KH: 0 }
  return named[g] ?? 99
}

export function analyze(snapshots: Snapshot[], t: Thresholds): Results {
  const labels = snapshots.map((s) => s.label)
  const evaluated = snapshots.map((s) => {
    const m = new Map<string, Evaluation>()
    for (const [key, row] of s.students) m.set(key, evaluate(row, s.categories, t))
    return m
  })

  const summaries: SnapshotSummary[] = snapshots.map((s, i) => {
    const tiers = zeroTiers()
    const flagged = zeroFlags()
    for (const e of evaluated[i].values()) {
      tiers[e.tier]++
      for (const f of e.flags) flagged[f.category]++
    }
    return { label: s.label, categories: s.categories, rules: availableRules(s.categories), students: s.students.size, tiers, flagged }
  })

  const last = evaluated.length - 1
  const latest = evaluated[last]
  const prev = last > 0 ? evaluated[last - 1] : null

  // Only compare a rule when both snapshots had data for it.
  const comparable =
    last > 0 ? RULE_CATEGORIES.filter((c) => summaries[last].rules[c] && summaries[last - 1].rules[c]) : []
  const comparableTier = (e: Evaluation) => tierFor(e.flags.filter((f) => comparable.includes(f.category)).length, t)

  const students: StudentResult[] = [...latest.entries()].map(([key, e]) => {
    const history = evaluated.map((m) => m.get(key) ?? null)
    const previous = prev?.get(key) ?? null
    let change: ChangeStatus | null = null
    let comparableTiers: StudentResult['comparableTiers'] = null
    if (prev) {
      if (!previous) change = 'new'
      else {
        comparableTiers = { previous: comparableTier(previous), latest: comparableTier(e) }
        const d = comparableTiers.latest - comparableTiers.previous
        change = d > 0 ? 'up' : d < 0 ? 'down' : 'same'
      }
    }
    const move = previous ? movement(e, previous, comparable, { from: labels[last - 1], to: labels[last] }, t) : null
    return { key, latest: e, history, previous, change, comparableTiers, movement: move, near: nearLine(e, t) }
  })

  const grades = new Map<string, GradeSummary>()
  for (const e of latest.values()) {
    const g = e.row.grade ?? 'Unknown'
    if (!grades.has(g)) grades.set(g, { grade: g, students: 0, tiers: zeroTiers(), flagged: zeroFlags() })
    const gs = grades.get(g)!
    gs.students++
    gs.tiers[e.tier]++
    for (const f of e.flags) gs.flagged[f.category]++
  }
  const byGrade = [...grades.values()].sort((a, b) => gradeSortValue(a.grade) - gradeSortValue(b.grade))

  let transitions: Transitions | null = null
  if (prev) {
    const tr: Transitions = {
      from: labels[last - 1],
      to: labels[last],
      tierUp: 0,
      tierDown: 0,
      newlyFlagged: zeroFlags(),
      noLongerFlagged: zeroFlags(),
      inBoth: 0,
      onlyInPrevious: 0,
      onlyInLatest: 0,
      comparable,
    }
    for (const [key, e] of latest) {
      const p = prev.get(key)
      if (!p) {
        tr.onlyInLatest++
        continue
      }
      tr.inBoth++
      if (comparableTier(e) > comparableTier(p)) tr.tierUp++
      if (comparableTier(e) < comparableTier(p)) tr.tierDown++
      for (const c of comparable) {
        if (has(e, c) && !has(p, c)) tr.newlyFlagged[c]++
        if (!has(e, c) && has(p, c)) tr.noLongerFlagged[c]++
      }
    }
    for (const key of prev.keys()) if (!latest.has(key)) tr.onlyInPrevious++
    transitions = tr
  }

  const missingRules = RULE_CATEGORIES.filter((c) => !summaries[last].rules[c])

  return { labels, students, summaries, byGrade, transitions, missingRules }
}

/** Students who were newly flagged in a category since the previous snapshot. */
export function newlyFlagged(s: StudentResult, c: RuleCategory): boolean {
  return Boolean(s.previous) && has(s.latest, c) && !has(s.previous!, c)
}

// Patterns in the latest snapshot: where flags concentrate, how they
// overlap, how values are distributed around each rule, and who a
// counselor might start with. Everything here is counted from the same
// evaluations the student list uses, so each number can be traced to a rule.

import type { Thresholds } from '../../config/rules'
import { RULE_CATEGORIES, RULE_LABELS, type RuleCategory } from '../rules/engine'
import type { Results, StudentResult } from './analyze'

const has = (s: StudentResult, c: RuleCategory) => s.latest.flags.some((f) => f.category === c)

/** Groups smaller than this are left out of comparisons between groups. */
export const MIN_GROUP = 10

// ---- Distributions ----

export interface Bin {
  from: number
  /** Null on the open-ended last bin. */
  to: number | null
  count: number
  /** True when every value in this bin meets the rule. */
  flagged: boolean
}

export interface Distribution {
  bins: Bin[]
  threshold: number
  /** Students with a value. */
  total: number
  /** Students not flagged whose value is within one bin of the rule. */
  near: number
  binWidth: number
}

/**
 * Bins are sized so the rule's threshold always lands on a bin edge. That
 * way a bar is either entirely flagged or entirely not.
 */
export function distribution(
  values: number[],
  threshold: number,
  opts: { targetWidth: number; max: number; flagWhen: 'atOrAbove' | 'below'; openEnded: boolean },
): Distribution {
  const steps = Math.max(1, Math.round(threshold / opts.targetWidth))
  const w = threshold > 0 ? threshold / steps : opts.targetWidth
  const top = opts.openEnded ? opts.max : Math.max(opts.max, ...values)
  const n = Math.max(steps + 1, Math.ceil(top / w - 1e-9))
  const overflow = opts.openEnded && values.some((v) => v >= n * w)
  const bins: Bin[] = []
  for (let i = 0; i < n + (overflow ? 1 : 0); i++) {
    const from = i * w
    const to = i === n ? null : (i + 1) * w
    const flagged = opts.flagWhen === 'atOrAbove' ? i >= steps : i < steps
    bins.push({ from, to, count: 0, flagged })
  }
  for (const v of values) {
    const i = Math.min(bins.length - 1, Math.max(0, Math.floor(v / w + 1e-9)))
    bins[i].count++
  }
  const nearBin = opts.flagWhen === 'atOrAbove' ? bins[steps - 1] : bins[steps]
  return { bins, threshold, total: values.length, near: nearBin?.count ?? 0, binWidth: w }
}

export function absenceDistribution(results: Results, t: Thresholds): Distribution | null {
  const values = results.students.flatMap((s) => (s.latest.absencePct == null ? [] : [s.latest.absencePct]))
  if (!values.length) return null
  return distribution(values, t.chronicAbsencePct, {
    targetWidth: 2.5,
    max: Math.max(t.chronicAbsencePct * 3, 30),
    flagWhen: 'atOrAbove',
    openEnded: true,
  })
}

export function gpaDistribution(results: Results, t: Thresholds): Distribution | null {
  const values = results.students.flatMap((s) => (s.latest.gpa == null ? [] : [s.latest.gpa]))
  if (!values.length) return null
  return distribution(values, t.gpaBelow, { targetWidth: 0.25, max: 4, flagWhen: 'below', openEnded: false })
}

// ---- Overlap ----

export interface OverlapGroup {
  /** Flag categories this group has, in the usual order. */
  categories: RuleCategory[]
  key: string
  count: number
}

export interface Overlap {
  groups: OverlapGroup[]
  flagged: number
  /** The strongest pairing: of students flagged for `of`, how many also have `also`. */
  strongest: { of: RuleCategory; also: RuleCategory; both: number; total: number } | null
}

export const comboKey = (cats: RuleCategory[]) => RULE_CATEGORIES.filter((c) => cats.includes(c)).join('+')

export function overlap(results: Results): Overlap {
  const counts = new Map<string, OverlapGroup>()
  let flagged = 0
  for (const s of results.students) {
    const cats = RULE_CATEGORIES.filter((c) => has(s, c))
    if (!cats.length) continue
    flagged++
    const key = comboKey(cats)
    const g = counts.get(key) ?? { categories: cats, key, count: 0 }
    g.count++
    counts.set(key, g)
  }
  const groups = [...counts.values()].sort((a, b) => b.categories.length - a.categories.length || b.count - a.count)

  let strongest: Overlap['strongest'] = null
  for (const of of RULE_CATEGORIES) {
    const total = results.students.filter((s) => has(s, of)).length
    if (total < MIN_GROUP) continue
    for (const also of RULE_CATEGORIES) {
      if (also === of) continue
      const both = results.students.filter((s) => has(s, of) && has(s, also)).length
      if (both > 0 && (!strongest || both / total > strongest.both / strongest.total)) strongest = { of, also, both, total }
    }
  }
  return { groups, flagged, strongest }
}

// ---- Where flags concentrate ----

export interface Hotspot {
  grade: string
  category: RuleCategory
  count: number
  students: number
  rate: number
  caseloadRate: number
}

/** Grade and area combinations with a higher flag rate than the caseload, largest gap first. */
export function hotspots(results: Results, limit = 3): Hotspot[] {
  const latest = results.summaries[results.summaries.length - 1]
  const out: Hotspot[] = []
  for (const g of results.byGrade) {
    if (g.students < MIN_GROUP) continue
    for (const c of RULE_CATEGORIES) {
      if (!latest.rules[c] || latest.students === 0) continue
      const rate = g.flagged[c] / g.students
      const caseloadRate = latest.flagged[c] / latest.students
      if (rate > caseloadRate) out.push({ grade: g.grade, category: c, count: g.flagged[c], students: g.students, rate, caseloadRate })
    }
  }
  return out.sort((a, b) => b.rate - b.caseloadRate - (a.rate - a.caseloadRate)).slice(0, limit)
}

/** The grade with the largest share of students in Tier 3, when grades differ. */
export function highestTier3Grade(results: Results): { grade: string; rate: number } | null {
  const grades = results.byGrade.filter((g) => g.students >= MIN_GROUP)
  if (grades.length < 2) return null
  const top = [...grades].sort((a, b) => b.tiers[3] / b.students - a.tiers[3] / a.students)[0]
  return top.tiers[3] > 0 ? { grade: top.grade, rate: top.tiers[3] / top.students } : null
}

// ---- Where to start ----

/**
 * A short list to start with. Order: highest tier, then students whose tier
 * rose since the previous snapshot, then number of flags, then absence.
 */
export function startHere(results: Results, limit = 5): StudentResult[] {
  const num = (n: number | null, fallback: number) => n ?? fallback
  return results.students
    .filter((s) => s.latest.tier > 1)
    .sort(
      (a, b) =>
        b.latest.tier - a.latest.tier ||
        Number(b.change === 'up') - Number(a.change === 'up') ||
        b.latest.flags.length - a.latest.flags.length ||
        num(b.latest.absencePct, -1) - num(a.latest.absencePct, -1) ||
        num(a.latest.gpa, 99) - num(b.latest.gpa, 99) ||
        a.key.localeCompare(b.key),
    )
    .slice(0, limit)
}

export const START_HERE_ORDER = 'Ordered by tier, then a tier that rose since the last snapshot, then number of flags, then absence.'

export const areaPhrase = (c: RuleCategory) => (c === 'attendance' ? 'chronically absent' : `flagged for ${RULE_LABELS[c].toLowerCase()}`)

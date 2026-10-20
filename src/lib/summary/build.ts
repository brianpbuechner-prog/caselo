// The de-identified summary: counts and rates only, built from the analysis
// results. It holds no names, IDs, or student-level rows, and every count is
// passed through small-cell suppression (suppress.ts). This object is what
// the summary page shows and downloads, and it is the only input the planned
// AI narrative (Phase 3) will read.

import { ruleDescriptions, type Thresholds } from '../../config/rules'
import type { Results } from '../compare/analyze'
import { RULE_CATEGORIES, type RuleCategory, type Tier } from '../rules/engine'
import { complementary, primary, type Cell } from './suppress'

export const TIERS: Tier[] = [3, 2, 1]

export type CategoryCells = Partial<Record<RuleCategory, Cell>>

export interface GradeRow {
  grade: string
  students: Cell
  tiers: Record<Tier, Cell>
  flagged: CategoryCells
}

export interface PairCell {
  categories: [RuleCategory, RuleCategory]
  cell: Cell
}

export interface SummaryChange {
  from: string
  /** Students in both snapshots. Changes count only these. */
  inBoth: Cell
  /** Rules with data in both snapshots. */
  compared: RuleCategory[]
  /** Rules run in the latest snapshot but not the earlier one. */
  notCompared: RuleCategory[]
  previous: CategoryCells
  latest: CategoryCells
  newlyFlagged: CategoryCells
  noLongerFlagged: CategoryCells
  tierUp: Cell
  tierDown: Cell
}

export interface DeidentifiedSummary {
  format: 'caselo-summary'
  version: 1
  label: string
  students: Cell
  /** Rules that ran, in the usual order. */
  rules: RuleCategory[]
  /** Rules with no data in the files. */
  missingRules: RuleCategory[]
  ruleText: string[]
  /** How tiers are assigned, in plain language. */
  tierText: string
  tiers: Record<Tier, Cell>
  flagged: CategoryCells
  /** Students flagged in both areas of each pair, most first. */
  pairs: PairCell[]
  change: SummaryChange | null
  byGrade: GradeRow[]
}

function categoryCells(rules: RuleCategory[], count: (c: RuleCategory) => number, of: number | null): CategoryCells {
  const out: CategoryCells = {}
  for (const c of rules) out[c] = primary(count(c), of)
  return out
}

/**
 * The tier rule in the summary's original wording. The summary is what the
 * AI draft sends, and its server check expects this form, so the on-screen
 * language change leaves it as is. The prompt tells the model which words
 * to use.
 */
export function summaryTierText(t: Thresholds): string {
  return `Tier 1: ${t.tier2MinFlags === 1 ? 'no flags' : `fewer than ${t.tier2MinFlags} flags`}. Tier 2: ${t.tier2MinFlags} or more ${t.tier2MinFlags === 1 ? 'flag' : 'flags'}. Tier 3: ${t.tier3MinFlags} or more.`
}

export function buildSummary(results: Results, t: Thresholds): DeidentifiedSummary {
  const last = results.summaries.length - 1
  const latest = results.summaries[last]
  const rules = RULE_CATEGORIES.filter((c) => latest.rules[c])
  const total = latest.students

  const students = primary(total)
  const tiers = { 3: primary(latest.tiers[3], total), 2: primary(latest.tiers[2], total), 1: primary(latest.tiers[1], total) }
  const flagged = categoryCells(rules, (c) => latest.flagged[c], total)

  const byGrade: GradeRow[] = results.byGrade.map((g) => ({
    grade: g.grade,
    students: primary(g.students),
    tiers: { 3: primary(g.tiers[3], g.students), 2: primary(g.tiers[2], g.students), 1: primary(g.tiers[1], g.students) },
    flagged: categoryCells(rules, (c) => g.flagged[c], g.students),
  }))

  // Groups of cells that add up to a total the reader can see.
  const groups: Cell[][] = []
  const shown = (c: Cell) => c.kind === 'shown'
  if (shown(students)) {
    groups.push(TIERS.map((k) => tiers[k]))
    groups.push(byGrade.map((g) => g.students))
  }
  for (const g of byGrade) if (shown(g.students)) groups.push(TIERS.map((k) => g.tiers[k]))
  for (const k of TIERS) if (shown(tiers[k])) groups.push(byGrade.map((g) => g.tiers[k]))
  for (const c of rules) if (shown(flagged[c]!)) groups.push(byGrade.map((g) => g.flagged[c]!))
  complementary(groups)

  // Pairs of areas, counted inclusively (a student flagged in all three counts in every pair).
  const pairs: PairCell[] = []
  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const a = rules[i]
      const b = rules[j]
      const n = results.students.filter((s) => s.latest.flags.some((f) => f.category === a) && s.latest.flags.some((f) => f.category === b)).length
      pairs.push({ categories: [a, b], cell: primary(n, total) })
    }
  }
  pairs.sort((x, y) => (y.cell.count ?? -1) - (x.cell.count ?? -1))

  let change: SummaryChange | null = null
  const tr = results.transitions
  if (tr && last > 0) {
    const prev = results.summaries[last - 1]
    change = {
      from: tr.from,
      inBoth: primary(tr.inBoth),
      compared: tr.comparable,
      notCompared: rules.filter((c) => !tr.comparable.includes(c)),
      previous: categoryCells(tr.comparable, (c) => prev.flagged[c], prev.students),
      latest: categoryCells(tr.comparable, (c) => latest.flagged[c], total),
      newlyFlagged: categoryCells(tr.comparable, (c) => tr.newlyFlagged[c], null),
      noLongerFlagged: categoryCells(tr.comparable, (c) => tr.noLongerFlagged[c], null),
      tierUp: primary(tr.tierUp),
      tierDown: primary(tr.tierDown),
    }
  }

  const desc = ruleDescriptions(t)
  return {
    format: 'caselo-summary',
    version: 1,
    label: latest.label,
    students,
    rules,
    missingRules: results.missingRules,
    ruleText: rules.map((c) => desc[c]),
    tierText: summaryTierText(t),
    tiers,
    flagged,
    pairs,
    change,
    byGrade,
  }
}

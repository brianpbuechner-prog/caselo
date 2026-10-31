// The de-identified summary with small-cell suppression, checked on many
// synthetic caseloads. The checks read the summary the way someone holding
// only the PDF or the AI payload could: anything they can work out from
// what is shown counts as shown.

import { describe, expect, test } from 'vitest'
import { DEFAULT_THRESHOLDS as T } from '../src/config/rules'
import { analyze, type Results } from '../src/lib/compare/analyze'
import type { Snapshot, StudentRow } from '../src/lib/model'
import type { RuleCategory } from '../src/lib/rules/engine'
import type { Category } from '../src/lib/sis/types'
import { buildSummary, TIERS, type DeidentifiedSummary } from '../src/lib/summary/build'
import { MIN_CELL, type Cell } from '../src/lib/summary/suppress'
import { checkSummary } from '../src/lib/ai/validate'
import { payloadText } from '../src/lib/ai/client'
import { fakeName, rng, studentRow } from './helpers/synthetic'

const CATS: Category[] = ['identity', 'attendanceSummary', 'gpa', 'behavior']

/** A snapshot of synthetic students with grade sizes and signal rates from the seed. */
function snapshot(seed: number, label: string, opts: { sizes?: Record<string, number>; start?: number } = {}): Snapshot {
  const r = rng(seed)
  const sizes = opts.sizes ?? Object.fromEntries(['6', '7', '8', '9'].map((g) => [g, Math.floor(r() ** 2 * 120)]))
  const pAbs = 0.05 + r() * 0.3
  const pGpa = 0.05 + r() * 0.3
  const pBeh = 0.05 + r() * 0.3
  const students = new Map<string, StudentRow>()
  let i = opts.start ?? 0
  for (const [grade, n] of Object.entries(sizes)) {
    for (let k = 0; k < n; k++, i++) {
      const name = fakeName(i)
      const key = String(9100000 + i)
      students.set(
        key,
        studentRow({
          key,
          lastName: name.last,
          firstName: name.first,
          stateId: String(9900000000 + i),
          grade,
          absencePct: r() < pAbs ? 10 + r() * 20 : r() * 9,
          unweightedGPA: r() < pGpa ? 0.5 + r() * 1.4 : 2 + r() * 2,
          incidents: r() < pBeh ? 3 + Math.floor(r() * 4) : Math.floor(r() * 3),
        }),
      )
    }
  }
  return { label, categories: CATS, files: [], students }
}

function build(snaps: Snapshot[]): { results: Results; summary: DeidentifiedSummary } {
  const results = analyze(snaps, T)
  return { results, summary: buildSummary(results, T) }
}

const RULES: RuleCategory[] = ['attendance', 'academics', 'behavior']

/** Every published cell with its true count, for comparison. */
function cellsWithTruth(results: Results, s: DeidentifiedSummary): { name: string; cell: Cell; truth: number; of: number | null }[] {
  const last = results.summaries.at(-1)!
  const out: { name: string; cell: Cell; truth: number; of: number | null }[] = [{ name: 'students', cell: s.students, truth: last.students, of: null }]
  for (const k of TIERS) out.push({ name: `tier ${k}`, cell: s.tiers[k], truth: last.tiers[k], of: last.students })
  for (const c of s.rules) out.push({ name: `flagged ${c}`, cell: s.flagged[c]!, truth: last.flagged[c], of: last.students })
  for (const [i, g] of s.byGrade.entries()) {
    const t = results.byGrade[i]
    out.push({ name: `grade ${g.grade} students`, cell: g.students, truth: t.students, of: null })
    for (const k of TIERS) out.push({ name: `grade ${g.grade} tier ${k}`, cell: g.tiers[k], truth: t.tiers[k], of: t.students })
    for (const c of s.rules) out.push({ name: `grade ${g.grade} ${c}`, cell: g.flagged[c]!, truth: t.flagged[c], of: t.students })
  }
  return out
}

interface Equation {
  /** Cells that add up to the total. */
  parts: Cell[]
  total: Cell
}

/** Sums the summary's reader can check: rows and columns that add up. */
function equations(s: DeidentifiedSummary): Equation[] {
  const eq: Equation[] = [
    { parts: TIERS.map((k) => s.tiers[k]), total: s.students },
    { parts: s.byGrade.map((g) => g.students), total: s.students },
  ]
  for (const g of s.byGrade) eq.push({ parts: TIERS.map((k) => g.tiers[k]), total: g.students })
  for (const k of TIERS) eq.push({ parts: s.byGrade.map((g) => g.tiers[k]), total: s.tiers[k] })
  for (const c of s.rules) eq.push({ parts: s.byGrade.map((g) => g.flagged[c]!), total: s.flagged[c]! })
  return eq
}

/**
 * Work out every number a reader could, starting from the shown cells.
 * With `rates`, a shown count and its rate also give the denominator
 * (count / rate), as a reader could do with a calculator.
 */
function recover(results: Results, s: DeidentifiedSummary, rates: boolean): Map<Cell, number> {
  const known = new Map<Cell, number>()
  for (const { cell } of cellsWithTruth(results, s)) if (cell.kind === 'shown') known.set(cell, cell.count!)
  const eqs = equations(s)
  const rateLinks: { cell: Cell; of: Cell }[] = []
  for (const k of TIERS) rateLinks.push({ cell: s.tiers[k], of: s.students })
  for (const c of s.rules) rateLinks.push({ cell: s.flagged[c]!, of: s.students })
  for (const g of s.byGrade) {
    for (const k of TIERS) rateLinks.push({ cell: g.tiers[k], of: g.students })
    for (const c of s.rules) rateLinks.push({ cell: g.flagged[c]!, of: g.students })
  }
  let changed = true
  while (changed) {
    changed = false
    for (const e of eqs) {
      const unknown = e.parts.filter((p) => !known.has(p))
      if (known.has(e.total) && unknown.length === 1) {
        known.set(unknown[0], known.get(e.total)! - e.parts.filter((p) => known.has(p)).reduce((n, p) => n + known.get(p)!, 0))
        changed = true
      } else if (!known.has(e.total) && unknown.length === 0) {
        known.set(e.total, e.parts.reduce((n, p) => n + known.get(p)!, 0))
        changed = true
      }
    }
    if (rates) {
      for (const l of rateLinks) {
        if (!known.has(l.of) && l.cell.kind === 'shown' && l.cell.rate) {
          known.set(l.of, Math.round(l.cell.count! / l.cell.rate))
          changed = true
        }
      }
    }
  }
  return known
}

/** Cells that are not shown but that a reader can still work out. */
function exposed(results: Results, s: DeidentifiedSummary, rates: boolean): string[] {
  const known = recover(results, s, rates)
  return cellsWithTruth(results, s)
    .filter(({ cell, truth }) => cell.kind !== 'shown' && known.get(cell) === truth)
    .map(({ name, truth }) => `${name} = ${truth}`)
}

const SEEDS = Array.from({ length: 150 }, (_, i) => i + 1)
const caseloads = SEEDS.map((seed) => ({ seed, ...build([snapshot(seed * 3, 'Q1'), snapshot(seed * 3 + 1, 'Q2')]) }))

describe('every published number, on 150 synthetic caseloads', () => {
  test('shown counts are 10 or more and match the true count; other cells carry no number', () => {
    for (const { seed, results, summary } of caseloads) {
      for (const { name, cell, truth } of cellsWithTruth(results, summary)) {
        const where = `seed ${seed}, ${name}`
        if (cell.kind === 'shown') {
          expect(cell.count, where).toBe(truth)
          expect(cell.count!, where).toBeGreaterThanOrEqual(MIN_CELL)
        } else {
          expect(cell.count, where).toBeNull()
          expect(cell.rate, where).toBeNull()
          if (cell.kind === 'small') expect(truth, where).toBeLessThan(MIN_CELL)
        }
      }
    }
  })

  test('rates are exact, and only given when the group is 10 or more', () => {
    for (const { seed, results, summary } of caseloads) {
      for (const { name, cell, truth, of } of cellsWithTruth(results, summary)) {
        if (cell.kind !== 'shown' || cell.rate == null) continue
        expect(of, `seed ${seed}, ${name}`).not.toBeNull()
        expect(of!, `seed ${seed}, ${name}`).toBeGreaterThanOrEqual(MIN_CELL)
        expect(cell.rate, `seed ${seed}, ${name}`).toBeCloseTo(truth / of!, 12)
      }
    }
  })

  test('no row or column with a shown total has exactly one cell missing', () => {
    for (const { seed, summary } of caseloads) {
      for (const e of equations(summary)) {
        if (e.total.kind !== 'shown') continue
        expect(e.parts.filter((p) => p.kind !== 'shown').length, `seed ${seed}`).not.toBe(1)
      }
    }
  })

  test('change since the last snapshot is suppressed the same way', () => {
    for (const { seed, results, summary } of caseloads) {
      const tr = results.transitions!
      const ch = summary.change!
      const all: [string, Cell, number][] = [
        ['inBoth', ch.inBoth, tr.inBoth],
        ['tierUp', ch.tierUp, tr.tierUp],
        ['tierDown', ch.tierDown, tr.tierDown],
        ...RULES.flatMap((c): [string, Cell, number][] => [
          [`new ${c}`, ch.newlyFlagged[c]!, tr.newlyFlagged[c]],
          [`cleared ${c}`, ch.noLongerFlagged[c]!, tr.noLongerFlagged[c]],
        ]),
      ]
      for (const [name, cell, truth] of all) {
        if (truth < MIN_CELL) expect(cell.kind, `seed ${seed}, ${name}`).toBe('small')
        else expect(cell.count, `seed ${seed}, ${name}`).toBe(truth)
      }
    }
  })

  test('pairs count students with signals in both areas', () => {
    for (const { seed, results, summary } of caseloads) {
      for (const p of summary.pairs) {
        const [a, b] = p.categories
        const n = results.students.filter((s) => s.latest.flags.some((f) => f.category === a) && s.latest.flags.some((f) => f.category === b)).length
        if (n < MIN_CELL) expect(p.cell.kind, `seed ${seed}`).toBe('small')
        else expect(p.cell.count, `seed ${seed}`).toBe(n)
      }
    }
  })

  test('the summary passes the server check and holds no names or IDs', () => {
    for (const { seed, results, summary } of caseloads) {
      const text = payloadText(summary)
      expect(checkSummary(JSON.parse(text)), `seed ${seed}`).toBeNull()
      for (const s of results.students) {
        const r = s.latest.row
        for (const v of [r.lastName!, r.firstName!, r.studentNumber!, r.stateId!]) expect(text, `seed ${seed}`).not.toContain(v)
      }
    }
  })
})

describe('small caseloads', () => {
  test('under 10 students: nothing is shown, so nothing can be worked out', () => {
    const { results, summary } = build([snapshot(5, 'Q1', { sizes: { '9': 7 } })])
    for (const { cell } of cellsWithTruth(results, summary)) expect(cell.kind).not.toBe('shown')
    expect(exposed(results, summary, true)).toEqual([])
  })

  test('one grade under 10 hides a second grade count', () => {
    const { summary } = build([snapshot(9, 'Q1', { sizes: { '6': 40, '7': 25, '8': 4 } })])
    expect(summary.byGrade.map((g) => g.students.kind)).toEqual(['shown', 'hidden', 'small'])
  })
})

// Known bug (listed in the PR). A shown count keeps its rate even when its
// denominator was hidden by complementary suppression, so the hidden count
// is count / rate, and a small count can then be worked out by
// subtraction. The first test flips to failing once this is fixed; the
// second then needs its recorded number updated.
describe('known bugs: hidden counts that can still be worked out', () => {
  /** Students with a set number of signals, by grade: [none, one, two]. */
  function layout(byGrade: Record<string, [number, number, number]>): Snapshot {
    const students = new Map<string, StudentRow>()
    let i = 0
    for (const [grade, counts] of Object.entries(byGrade)) {
      counts.forEach((n, signals) => {
        for (let k = 0; k < n; k++, i++) {
          const key = String(9100000 + i)
          students.set(key, studentRow({ key, lastName: fakeName(i).last, grade, absencePct: signals >= 1 ? 20 : 1, unweightedGPA: signals === 2 ? 1 : 3, incidents: 0 }))
        }
      })
    }
    return { label: 'Q1', categories: CATS, files: [], students }
  }

  // Grade 8 has 6 students, so grade 7 (60) is hidden as "*". Grade 7's
  // "needs support now" count stays shown as 15 with a rate of 25%, so
  // grade 7 = 15 / 0.25 = 60, and grade 8 = 186 - 120 - 60 = 6.
  test.fails('a hidden grade count follows from a shown count and its rate', () => {
    const { results, summary } = build([layout({ '6': [80, 25, 15], '7': [30, 15, 15], '8': [6, 0, 0] })])
    expect(summary.byGrade[1].students.kind).toBe('hidden')
    expect(exposed(results, summary, true)).toEqual([])
  })

  test('how often, across the 150 random caseloads', () => {
    const bySums = caseloads.filter(({ results, summary }) => exposed(results, summary, false).length > 0).length
    const withRates = caseloads.filter(({ results, summary }) => exposed(results, summary, true).length > 0).length
    // Recorded when this suite was written: 0 of 150 from sums alone, 15 of 150 with rates.
    expect([bySums, withRates]).toEqual([0, 15])
  })
})

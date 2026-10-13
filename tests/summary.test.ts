import { beforeAll, describe, expect, test } from 'vitest'
import { DEFAULT_THRESHOLDS } from '../src/config/rules'
import { analyze, type Results } from '../src/lib/compare/analyze'
import { buildSnapshots } from '../src/lib/grouping/snapshots'
import { infiniteCampus } from '../src/lib/sis/infinite-campus/fields'
import { buildSummary, TIERS, type DeidentifiedSummary } from '../src/lib/summary/build'
import { cellText, complementary, primary, rateText, type Cell } from '../src/lib/summary/suppress'
import { createNodeRunner } from './helpers/node-db'
import { parseSimple, sampleUpload } from './helpers/samples'

let results: Results
let summary: DeidentifiedSummary
beforeAll(async () => {
  const db = await createNodeRunner()
  const files = [sampleUpload('ic-students-q1.csv', 'Q1'), sampleUpload('ic-students-q2.csv', 'Q2'), sampleUpload('ic-behavior-q2.csv', 'Q2')]
  const { snapshots } = await buildSnapshots(db, files, infiniteCampus)
  results = analyze(snapshots, DEFAULT_THRESHOLDS)
  summary = buildSummary(results, DEFAULT_THRESHOLDS)
})

const texts = (cells: Cell[]) => cells.map(cellText)

describe('suppression rules', () => {
  test('counts under 10, including 0, show as <10 with no rate', () => {
    expect(cellText(primary(0, 100))).toBe('<10')
    expect(cellText(primary(9, 100))).toBe('<10')
    expect(rateText(primary(9, 100))).toBe('')
    expect(cellText(primary(10, 100))).toBe('10')
    expect(rateText(primary(10, 100))).toBe('10%')
  })

  test('a lone hidden count in a group hides the smallest shown one', () => {
    const row = [primary(3), primary(16), primary(58)]
    complementary([row])
    expect(texts(row)).toEqual(['<10', '*', '58'])
  })

  test('hiding in a row can force hiding in a column', () => {
    // Two rows, two columns. Row 1 has a small cell; its complement sits in
    // column 2, which then leaves column 2's other cell alone and exposed.
    const a = primary(5), b = primary(20), c = primary(30), d = primary(40)
    complementary([[a, b], [c, d], [a, c], [b, d]])
    for (const g of [[a, b], [c, d], [a, c], [b, d]]) expect(g.filter((x) => x.kind !== 'shown').length).not.toBe(1)
  })

  test('nothing changes when two or more are already hidden', () => {
    const row = [primary(3), primary(4), primary(50)]
    complementary([row])
    expect(texts(row)).toEqual(['<10', '<10', '50'])
  })
})

describe('summary from the sample data', () => {
  test('overall tiers and flags', () => {
    expect(summary.label).toBe('Q2')
    expect(cellText(summary.students)).toBe('301')
    expect(TIERS.map((k) => cellText(summary.tiers[k]))).toEqual(['31', '66', '204'])
    expect(rateText(summary.tiers[3])).toBe('10%')
    expect(cellText(summary.flagged.attendance!)).toBe('69')
    expect(rateText(summary.flagged.attendance!)).toBe('23%')
    expect(cellText(summary.flagged.behavior!)).toBe('21')
  })

  test('grade table matches the mockup', () => {
    const row = (g: string) => summary.byGrade.find((r) => r.grade === g)!
    const tiers = (g: string) => TIERS.map((k) => cellText(row(g).tiers[k]))
    expect(tiers('9')).toEqual(['12', '16', '51'])
    expect(tiers('10')).toEqual(['<10', '*', '49'])
    expect(tiers('11')).toEqual(['<10', '*', '58'])
    expect(tiers('12')).toEqual(['<10', '*', '46'])
    expect(['9', '10', '11', '12'].map((g) => cellText(row(g).flagged.academics!))).toEqual(['14', '*', '<10', '11'])
    expect(['9', '10', '11', '12'].map((g) => cellText(row(g).flagged.behavior!))).toEqual(['<10', '<10', '<10', '<10'])
  })

  test('change since Q1', () => {
    const c = summary.change!
    expect(c.from).toBe('Q1')
    expect(c.compared).toEqual(['attendance', 'academics'])
    expect(c.notCompared).toEqual(['behavior'])
    expect(rateText(c.previous.attendance!)).toBe('21%')
    expect(rateText(c.latest.attendance!)).toBe('23%')
    expect(cellText(c.newlyFlagged.attendance!)).toBe('10')
    expect(cellText(c.noLongerFlagged.attendance!)).toBe('<10')
    expect(cellText(c.tierUp)).toBe('17')
    expect(cellText(c.tierDown)).toBe('<10')
  })

  test('the most common pair comes first', () => {
    expect(summary.pairs[0].categories).toEqual(['attendance', 'academics'])
    expect(cellText(summary.pairs[0].cell)).toBe('25')
    expect(summary.pairs.slice(1).map((p) => cellText(p.cell))).toEqual(['<10', '<10'])
  })

  test('no hidden count can be worked out from a shown total', () => {
    const groups: Cell[][] = [TIERS.map((k) => summary.tiers[k]), summary.byGrade.map((g) => g.students)]
    for (const g of summary.byGrade) groups.push(TIERS.map((k) => g.tiers[k]))
    for (const k of TIERS) if (summary.tiers[k].kind === 'shown') groups.push(summary.byGrade.map((g) => g.tiers[k]))
    for (const c of summary.rules) if (summary.flagged[c]!.kind === 'shown') groups.push(summary.byGrade.map((g) => g.flagged[c]!))
    for (const g of groups) expect(g.filter((x) => x.kind !== 'shown').length).not.toBe(1)
  })

  test('contains no names or student IDs', () => {
    const json = JSON.stringify(summary)
    const rows = [...parseSimple('ic-students-q1.csv'), ...parseSimple('ic-students-q2.csv')]
    for (const r of rows) {
      expect(json).not.toContain(`"${r['student.studentNumber']}"`)
      expect(json).not.toContain(r['student.stateID'])
      expect(json).not.toContain(r['student.lastName'])
      expect(json).not.toContain(r['student.firstName'])
    }
    // No raw counts of hidden cells leak through either.
    for (const g of summary.byGrade) for (const k of TIERS) if (g.tiers[k].kind !== 'shown') expect(g.tiers[k].count).toBeNull()
  })
})

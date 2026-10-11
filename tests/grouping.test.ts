import { beforeAll, describe, expect, test } from 'vitest'
import type { SqlRunner } from '../src/lib/db/types'
import { buildUpload } from '../src/lib/files/read'
import { processFile } from '../src/lib/grouping/rollup'
import { buildSnapshots } from '../src/lib/grouping/snapshots'
import { infiniteCampus } from '../src/lib/sis/infinite-campus/fields'
import { createNodeRunner } from './helpers/node-db'
import { parseSimple, sampleUpload } from './helpers/samples'

let db: SqlRunner
beforeAll(async () => {
  db = await createNodeRunner()
})

describe('row shape and grouping', () => {
  test('student file is one row per student', async () => {
    const { summary, rows } = await processFile(db, sampleUpload('ic-students-q1.csv', 'Q1'), 0, infiniteCampus)
    const raw = parseSimple('ic-students-q1.csv')
    expect(summary.shape).toBe('one-per-student')
    expect(summary.rows).toBe(raw.length)
    expect(rows).toHaveLength(raw.length)
    const first = raw[0]
    const row = rows.find((r) => r.key === first['student.studentNumber'])!
    expect(row.absencePct).toBeCloseTo(Number(first['attChronicAbsenteeism.absenteeismPercentage']), 5)
    expect(row.districtChronic).toBe(first['attChronicAbsenteeism.chronicallyAbsent'] === '1')
  })

  test('behavior file is many rows per student and counts distinct incidents', async () => {
    const { summary, rows } = await processFile(db, sampleUpload('ic-behavior-q2.csv', 'Q2'), 0, infiniteCampus)
    const raw = parseSimple('ic-behavior-q2.csv')
    const expected = new Map<string, Set<string>>()
    for (const r of raw) {
      const id = r['student.studentNumber']
      if (!expected.has(id)) expected.set(id, new Set())
      expected.get(id)!.add(r['behaviorDetail.incidentID'])
    }
    expect(summary.shape).toBe('many-per-student')
    expect(rows).toHaveLength(expected.size)
    // Some incidents span two rows; counts must use distinct IDs.
    const totalIncidents = [...expected.values()].reduce((n, s) => n + s.size, 0)
    expect(raw.length).toBeGreaterThan(totalIncidents)
    for (const r of rows) expect(r.incidents, r.key).toBe(expected.get(r.key)!.size)
  })

  test('renamed tab file gives the same values as the default file', async () => {
    const a = await processFile(db, sampleUpload('ic-students-q1.csv', 'Q1'), 0, infiniteCampus)
    const b = await processFile(db, sampleUpload('ic-students-renamed.tsv', 'Q1'), 1, infiniteCampus)
    const byKey = new Map(b.rows.map((r) => [r.key, r]))
    for (const r of a.rows) {
      const o = byKey.get(r.key)!
      expect(o.absencePct).toBeCloseTo(r.absencePct!, 5)
      expect(o.districtChronic).toBe(r.districtChronic) // Y/N parsed like 1/0
      expect(o.unweightedGPA).toBe(r.unweightedGPA)
    }
  })

  test('collapses duplicate rows, scales fractional percentages, and normalizes grades', async () => {
    const text = [
      'student.studentNumber|student.lastName|student.grade|attChronicAbsenteeism.absenteeismPercentage|attChronicAbsenteeism.scheduledDays',
      '1|Dahl|09|0.125|40',
      '1|Dahl|09|0.100|20',
      '2|Vang|10|0.05|40',
      '3|Lor|11|0.2|40',
      '4|Abdi|12|0|40',
      '5|Thao|12|0.01|40',
      '6|Okafor|10|0.03|40',
      '|NoId|9|0.3|40',
    ].join('\n')
    const f = buildUpload('dupes.txt', text, infiniteCampus, 'Q1')
    const { summary, rows } = await processFile(db, f, 0, infiniteCampus)
    expect(summary.shape).toBe('one-per-student')
    expect(summary.rowsWithoutId).toBe(1)
    expect(rows).toHaveLength(6)
    const one = rows.find((r) => r.key === '1')!
    expect(one.absencePct).toBeCloseTo(12.5, 5) // row with the most scheduled days, as a percent
    expect(one.grade).toBe('9')
  })

  test('collects attendance detail marks per student', async () => {
    const text = [
      'student.studentNumber,AttendanceDetail.date,AttendanceDetail.code',
      '1,09/03/2025,UA',
      '1,09/04/2025,EX',
      '1,09/04/2025,EX',
      '2,09/05/2025,T',
    ].join('\n')
    const f = buildUpload('att.csv', text, infiniteCampus, 'Q1')
    const { summary, rows } = await processFile(db, f, 0, infiniteCampus)
    expect(summary.shape).toBe('many-per-student')
    expect(rows.find((r) => r.key === '1')!.attendanceMarks).toHaveLength(2)
  })
})

describe('snapshots', () => {
  test('files with the same label merge into one snapshot', async () => {
    const files = [
      sampleUpload('ic-students-q1.csv', 'Q1'),
      sampleUpload('ic-students-q2.csv', 'Q2'),
      sampleUpload('ic-behavior-q2.csv', 'Q2'),
    ]
    const { snapshots, warnings } = await buildSnapshots(db, files, infiniteCampus)
    expect(warnings).toEqual([])
    expect(snapshots.map((s) => s.label)).toEqual(['Q1', 'Q2'])
    expect(snapshots[1].categories.sort()).toEqual(['attendanceSummary', 'behavior', 'gpa', 'identity'])
    const q2 = parseSimple('ic-students-q2.csv')
    expect(snapshots[1].students.size).toBe(q2.length)
    const withIncidents = [...snapshots[1].students.values()].filter((r) => (r.incidents ?? 0) > 0)
    expect(withIncidents.length).toBeGreaterThan(0)
    expect(withIncidents.every((r) => r.absencePct != null)).toBe(true)
  })
})

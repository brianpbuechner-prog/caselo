import { beforeAll, describe, expect, test } from 'vitest'
import { DEFAULT_THRESHOLDS as T } from '../src/config/rules'
import { analyze, type Results } from '../src/lib/compare/analyze'
import { closeToLine, slippingQuietly } from '../src/lib/compare/insights'
import { movement, nearLine } from '../src/lib/compare/movement'
import { buildSnapshots } from '../src/lib/grouping/snapshots'
import type { StudentRow } from '../src/lib/model'
import { evaluate, type RuleCategory } from '../src/lib/rules/engine'
import { infiniteCampus } from '../src/lib/sis/infinite-campus/fields'
import type { Category } from '../src/lib/sis/types'
import { createNodeRunner } from './helpers/node-db'
import { sampleUpload } from './helpers/samples'

const CATS: Category[] = ['identity', 'attendanceSummary', 'gpa', 'behavior']
const ALL: RuleCategory[] = ['attendance', 'academics', 'behavior']
const row = (p: Partial<StudentRow>): StudentRow => ({
  key: '1', studentNumber: '1', stateId: null, lastName: 'A', firstName: 'B', grade: '7',
  absencePct: null, daysAbsent: null, scheduledDays: 44, districtChronic: null,
  cumGPA: null, unweightedGPA: null, incidents: 0, resolutionCodes: [], attendanceMarks: [], courses: [],
  ...p,
})
const ev = (p: Partial<StudentRow>) => evaluate(row(p), CATS, T)
const move = (a: Partial<StudentRow>, b: Partial<StudentRow>) => movement(ev(b), ev(a), ALL, { from: 'Q1', to: 'Q2' }, T)

describe('movement', () => {
  test('absence rising 3 points with no signal is slipping', () => {
    const m = move({ absencePct: 2, unweightedGPA: 3.2 }, { absencePct: 7.5, unweightedGPA: 3.2 })
    expect(m.direction).toBe('slipping')
    expect(m.reasons).toEqual(['Absent 2.0% in Q1, 7.5% in Q2'])
  })

  test('GPA drops and first incidents count as slipping', () => {
    expect(move({ unweightedGPA: 3.1 }, { unweightedGPA: 2.8 }).direction).toBe('slipping')
    expect(move({ incidents: 0 }, { incidents: 1 }).reasons).toEqual(['0 incidents in Q1, 1 incident in Q2'])
  })

  test('small changes are steady', () => {
    expect(move({ absencePct: 4, unweightedGPA: 3 }, { absencePct: 5.5, unweightedGPA: 2.85 }).direction).toBe('steady')
  })

  test('improving with nothing worse is gaining ground', () => {
    const m = move({ absencePct: 8, unweightedGPA: 2.4 }, { absencePct: 3, unweightedGPA: 2.9 })
    expect(m.direction).toBe('gaining')
    expect(m.reasons).toHaveLength(2)
  })

  test('losing a signal is finding footing', () => {
    const m = move({ absencePct: 14 }, { absencePct: 6 })
    expect(m.direction).toBe('finding')
    expect(m.reasons[0]).toBe('Attendance signal cleared')
  })

  test('early-year attendance swings are ignored', () => {
    expect(move({ absencePct: 0, scheduledDays: 12 }, { absencePct: 8, scheduledDays: 30 }).direction).toBe('steady')
  })

  test('close to a line', () => {
    expect(nearLine(ev({ absencePct: 8.5 }), T)).toEqual(['Absent 8.5%; the line is 10%'])
    expect(nearLine(ev({ unweightedGPA: 2.1 }), T)).toEqual(['GPA 2.10; the line is 2.00'])
    expect(nearLine(ev({ incidents: 2 }), T)).toEqual(['2 incidents; the line is 3'])
    expect(nearLine(ev({ absencePct: 12 }), T)).toEqual([])
    expect(nearLine(ev({ absencePct: 5 }), T)).toEqual([])
  })
})

describe('on the sample data', () => {
  let two: Results
  let one: Results
  beforeAll(async () => {
    const runner = await createNodeRunner()
    const files = [sampleUpload('ic-students-q1.csv', 'Q1'), sampleUpload('ic-students-q2.csv', 'Q2'), sampleUpload('ic-behavior-q2.csv', 'Q2')]
    two = analyze((await buildSnapshots(runner, files, infiniteCampus)).snapshots, T)
    one = analyze((await buildSnapshots(runner, files.slice(1), infiniteCampus)).snapshots, T)
  })

  test('finds students slipping without signals', () => {
    const s = slippingQuietly(two)
    expect(s.length).toBeGreaterThan(0)
    for (const r of s) {
      expect(r.latest.flags).toHaveLength(0)
      expect(r.movement!.reasons.length).toBeGreaterThan(0)
    }
  })

  test('one snapshot has no direction, only close to a line', () => {
    expect(one.students.every((s) => s.movement === null)).toBe(true)
    expect(closeToLine(one).length).toBeGreaterThan(0)
  })
})

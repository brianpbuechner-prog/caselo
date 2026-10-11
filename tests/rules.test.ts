import { beforeAll, describe, expect, test } from 'vitest'
import { DEFAULT_THRESHOLDS as T } from '../src/config/rules'
import { analyze } from '../src/lib/compare/analyze'
import { buildSnapshots } from '../src/lib/grouping/snapshots'
import type { Snapshot, StudentRow } from '../src/lib/model'
import { evaluate, isFailing } from '../src/lib/rules/engine'
import type { Category } from '../src/lib/sis/types'
import { infiniteCampus } from '../src/lib/sis/infinite-campus/fields'
import { createNodeRunner } from './helpers/node-db'
import { parseSimple, sampleUpload } from './helpers/samples'

const row = (patch: Partial<StudentRow>): StudentRow => ({
  key: '1',
  studentNumber: '1',
  stateId: null,
  lastName: 'Dahl',
  firstName: 'Ava',
  grade: '9',
  absencePct: null,
  daysAbsent: null,
  scheduledDays: null,
  districtChronic: null,
  cumGPA: null,
  unweightedGPA: null,
  incidents: null,
  resolutionCodes: [],
  attendanceMarks: [],
  courses: [],
  ...patch,
})
const ALL: Category[] = ['identity', 'attendanceSummary', 'gpa', 'behavior']

describe('rules engine', () => {
  test('chronic absence flags at exactly the threshold, not below', () => {
    expect(evaluate(row({ absencePct: 10 }), ALL, T).flags.map((f) => f.category)).toEqual(['attendance'])
    expect(evaluate(row({ absencePct: 9.99 }), ALL, T).flags).toEqual([])
  })

  test("uses the district's percentage first, then days, then counted rows", () => {
    expect(evaluate(row({ absencePct: 4, daysAbsent: 10, scheduledDays: 40 }), ALL, T).attendanceMethod).toBe('district')
    const days = evaluate(row({ daysAbsent: 5, scheduledDays: 40 }), ALL, T)
    expect(days.attendanceMethod).toBe('days')
    expect(days.absencePct).toBeCloseTo(12.5)
    const marks = Array.from({ length: 6 }, (_, i) => ({ date: `d${i}`, code: i < 4 ? 'UA' : 'T' }))
    const counted = evaluate(row({ scheduledDays: 40, attendanceMarks: marks }), ['identity', 'attendanceDetail'], { ...T, absenceCodes: ['UA'] })
    expect(counted.attendanceMethod).toBe('marks')
    expect(counted.absenceCount).toBe(4)
    expect(counted.absencePct).toBeCloseTo(10)
    expect(counted.flags).toHaveLength(1)
  })

  test('GPA uses the chosen source and falls back to the other', () => {
    expect(evaluate(row({ unweightedGPA: 1.9, cumGPA: 2.3 }), ALL, T).flags[0].reason).toMatch(/Unweighted GPA 1.90/)
    expect(evaluate(row({ unweightedGPA: 1.9, cumGPA: 2.3 }), ALL, { ...T, gpaSource: 'cumulative' }).flags).toEqual([])
    expect(evaluate(row({ cumGPA: 1.5 }), ALL, T).flags[0].reason).toMatch(/Cumulative GPA 1.50/)
  })

  test('failing grades count only when course grades are in the files', () => {
    const courses = [
      { course: 'Algebra I', grade: 'F' },
      { course: 'Biology', grade: '58' },
      { course: 'English 9', grade: 'B-' },
    ]
    const e = evaluate(row({ courses }), ['identity', 'courseGrades'], T)
    expect(e.failingCourses.map((c) => c.course)).toEqual(['Algebra I', 'Biology'])
    expect(e.flags[0].reason).toMatch(/2 failing grades/)
    expect(isFailing('F-', T)).toBe(true)
    expect(isFailing('D', T)).toBe(false)
    expect(isFailing('60', T)).toBe(false)
  })

  test('one flag per category; tiers follow the flag count', () => {
    const r = row({ absencePct: 15, unweightedGPA: 1.5, incidents: 4 })
    expect(evaluate(r, ALL, T).flags).toHaveLength(3)
    expect(evaluate(r, ALL, T).tier).toBe(3)
    expect(evaluate(row({ incidents: 3 }), ALL, T).tier).toBe(2)
    expect(evaluate(row({ incidents: 2 }), ALL, T).tier).toBe(1)
    expect(evaluate(r, ALL, { ...T, tier3MinFlags: 3 }).tier).toBe(3)
    expect(evaluate(row({ absencePct: 15, incidents: 4 }), ALL, { ...T, tier3MinFlags: 3 }).tier).toBe(2)
  })

  test('rules for missing categories do not run', () => {
    const e = evaluate(row({ absencePct: 50, incidents: 9 }), ['identity', 'gpa'], T)
    expect(e.flags).toEqual([])
    expect(e.incidents).toBeNull()
  })
})

describe('rules against the synthetic data', () => {
  let snapshots: Snapshot[]
  beforeAll(async () => {
    const db = await createNodeRunner()
    const files = [sampleUpload('ic-students-q1.csv', 'Q1'), sampleUpload('ic-students-q2.csv', 'Q2'), sampleUpload('ic-behavior-q2.csv', 'Q2')]
    snapshots = (await buildSnapshots(db, files, infiniteCampus)).snapshots
  })

  test('attendance and academic flag counts match an independent count', () => {
    const results = analyze(snapshots, T)
    const q1 = parseSimple('ic-students-q1.csv')
    const chronic = q1.filter((r) => Number(r['attChronicAbsenteeism.absenteeismPercentage']) >= 10).length
    const lowGpa = q1.filter((r) => {
      const u = r['unweightedGPA.cumGPA'] || r['cumGPA.cumGPA']
      return u !== '' && Number(u) < 2
    }).length
    expect(results.summaries[0].flagged.attendance).toBe(chronic)
    expect(results.summaries[0].flagged.academics).toBe(lowGpa)
    // The generator's district flag uses the same 10% line.
    expect(chronic).toBe(q1.filter((r) => r['attChronicAbsenteeism.chronicallyAbsent'] === '1').length)
  })

  test('behavior flags match students with 3 or more distinct incidents', () => {
    const results = analyze(snapshots, T)
    const counts = new Map<string, Set<string>>()
    for (const r of parseSimple('ic-behavior-q2.csv')) {
      const id = r['student.studentNumber']
      if (!counts.has(id)) counts.set(id, new Set())
      counts.get(id)!.add(r['behaviorDetail.incidentID'])
    }
    const expected = [...counts.values()].filter((s) => s.size >= 3).length
    expect(results.summaries[1].flagged.behavior).toBe(expected)
    expect(results.missingRules).toEqual([])
  })

  test('changing a threshold changes results deterministically', () => {
    const a = analyze(snapshots, T)
    const b = analyze(snapshots, { ...T, chronicAbsencePct: 20 })
    expect(b.summaries[1].flagged.attendance).toBeLessThan(a.summaries[1].flagged.attendance)
    expect(analyze(snapshots, T).summaries).toEqual(a.summaries)
  })

  test('change ignores categories missing from the earlier snapshot', () => {
    const results = analyze(snapshots, T)
    const tr = results.transitions!
    expect(tr.comparable).toEqual(['attendance', 'academics'])
    expect(tr.newlyFlagged.behavior).toBe(0)
    const ids1 = new Set(parseSimple('ic-students-q1.csv').map((r) => r['student.studentNumber']))
    const ids2 = new Set(parseSimple('ic-students-q2.csv').map((r) => r['student.studentNumber']))
    expect(tr.onlyInLatest).toBe([...ids2].filter((x) => !ids1.has(x)).length)
    expect(tr.onlyInPrevious).toBe([...ids1].filter((x) => !ids2.has(x)).length)
  })
})

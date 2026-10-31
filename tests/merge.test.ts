// Merging up to four files: files with the same label join into one
// snapshot by student ID, and different labels become snapshots compared in
// school-year order. All files are generated from synthetic students.

import { beforeAll, describe, expect, test } from 'vitest'
import { MAX_FILES } from '../src/components/common'
import { DEFAULT_THRESHOLDS as T } from '../src/config/rules'
import { analyze } from '../src/lib/compare/analyze'
import type { SqlRunner } from '../src/lib/db/types'
import { planSnapshots } from '../src/lib/grouping/plan'
import { buildSnapshots } from '../src/lib/grouping/snapshots'
import { infiniteCampus } from '../src/lib/sis/infinite-campus/fields'
import { createNodeRunner } from './helpers/node-db'
import { BEHAVIOR_HEADER_SETS, behaviorText, caseload, STUDENT_HEADER_SETS, studentText, upload, type HeaderSet } from './helpers/synthetic'

let db: SqlRunner
beforeAll(async () => {
  db = await createNodeRunner()
})

const IC = STUDENT_HEADER_SETS['Infinite Campus defaults']
const BEH = BEHAVIOR_HEADER_SETS['Infinite Campus defaults']
const students = caseload({ count: 50, seed: 21 })
const pick = (keys: (keyof HeaderSet)[]): HeaderSet => Object.fromEntries(keys.map((k) => [k, IC[k]]))

function coursesText(list = students): string {
  const lines = ['student.studentNumber,grading.courseName,grading.score']
  list.forEach((s, i) => {
    lines.push(`${s.studentNumber},Synthetic Math,${i % 7 === 0 ? 'F' : 'B'}`)
    lines.push(`${s.studentNumber},Synthetic Art,A`)
  })
  return lines.join('\n') + '\n'
}

test('the app reads at most four files', () => {
  expect(MAX_FILES).toBe(4)
})

describe('four files, one snapshot', () => {
  const files = () => [
    upload('attendance_q1.csv', studentText(students, pick(['studentNumber', 'lastName', 'firstName', 'grade', 'absenteeismPercentage', 'scheduledDays'])), 'Q1'),
    upload('gpa_q1.csv', studentText(students, pick(['studentNumber', 'unweightedGPA'])), 'Q1'),
    upload('behavior_q1.csv', behaviorText(students, BEH), 'Q1'),
    upload('grades_q1.csv', coursesText(), 'Q1'),
  ]

  test('every student gets values from every file', async () => {
    const { snapshots, warnings } = await buildSnapshots(db, files(), infiniteCampus)
    expect(warnings).toEqual([])
    expect(snapshots).toHaveLength(1)
    const [snap] = snapshots
    expect(snap.categories.sort()).toEqual(['attendanceSummary', 'behavior', 'courseGrades', 'gpa', 'identity'])
    expect(snap.files).toHaveLength(4)
    expect(snap.students.size).toBe(students.length)
    for (const s of students) {
      const r = snap.students.get(s.studentNumber)!
      expect(r.lastName).toBe(s.lastName)
      expect(r.absencePct).toBeCloseTo(s.absenteeismPercentage, 5)
      expect(r.unweightedGPA).toBeCloseTo(s.unweightedGPA, 5)
      expect(r.incidents ?? 0).toBe(s.incidents) // null when the student had no incident rows
      expect(r.courses).toHaveLength(2)
    }
  })

  test('the plan keeps them together and goes straight to results', () => {
    const plan = planSnapshots(files(), infiniteCampus)
    expect(plan.ready).toBe(true)
    expect(new Set(plan.files.map((f) => f.label))).toEqual(new Set(['Q1']))
  })

  test('rules see all four sources', async () => {
    const { snapshots } = await buildSnapshots(db, files(), infiniteCampus)
    const results = analyze(snapshots, T)
    expect(results.missingRules).toEqual([])
    const failing = results.students.filter((r) => r.latest.failingCourses.length > 0)
    expect(failing.map((r) => r.key).sort()).toEqual(students.filter((_, i) => i % 7 === 0).map((s) => s.studentNumber).sort())
  })
})

describe('four files, four snapshots', () => {
  const terms = ['Q1', 'Q2', 'Q3', 'Q4']
  // Each term: same students, absence creeping up for the first ten.
  const term = (t: number) =>
    students.map((s, i) => (i < 10 ? { ...s, absenteeismPercentage: Math.round((s.absenteeismPercentage + t * 2) * 10) / 10 } : s))
  const files = () =>
    [3, 0, 2, 1].map((t) => upload(`students_${terms[t].toLowerCase()}.csv`, studentText(term(t), IC), terms[t]))

  test('uploaded out of order, compared in school-year order', async () => {
    const plan = planSnapshots(files().map((f) => ({ ...f, labelSource: 'name' as const })), infiniteCampus)
    expect(plan.ready).toBe(true)
    const { snapshots } = await buildSnapshots(db, plan.files, infiniteCampus)
    expect(snapshots.map((s) => s.label)).toEqual(terms)
    const results = analyze(snapshots, T)
    expect(results.labels).toEqual(terms)
    expect(results.transitions).toMatchObject({ from: 'Q3', to: 'Q4' })
    for (const r of results.students) expect(r.history).toHaveLength(4)
    const first = results.students.find((r) => r.key === students[0].studentNumber)!
    expect(first.history.map((h) => h!.absencePct)).toEqual([0, 1, 2, 3].map((t) => expect.closeTo(students[0].absenteeismPercentage + t * 2, 5)))
  })
})

describe('students who are not in every file', () => {
  test('a student in only one file of a snapshot still appears, with the other values missing', async () => {
    const files = [
      upload('a_q1.csv', studentText(students.slice(0, 30), IC), 'Q1'),
      upload('b_q1.csv', behaviorText(students.slice(20), BEH), 'Q1'),
    ]
    const { snapshots } = await buildSnapshots(db, files, infiniteCampus)
    const snap = snapshots[0]
    const withIncidents = students.slice(30).filter((s) => s.incidents > 0)
    expect(snap.students.size).toBe(30 + withIncidents.length)
    const onlyBehavior = snap.students.get(withIncidents[0].studentNumber)!
    expect(onlyBehavior.absencePct).toBeNull()
    expect(onlyBehavior.incidents).toBe(withIncidents[0].incidents)
    // In the student file but with no incidents: zero, since behavior was in the snapshot.
    const quiet = students.slice(0, 20).find((s) => s.incidents === 0)!
    const results = analyze(snapshots, T)
    expect(results.students.find((r) => r.key === quiet.studentNumber)!.latest.incidents).toBe(0)
  })

  test('two halves of a caseload with the same label combine without duplicates', async () => {
    const files = [upload('a_q1.csv', studentText(students.slice(0, 30), IC), 'Q1'), upload('b_q1.csv', studentText(students.slice(25), IC), 'Q1')]
    const { snapshots } = await buildSnapshots(db, files, infiniteCampus)
    expect(snapshots[0].students.size).toBe(students.length)
  })

  test('files keyed on different IDs are not matched, and Caselo says so', async () => {
    const files = [
      upload('a_q1.csv', studentText(students, pick(['studentNumber', 'grade', 'absenteeismPercentage'])), 'Q1'),
      upload('b_q1.csv', studentText(students, pick(['stateID', 'unweightedGPA'])), 'Q1'),
    ]
    const { snapshots, warnings } = await buildSnapshots(db, files, infiniteCampus)
    expect(warnings.join(' ')).toMatch(/student number and others by state ID/)
    expect(snapshots[0].students.size).toBe(students.length * 2)
  })

  test('when two files disagree, the first file with a value wins', async () => {
    const changed = students.map((s) => ({ ...s, absenteeismPercentage: 99 }))
    const files = [upload('a_q1.csv', studentText(students, IC), 'Q1'), upload('b_q1.csv', studentText(changed, IC), 'Q1')]
    const { snapshots } = await buildSnapshots(db, files, infiniteCampus)
    expect(snapshots[0].students.get(students[0].studentNumber)!.absencePct).toBeCloseTo(students[0].absenteeismPercentage, 5)
  })
})

describe('unlabeled files', () => {
  test('two student files and two behavior files with no labels are asked about', () => {
    const files = [
      upload('a.csv', studentText(students, IC), 'Snapshot 1'),
      upload('b.csv', studentText(students, IC), 'Snapshot 2'),
      upload('c.csv', behaviorText(students, BEH), 'Snapshot 3'),
      upload('d.csv', behaviorText(students, BEH), 'Snapshot 4'),
    ].map((f) => ({ ...f, labelSource: 'auto' as const }))
    const plan = planSnapshots(files, infiniteCampus)
    expect(plan.ready).toBe(false)
    expect(plan.reasons.join(' ')).toMatch(/more than one point in time/)
  })
})

// Known bug (listed in the PR): each file's incidents are counted by
// distinct incident ID, then files with the same label are added together
// (snapshots.ts mergeRows). An incident that appears in two files, such as
// overlapping date ranges exported twice, is counted twice and can push a
// student over the behavior line.
describe('known bug: the same incident in two files of one snapshot', () => {
  test.fails('is counted once', async () => {
    const files = [upload('beh_a_q1.csv', behaviorText(students, BEH), 'Q1'), upload('beh_b_q1.csv', behaviorText(students, BEH), 'Q1')]
    const { snapshots } = await buildSnapshots(db, files, infiniteCampus)
    const s = students.find((x) => x.incidents > 0)!
    expect(snapshots[0].students.get(s.studentNumber)!.incidents).toBe(s.incidents)
  })
})

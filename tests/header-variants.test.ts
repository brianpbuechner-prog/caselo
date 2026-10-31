// Automatic column detection across differently named SIS headers. The
// same synthetic caseload is written under each naming scheme, in shuffled
// column order, and must map to the same fields and the same values.

import { beforeAll, describe, expect, test } from 'vitest'
import type { SqlRunner } from '../src/lib/db/types'
import { isMapped, uncertainFields } from '../src/lib/mapping/detect'
import { processFile } from '../src/lib/grouping/rollup'
import { planSnapshots } from '../src/lib/grouping/plan'
import { infiniteCampus } from '../src/lib/sis/infinite-campus/fields'
import { createNodeRunner } from './helpers/node-db'
import { BEHAVIOR_HEADER_SETS, behaviorText, caseload, rng, STUDENT_HEADER_SETS, studentText, upload, type HeaderSet } from './helpers/synthetic'

let db: SqlRunner
beforeAll(async () => {
  db = await createNodeRunner()
})

const students = caseload({ count: 60, seed: 7 })

function shuffled<T>(list: T[], seed: number): T[] {
  const r = rng(seed)
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Field key to the column it should map to, for a header list. */
function expected(headers: HeaderSet, written: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [key, header] of Object.entries(headers)) out[key] = written.indexOf(header!)
  return out
}

describe.each(Object.entries(STUDENT_HEADER_SETS))('student file: %s', (name, headers) => {
  const order = shuffled(Object.keys(headers), name.length)
  const text = studentText(students, headers, { order })
  const file = upload(`${name}.csv`, text, 'Q1')
  const want = expected(headers, file.headers)

  test('every column maps to the right field', () => {
    for (const [key, index] of Object.entries(want)) {
      expect(file.mapping[key]?.index, `${key} <- "${headers[key as keyof HeaderSet]}"`).toBe(index)
    }
  })

  test('no other field takes a column', () => {
    const wanted = new Set(Object.keys(want))
    const extra = Object.entries(file.mapping).filter(([k, m]) => m.index != null && !wanted.has(k))
    expect(extra.map(([k, m]) => `${k} <- ${file.headers[m.index!]}`)).toEqual([])
  })

  test('goes straight to results without asking', () => {
    expect(uncertainFields(file.mapping)).toEqual([])
    expect(planSnapshots([file], infiniteCampus).ready).toBe(true)
  })

  test('reads the same values as the generator wrote', async () => {
    const { rows } = await processFile(db, file, 0, infiniteCampus)
    expect(rows).toHaveLength(students.length)
    const byKey = new Map(rows.map((r) => [r.key, r]))
    for (const s of students) {
      const r = byKey.get(s.studentNumber)!
      expect(r, s.studentNumber).toBeDefined()
      expect(r.stateId).toBe(s.stateID)
      expect(r.lastName).toBe(s.lastName)
      expect(r.grade).toBe(s.grade)
      expect(r.absencePct).toBeCloseTo(s.absenteeismPercentage, 5)
      expect(r.daysAbsent).toBe(s.daysAbsent)
      expect(r.scheduledDays).toBe(s.scheduledDays)
      expect(r.unweightedGPA).toBeCloseTo(s.unweightedGPA, 5)
      expect(r.cumGPA).toBeCloseTo(s.cumGPA, 5)
    }
  })
})

describe.each(Object.entries(BEHAVIOR_HEADER_SETS))('behavior file: %s', (name, headers) => {
  const text = behaviorText(students, headers)
  const file = upload(`${name}-behavior.csv`, text, 'Q1')

  test('maps the incident fields and counts incidents per student', async () => {
    const want = expected(headers, file.headers)
    for (const [key, index] of Object.entries(want)) expect(file.mapping[key]?.index, key).toBe(index)
    expect(uncertainFields(file.mapping)).toEqual([])
    const { summary, rows } = await processFile(db, file, 0, infiniteCampus)
    expect(summary.shape).toBe('many-per-student')
    const withIncidents = students.filter((s) => s.incidents > 0)
    expect(rows).toHaveLength(withIncidents.length)
    for (const s of withIncidents) expect(rows.find((r) => r.key === s.studentNumber)!.incidents, s.studentNumber).toBe(s.incidents)
  })
})

describe('detection does not depend on column order', () => {
  test('ten shuffles of the same file map the same way', () => {
    const headers = STUDENT_HEADER_SETS['District plain language']
    for (let seed = 1; seed <= 10; seed++) {
      const order = shuffled(Object.keys(headers), seed * 31)
      const file = upload('plain.csv', studentText(students, headers, { order }), 'Q1')
      for (const [key, header] of Object.entries(headers)) {
        expect(file.headers[file.mapping[key].index!], `seed ${seed}, ${key}`).toBe(header)
      }
    }
  })

  test('a file with only names and IDs has no data categories and is not guessed into one', () => {
    const headers: HeaderSet = { studentNumber: 'Student Number', lastName: 'Last Name', firstName: 'First Name' }
    const file = upload('ids.csv', studentText(students, headers), 'Q1')
    const dataKeys = infiniteCampus.fields.filter((f) => f.category !== 'identity').map((f) => f.key)
    expect(dataKeys.filter((k) => isMapped(file.mapping, k))).toEqual([])
  })
})

// Known bug (listed in the PR): the rule that reads "student_grade" as
// "student.grade" also turns "student_id" into "student.id", and "id" alone
// matches no field. A very common header goes unrecognized, so the file
// stops for review. These tests flip to failing once it is fixed; then
// change test.fails to test.
describe('known bug: student_id is not read as the student number', () => {
  for (const header of ['student_id', 'Student_ID']) {
    test.fails(`"${header}" maps to the student number`, () => {
      const headers: HeaderSet = { ...STUDENT_HEADER_SETS['lower snake case'], studentNumber: header }
      const file = upload('snake.csv', studentText(students, headers), 'Q1')
      expect(file.headers[file.mapping.studentNumber.index!]).toBe(header)
    })
  }
})

// Known gap (listed in the PR): "absence_pct" matches no alias ("pct
// absent" and "absence percent" do). With days absent and scheduled days
// also in the file, attendance still works from those.
describe('known gap: absence_pct is not read as the absence percentage', () => {
  test.fails('"absence_pct" maps to the absence percentage', () => {
    const headers: HeaderSet = { ...STUDENT_HEADER_SETS['lower snake case'], absenteeismPercentage: 'absence_pct' }
    const file = upload('snake.csv', studentText(students, headers), 'Q1')
    expect(file.headers[file.mapping.absenteeismPercentage.index!]).toBe('absence_pct')
  })
})

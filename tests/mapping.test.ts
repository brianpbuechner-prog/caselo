import { describe, expect, test } from 'vitest'
import { autoMap, presentCategories, studentKeyField } from '../src/lib/mapping/detect'
import { applyMappingJson, mappingToJson } from '../src/lib/mapping/json'
import { infiniteCampus } from '../src/lib/sis/infinite-campus/fields'
import { sampleUpload } from './helpers/samples'

const headerAt = (headers: string[], m: ReturnType<typeof autoMap>, key: string) => (m[key].index == null ? null : headers[m[key].index!])

describe('column detection', () => {
  test('matches every default Infinite Campus header in the student file', () => {
    const f = sampleUpload('ic-students-q1.csv', 'Q1')
    for (const key of ['studentNumber', 'stateID', 'lastName', 'firstName', 'grade', 'absenteeismPercentage', 'daysAbsent', 'scheduledDays', 'chronicallyAbsent', 'cumGPA', 'unweightedGPA']) {
      expect(f.mapping[key].method, key).toBe('default')
    }
    expect(headerAt(f.headers, f.mapping, 'cumGPA')).toBe('cumGPA.cumGPA')
    expect(headerAt(f.headers, f.mapping, 'unweightedGPA')).toBe('unweightedGPA.cumGPA')
    expect(presentCategories(f.mapping, infiniteCampus)).toEqual(['identity', 'attendanceSummary', 'gpa'])
  })

  test('finds behavior fields in the incident file', () => {
    const f = sampleUpload('ic-behavior-q2.csv', 'Q2')
    expect(presentCategories(f.mapping, infiniteCampus)).toEqual(['identity', 'behavior'])
    expect(f.mapping.incidentID.method).toBe('default')
    expect(studentKeyField(f.mapping, infiniteCampus)).toBe('studentNumber')
  })

  test('fuzzy matches renamed headers to the right fields', () => {
    const f = sampleUpload('ic-students-renamed.tsv', 'Q1')
    const expected: Record<string, string> = {
      studentNumber: 'Student Number',
      stateID: 'State ID',
      lastName: 'Last Name',
      firstName: 'First Name',
      grade: 'Grade Level',
      absenteeismPercentage: 'Absence %',
      daysAbsent: 'Days Absent',
      scheduledDays: 'Days Scheduled',
      chronicallyAbsent: 'Chronic Absentee (Y/N)',
      cumGPA: 'Cumulative GPA',
      unweightedGPA: 'Unweighted GPA',
    }
    for (const [key, header] of Object.entries(expected)) {
      expect(headerAt(f.headers, f.mapping, key), key).toBe(header)
      expect(f.mapping[key].method, key).toBe('fuzzy')
    }
    // The extra column is left alone.
    const used = Object.values(f.mapping).map((m) => m.index)
    expect(used).not.toContain(f.headers.indexOf('Homeroom'))
  })

  test('accepts a bare field name when the suffix is unique in the catalog', () => {
    const m = autoMap(['studentNumber', 'daysAbsent', 'cumGPA'], infiniteCampus)
    expect(m.studentNumber.method).toBe('default')
    expect(m.daysAbsent.method).toBe('default')
    // "cumGPA" ends both cumGPA.cumGPA and unweightedGPA.cumGPA, so it is not a default match.
    expect(m.cumGPA.method).not.toBe('default')
  })

  test('does not invent matches for unrelated headers', () => {
    const m = autoMap(['Homeroom', 'Counselor', 'Bus Route', 'Locker'], infiniteCampus)
    expect(Object.values(m).every((x) => x.index == null)).toBe(true)
  })
})

describe('mapping JSON', () => {
  test('round trips and applies to a file with the same headers', () => {
    const f = sampleUpload('ic-students-renamed.tsv', 'Q1')
    const json = JSON.parse(JSON.stringify(mappingToJson(f.mapping, f.headers, infiniteCampus)))
    expect(json.format).toBe('caselo-column-mapping')
    const empty = autoMap([], infiniteCampus)
    const blank = Object.fromEntries(Object.keys(empty).map((k) => [k, { index: null, method: 'none' as const, score: 0 }]))
    const { mapping, applied, missing } = applyMappingJson(json, f.headers, blank, infiniteCampus)
    expect(missing).toEqual([])
    expect(applied).toBe(11)
    for (const key of Object.keys(json.fields)) expect(mapping[key].index).toBe(f.mapping[key].index)
  })

  test('rejects files that are not mappings', () => {
    expect(() => applyMappingJson({ hello: 1 }, [], {}, infiniteCampus)).toThrow(/not a Caselo column mapping/)
  })
})

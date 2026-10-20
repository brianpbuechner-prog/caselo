import { describe, expect, test } from 'vitest'
import { autoMap, mapColumns, normalizeHeader, presentCategories, uncertainFields } from '../src/lib/mapping/detect'
import { buildUpload } from '../src/lib/files/read'
import { fieldFit, profileColumn } from '../src/lib/mapping/values'
import { infiniteCampus } from '../src/lib/sis/infinite-campus/fields'
import { sampleUpload } from './helpers/samples'

const field = (key: string) => infiniteCampus.fields.find((f) => f.key === key)!
const upload = (text: string) => buildUpload('test.csv', text, infiniteCampus, 'Snapshot 1')
const headerFor = (f: ReturnType<typeof upload>, key: string) => (f.mapping[key].index == null ? null : f.headers[f.mapping[key].index!])

describe('header names', () => {
  test('treats student_ and student. prefixes the same', () => {
    expect(normalizeHeader('student_studentNumber', ['student'])).toBe('student.studentNumber')
    expect(normalizeHeader('Student Number', ['student'])).toBe('Student Number')
    const m = autoMap(['student_studentNumber', 'student_grade', 'attChronicAbsenteeism_daysAbsent', 'cumGPA_cumGPA'], infiniteCampus)
    for (const key of ['studentNumber', 'grade', 'daysAbsent', 'cumGPA']) {
      expect(m[key].method, key).toBe('default')
      expect(m[key].confident, key).toBe(true)
    }
  })

  test('reads PowerSchool and Synergy style names', () => {
    const f = upload('Student_Number,State_StudentNumber,Grade_Level,Days Absent\n1001,55501,9,3\n1002,55502,10,0\n1003,55503,11,12\n')
    expect(headerFor(f, 'studentNumber')).toBe('Student_Number')
    expect(headerFor(f, 'stateID')).toBe('State_StudentNumber')
    expect(headerFor(f, 'grade')).toBe('Grade_Level')
    expect(uncertainFields(f.mapping)).toEqual([])

    const g = upload('Perm ID,Grade,Absences YTD\n2001,6,1\n2002,7,4\n2003,8,0\n')
    expect(headerFor(g, 'studentNumber')).toBe('Perm ID')
    expect(headerFor(g, 'grade')).toBe('Grade')
  })
})

describe('reading values', () => {
  test('profiles numbers, percents, and dates', () => {
    const p = profileColumn(['12.5%', '4', '', '0.75'])
    expect(p.filled).toBe(3)
    expect(p.numeric).toBe(1)
    expect(p.max).toBe(12.5)
    expect(profileColumn(['11/19/2025', '2025-12-01', '1/2/26']).dates).toBe(1)
  })

  test('judges fit by field', () => {
    expect(fieldFit(field('grade'), profileColumn(['9', '10', '11', '12', 'K']))).toBe('strong')
    expect(fieldFit(field('grade'), profileColumn(['A', 'B+', 'C']))).toBe('no')
    expect(fieldFit(field('courseGrade'), profileColumn(['A', 'B+', 'C-', 'F', 'P']))).toBe('strong')
    expect(fieldFit(field('cumGPA'), profileColumn(['3.25', '2.80', '3.95', '1.75']))).toBe('strong')
    expect(fieldFit(field('cumGPA'), profileColumn(['88', '92', '75']))).toBe('no')
    expect(fieldFit(field('chronicallyAbsent'), profileColumn(['Y', 'N', 'N']))).toBe('strong')
    expect(fieldFit(field('incidentDate'), profileColumn(['DET', 'OSS', 'ISS']))).toBe('no')
    expect(fieldFit(field('absenteeismPercentage'), profileColumn(['High', 'Low', 'Medium']))).toBe('no')
    // Too few values to judge.
    expect(fieldFit(field('grade'), profileColumn(['A', '', '']))).toBe('unknown')
  })

  test('a "Grade" column of letters is a course grade, not grade level', () => {
    const f = upload('Student Number,Course,Grade\n1,Algebra I,B+\n1,English 9,A\n2,Biology,C-\n2,Algebra I,F\n3,English 9,A-\n')
    expect(f.mapping.grade.index).toBeNull()
    expect(headerFor(f, 'courseGrade')).toBe('Grade')
    expect(headerFor(f, 'courseName')).toBe('Course')
    expect(presentCategories(f.mapping, infiniteCampus)).toContain('courseGrades')
    expect(uncertainFields(f.mapping)).toEqual([])
  })

  test('a "Grade" column of 9 to 12 stays grade level', () => {
    const f = upload('Student Number,Grade,Days Absent\n1,9,2\n2,10,0\n3,12,5\n')
    expect(headerFor(f, 'grade')).toBe('Grade')
    expect(f.mapping.grade.confident).toBe(true)
  })

  test('drops a name match the values contradict', () => {
    const f = upload('Student Number,Absence Rate,Days Absent\n1,High,2\n2,Low,0\n3,High,9\n')
    expect(f.mapping.absenteeismPercentage.index).toBeNull()
    expect(headerFor(f, 'daysAbsent')).toBe('Days Absent')
  })

  test('suggests a student ID from values but asks first', () => {
    const f = upload('Pupil,Days Absent,Days Scheduled\n50021,2,44\n50022,0,44\n50023,7,44\n50024,1,44\n')
    expect(headerFor(f, 'studentNumber')).toBe('Pupil')
    expect(f.mapping.studentNumber.method).toBe('values')
    expect(uncertainFields(f.mapping)).toEqual(['studentNumber'])
  })

  test('the bundled samples need no review', () => {
    for (const name of ['ic-students-q1.csv', 'ic-students-q2.csv', 'ic-behavior-q2.csv', 'ic-students-renamed.tsv']) {
      expect(uncertainFields(sampleUpload(name, 'Q1').mapping), name).toEqual([])
    }
  })

  test('header-only mapping still works without rows', () => {
    const m = mapColumns(['Student Number', 'Grade'], null, infiniteCampus)
    expect(m.grade.index).toBe(1)
  })
})

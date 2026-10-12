import { describe, expect, test } from 'vitest'
import { autoMap, presentCategories } from '../src/lib/mapping/detect'
import { infiniteCampus } from '../src/lib/sis/infinite-campus/fields'

/** The field a single header maps to on its own, or null. */
function fieldFor(header: string): string | null {
  const m = autoMap([header], infiniteCampus)
  return Object.keys(m).find((k) => m[k].index === 0) ?? null
}

// Header variants added in the alias growth pass, grouped by field.
const GROUPS: Record<string, string[]> = {
  studentNumber: ['Local Student ID', 'District Student ID', 'Stu ID'],
  stateID: ['State Student Number', 'Statewide ID', 'State Assigned ID'],
  lastName: ['Legal Last Name', 'LName'],
  firstName: ['Legal First Name', 'FName'],
  grade: ['Enrollment Grade', 'Grade Lvl'],
  absenteeismPercentage: ['Absenteeism Percentage', 'Percent Absenteeism', 'Chronic Absenteeism Percentage', 'Chronic Absence Rate', 'Percent of Days Absent'],
  daysAbsent: ['Number of Absences', 'Absence Count', 'Days Missed', 'Absences YTD'],
  scheduledDays: ['Scheduled Days', 'Days Possible', 'Possible Days', 'Instructional Days'],
  chronicallyAbsent: ['Chronically Absent', 'Chronic Absenteeism Flag', 'Is Chronically Absent'],
  cumGPA: ['Cumulative Grade Point Average', 'Overall GPA', 'GPA Cumulative'],
  unweightedGPA: ['GPA Unweighted', 'Cum GPA Unweighted', 'Unweighted Grade Point Average'],
  incidentID: ['Incident No', 'Behavior Incident Number'],
  incidentDate: ['Behavior Incident Date', 'Offense Date'],
  resolutionCode: ['Resolution Type', 'Resolution Name', 'Disciplinary Action', 'Action Taken'],
  attendanceDate: ['Date Absent', 'Mark Date', 'Attendance Day'],
  attendanceCode: ['Attendance Mark', 'Period Mark', 'Mark Code', 'Absence Type'],
  courseName: ['Course Description', 'Class Title'],
  courseGrade: ['Posted Grade', 'Term Grade', 'Grade Mark', 'Score List Item Name', 'grading.scoreListItemName'],
}

describe('alias groups', () => {
  test.each(Object.entries(GROUPS))('%s', (key, headers) => {
    for (const h of headers) expect(fieldFor(h), h).toBe(key)
  })
})

describe('documented Infinite Campus header names', () => {
  test('Grading Detail uses grading.*', () => {
    const headers = ['student.studentNumber', 'grading.courseNumber', 'grading.courseName', 'grading.task', 'grading.termName', 'grading.score', 'grading.percent']
    const m = autoMap(headers, infiniteCampus)
    expect(m.courseName).toMatchObject({ index: 2, method: 'default' })
    expect(m.courseGrade).toMatchObject({ index: 5, method: 'default' })
    expect(presentCategories(m, infiniteCampus)).toEqual(['identity', 'courseGrades'])
    // The percent column is a course percent, not an absence percent.
    expect(m.absenteeismPercentage.index).toBeNull()
  })

  test('the old guesses are no longer default names', () => {
    expect(autoMap(['gradingDetail.score'], infiniteCampus).courseGrade.method).not.toBe('default')
  })

  test('Learner Portfolio GPA fields', () => {
    const m = autoMap(['gpa.cumGpaBasic', 'gpa.cumGPAUnweighted'], infiniteCampus)
    expect(m.cumGPA).toMatchObject({ index: 0, method: 'default' })
    expect(m.unweightedGPA).toMatchObject({ index: 1, method: 'default' })
  })

  test('transcript scores are only a close match, for the user to check', () => {
    // Transcripts cover every year, so transcriptDetail.* is not a default name.
    expect(autoMap(['transcriptDetail.score'], infiniteCampus).courseGrade.method).toBe('fuzzy')
  })

  test('headers are matched without regard to case', () => {
    const m = autoMap(['student.studentnumber', 'student.lastname', 'GRADING.SCORE'], infiniteCampus)
    expect(m.studentNumber.method).toBe('default')
    expect(m.lastName.method).toBe('default')
    expect(m.courseGrade.method).toBe('default')
  })
})

describe('look-alike headers are not matched', () => {
  test.each([
    ['Attendance Rate', 'absenteeismPercentage'],
    ['Unexcused Absences', 'daysAbsent'],
    ['Class Rank', 'courseName'],
    ['Last Updated', 'lastName'],
    ['cumGPA.rank', 'cumGPA'],
  ])('%s is not %s', (header, key) => {
    expect(fieldFor(header)).not.toBe(key)
  })
})

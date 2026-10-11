// Shared data shapes. Everything here lives in memory only.

import type { ColumnMapping } from './mapping/detect'
import type { Delimiter } from './files/delimiter'
import type { Category } from './sis/types'

/** One uploaded file, before analysis. */
export interface UploadedFile {
  id: string
  fileName: string
  label: string
  text: string
  delimiter: Delimiter
  headers: string[]
  mapping: ColumnMapping
}

export interface AttendanceMark {
  date: string | null
  code: string | null
}

export interface CourseMark {
  course: string | null
  grade: string | null
}

/** One student after a file is grouped to one row per student. */
export interface StudentRow {
  key: string
  studentNumber: string | null
  stateId: string | null
  lastName: string | null
  firstName: string | null
  grade: string | null
  // Attendance summary
  absencePct: number | null
  daysAbsent: number | null
  scheduledDays: number | null
  districtChronic: boolean | null
  // GPA
  cumGPA: number | null
  unweightedGPA: number | null
  // Behavior
  incidents: number | null
  resolutionCodes: string[]
  // Attendance detail
  attendanceMarks: AttendanceMark[]
  // Course grades
  courses: CourseMark[]
}

export type FileShape = 'one-per-student' | 'many-per-student'

export interface FileSummary {
  fileId: string
  fileName: string
  label: string
  shape: FileShape
  rows: number
  students: number
  rowsWithoutId: number
  categories: Category[]
  keyField: string
}

/** All files sharing a label, merged to one record per student. */
export interface Snapshot {
  label: string
  categories: Category[]
  files: FileSummary[]
  students: Map<string, StudentRow>
}

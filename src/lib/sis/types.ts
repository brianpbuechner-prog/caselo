// Shared types for SIS field catalogs.
//
// A catalog lists every field Caselo knows for one SIS, grouped by category.
// Infinite Campus Ad Hoc exports are custom field selections, so a file is
// not one fixed "export type". Instead, Caselo checks which categories a
// file's columns cover. To support another SIS, write a new catalog and add
// it to registry.ts. Parsing, mapping, and rules code does not change.

export type Category =
  | 'identity'
  | 'attendanceSummary'
  | 'gpa'
  | 'behavior'
  | 'attendanceDetail'
  | 'courseGrades'

/** Student-level categories have one row per student. Event categories have many. */
export const EVENT_CATEGORIES: Category[] = ['behavior', 'attendanceDetail', 'courseGrades']

export const CATEGORY_LABELS: Record<Category, string> = {
  identity: 'Student identity',
  attendanceSummary: 'Attendance summary',
  gpa: 'GPA',
  behavior: 'Behavior incidents',
  attendanceDetail: 'Attendance detail',
  courseGrades: 'Course grades',
}

export type FieldKind = 'id' | 'text' | 'grade' | 'percent' | 'number' | 'flag' | 'date' | 'code'

export interface FieldSpec {
  /** Canonical key used across the app, e.g. "daysAbsent". */
  key: string
  label: string
  category: Category
  kind: FieldKind
  /** Header names the SIS produces by default, e.g. "student.grade". */
  defaultHeaders: string[]
  /** Plain-language names for fuzzy matching, e.g. "grade level". */
  aliases: string[]
  /** True when the default header name has not been confirmed against a real export. */
  unverified?: boolean
  note?: string
}

/**
 * A category is present in a file when every field in at least one of
 * these groups is mapped.
 */
export type CategoryRequirement = string[][]

export interface SisCatalog {
  id: string
  name: string
  /** Where exports come from in the SIS, shown in help text. */
  exportSources: string[]
  fields: FieldSpec[]
  requirements: Record<Category, CategoryRequirement>
  /** Field keys that identify a student, in order of preference. */
  studentKeys: string[]
}

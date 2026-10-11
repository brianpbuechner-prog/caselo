// Load one file into DuckDB and group it to one row per student.
//
// Files with one row per student pass through (duplicate rows for the same
// student are collapsed, keeping the row with the most scheduled days).
// Files with many rows per student are grouped: behavior incidents are
// counted by distinct incident ID, attendance marks and course grades are
// collected per student so the rules engine can count them with the
// current settings.

import type { SqlRunner } from '../db/types'
import { sqlString } from '../db/types'
import type { Delimiter } from '../files/delimiter'
import { hasEventCategory, isMapped, presentCategories, studentKeyField, type ColumnMapping } from '../mapping/detect'
import type { FileShape, FileSummary, StudentRow, UploadedFile } from '../model'
import type { SisCatalog } from '../sis/types'

/** A file is many-per-student when IDs repeat this much on average. */
const MANY_ROWS_RATIO = 1.2

function columnsSpec(count: number): string {
  const parts: string[] = []
  for (let i = 0; i < count; i++) parts.push(`'c${i}': 'VARCHAR'`)
  return '{' + parts.join(', ') + '}'
}

export async function loadRawTable(
  db: SqlRunner,
  table: string,
  virtualName: string,
  text: string,
  delimiter: Delimiter,
  columnCount: number,
): Promise<void> {
  await db.registerText(virtualName, text)
  await db.query(`
    CREATE OR REPLACE TABLE ${table} AS
    SELECT * FROM read_csv(${sqlString(virtualName)},
      delim = ${sqlString(delimiter)},
      quote = '"',
      escape = '"',
      header = false,
      skip = 1,
      auto_detect = false,
      columns = ${columnsSpec(columnCount)},
      null_padding = true,
      strict_mode = false,
      ignore_errors = false
    )`)
}

/** SQL expressions for each field, built from the column mapping. */
function exprs(mapping: ColumnMapping) {
  const col = (key: string) => (isMapped(mapping, key) ? `c${mapping[key].index}` : 'NULL')
  const txt = (key: string) => (isMapped(mapping, key) ? `NULLIF(TRIM(${col(key)}), '')` : 'CAST(NULL AS VARCHAR)')
  const num = (key: string) =>
    isMapped(mapping, key)
      ? `TRY_CAST(NULLIF(REPLACE(REPLACE(TRIM(${col(key)}), '%', ''), ',', ''), '') AS DOUBLE)`
      : 'CAST(NULL AS DOUBLE)'
  const flag = (key: string) =>
    isMapped(mapping, key)
      ? `CASE WHEN UPPER(TRIM(${col(key)})) IN ('1', 'Y', 'YES', 'TRUE', 'T', 'X') THEN TRUE
              WHEN UPPER(TRIM(${col(key)})) IN ('0', 'N', 'NO', 'FALSE', 'F') THEN FALSE END`
      : 'CAST(NULL AS BOOLEAN)'
  // "09" and "9" are the same grade; "KG" stays as is.
  const grade = isMapped(mapping, 'grade')
    ? `CASE WHEN TRY_CAST(${txt('grade')} AS INTEGER) IS NOT NULL
            THEN CAST(TRY_CAST(${txt('grade')} AS INTEGER) AS VARCHAR)
            ELSE UPPER(${txt('grade')}) END`
    : 'CAST(NULL AS VARCHAR)'
  return { txt, num, flag, grade }
}

export async function detectShape(
  db: SqlRunner,
  table: string,
  keyExpr: string,
  eventFile: boolean,
): Promise<{ shape: FileShape; rows: number; students: number; rowsWithoutId: number }> {
  const [r] = await db.query<{ rows: number; students: number; no_id: number }>(`
    SELECT COUNT(*)::DOUBLE AS rows,
           COUNT(DISTINCT ${keyExpr})::DOUBLE AS students,
           COUNT(*) FILTER (WHERE ${keyExpr} IS NULL)::DOUBLE AS no_id
    FROM ${table}`)
  const withId = r.rows - r.no_id
  const many = eventFile || (r.students > 0 && withId / r.students >= MANY_ROWS_RATIO)
  return { shape: many ? 'many-per-student' : 'one-per-student', rows: r.rows, students: r.students, rowsWithoutId: r.no_id }
}

interface RawRollup {
  student_key: string
  student_number: string | null
  state_id: string | null
  last_name: string | null
  first_name: string | null
  grade: string | null
  pct: number | null
  days_absent: number | null
  scheduled_days: number | null
  district_chronic: boolean | null
  cum_gpa: number | null
  unweighted_gpa: number | null
  incidents: number | null
  resolution_codes: string[] | null
  marks: { date: string | null; code: string | null }[] | null
  courses: { course: string | null; grade: string | null }[] | null
}

export async function rollupTable(
  db: SqlRunner,
  table: string,
  mapping: ColumnMapping,
  keyField: string,
  categories: string[],
): Promise<StudentRow[]> {
  const { txt, num, flag, grade } = exprs(mapping)
  const has = (c: string) => categories.includes(c)
  const key = txt(keyField)
  // For student-level values, prefer the row with the most scheduled days.
  const pick = (e: string) => `arg_max(${e}, COALESCE(${num('scheduledDays')}, 0))`

  const behavior = has('behavior')
    ? `COUNT(DISTINCT COALESCE(${txt('incidentID')}, ${txt('incidentDate')}))::DOUBLE`
    : 'NULL'
  const codes = has('behavior') && isMapped(mapping, 'resolutionCode')
    ? `list_sort(list_distinct(list(${txt('resolutionCode')}) FILTER (WHERE ${txt('resolutionCode')} IS NOT NULL)))`
    : 'NULL'
  const marks = has('attendanceDetail')
    ? `list_distinct(list({'date': ${txt('attendanceDate')}, 'code': ${txt('attendanceCode')}}))`
    : 'NULL'
  const courses = has('courseGrades')
    ? `list({'course': ${txt('courseName')}, 'grade': ${txt('courseGrade')}}) FILTER (WHERE ${txt('courseGrade')} IS NOT NULL)`
    : 'NULL'

  const rows = await db.query<RawRollup>(`
    SELECT
      ${key} AS student_key,
      ${pick(txt('studentNumber'))} AS student_number,
      ${pick(txt('stateID'))} AS state_id,
      ${pick(txt('lastName'))} AS last_name,
      ${pick(txt('firstName'))} AS first_name,
      ${pick(grade)} AS grade,
      ${pick(num('absenteeismPercentage'))} AS pct,
      ${pick(num('daysAbsent'))} AS days_absent,
      MAX(${num('scheduledDays')}) AS scheduled_days,
      ${pick(flag('chronicallyAbsent'))} AS district_chronic,
      ${pick(num('cumGPA'))} AS cum_gpa,
      ${pick(num('unweightedGPA'))} AS unweighted_gpa,
      ${behavior} AS incidents,
      ${codes} AS resolution_codes,
      ${marks} AS marks,
      ${courses} AS courses
    FROM ${table}
    WHERE ${key} IS NOT NULL
    GROUP BY ${key}
    ORDER BY ${key}`)

  // Some exports give the percentage as a fraction (0.125 instead of 12.5).
  const pcts = rows.map((r) => r.pct).filter((p): p is number => p != null)
  const fraction = pcts.length > 0 && pcts.every((p) => p <= 1) && pcts.some((p) => p > 0)

  return rows.map((r) => ({
    key: r.student_key,
    studentNumber: r.student_number,
    stateId: r.state_id,
    lastName: r.last_name,
    firstName: r.first_name,
    grade: r.grade,
    absencePct: r.pct == null ? null : fraction ? r.pct * 100 : r.pct,
    daysAbsent: r.days_absent,
    scheduledDays: r.scheduled_days,
    districtChronic: r.district_chronic,
    cumGPA: r.cum_gpa,
    unweightedGPA: r.unweighted_gpa,
    incidents: has('behavior') ? (r.incidents ?? 0) : null,
    resolutionCodes: r.resolution_codes ?? [],
    attendanceMarks: (r.marks ?? []).filter((m) => m.date != null || m.code != null),
    courses: r.courses ?? [],
  }))
}

/** Load, inspect, and group one uploaded file. Leaves nothing behind in DuckDB. */
export async function processFile(
  db: SqlRunner,
  file: UploadedFile,
  position: number,
  catalog: SisCatalog,
): Promise<{ summary: FileSummary; rows: StudentRow[] }> {
  const categories = presentCategories(file.mapping, catalog)
  const keyField = studentKeyField(file.mapping, catalog)
  if (!keyField) throw new Error(`${file.fileName}: no student number or state ID column is matched.`)

  const table = `raw_${position}`
  const virtualName = `upload_${position}.txt`
  try {
    await loadRawTable(db, table, virtualName, file.text, file.delimiter, file.headers.length)
    const keyExpr = `NULLIF(TRIM(c${file.mapping[keyField].index}), '')`
    const shape = await detectShape(db, table, keyExpr, hasEventCategory(categories))
    const rows = await rollupTable(db, table, file.mapping, keyField, categories)
    return {
      summary: {
        fileId: file.id,
        fileName: file.fileName,
        label: file.label,
        categories,
        keyField,
        ...shape,
      },
      rows,
    }
  } finally {
    await db.query(`DROP TABLE IF EXISTS ${table}`).catch(() => {})
    await db.dropFile(virtualName).catch(() => {})
  }
}

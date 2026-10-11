// Combine processed files into snapshots. Files that share a label (for
// example a Q2 student file and a Q2 behavior file) become one snapshot,
// joined on student ID. Snapshots keep the order their labels first appear.

import type { SqlRunner } from '../db/types'
import type { FileSummary, Snapshot, StudentRow, UploadedFile } from '../model'
import type { Category, SisCatalog } from '../sis/types'
import { processFile } from './rollup'

export function mergeRows(a: StudentRow, b: StudentRow): StudentRow {
  return {
    key: a.key,
    studentNumber: a.studentNumber ?? b.studentNumber,
    stateId: a.stateId ?? b.stateId,
    lastName: a.lastName ?? b.lastName,
    firstName: a.firstName ?? b.firstName,
    grade: a.grade ?? b.grade,
    absencePct: a.absencePct ?? b.absencePct,
    daysAbsent: a.daysAbsent ?? b.daysAbsent,
    scheduledDays: a.scheduledDays ?? b.scheduledDays,
    districtChronic: a.districtChronic ?? b.districtChronic,
    cumGPA: a.cumGPA ?? b.cumGPA,
    unweightedGPA: a.unweightedGPA ?? b.unweightedGPA,
    incidents: a.incidents == null && b.incidents == null ? null : (a.incidents ?? 0) + (b.incidents ?? 0),
    resolutionCodes: [...new Set([...a.resolutionCodes, ...b.resolutionCodes])].sort(),
    attendanceMarks: [...a.attendanceMarks, ...b.attendanceMarks],
    courses: [...a.courses, ...b.courses],
  }
}

/** Unique labels in the order they first appear. */
export function labelOrder(files: { label: string }[]): string[] {
  const seen: string[] = []
  for (const f of files) {
    const label = f.label.trim()
    if (!seen.includes(label)) seen.push(label)
  }
  return seen
}

export async function buildSnapshots(
  db: SqlRunner,
  files: UploadedFile[],
  catalog: SisCatalog,
): Promise<{ snapshots: Snapshot[]; warnings: string[] }> {
  const warnings: string[] = []
  const processed: { summary: FileSummary; rows: StudentRow[] }[] = []
  // One at a time keeps memory low and the DuckDB worker simple.
  for (let i = 0; i < files.length; i++) {
    processed.push(await processFile(db, files[i], i, catalog))
  }

  const keyFields = new Set(processed.map((p) => p.summary.keyField))
  if (keyFields.size > 1) {
    warnings.push(
      'Some files identify students by student number and others by state ID, so those files cannot be matched to each other. Include the same ID column in every export.',
    )
  }
  for (const p of processed) {
    if (p.summary.rowsWithoutId > 0) {
      warnings.push(`${p.summary.fileName}: ${p.summary.rowsWithoutId} rows have no student ID and were skipped.`)
    }
  }

  const snapshots: Snapshot[] = labelOrder(files).map((label) => {
    const inLabel = processed.filter((p) => p.summary.label.trim() === label)
    const students = new Map<string, StudentRow>()
    const categories = new Set<Category>()
    for (const p of inLabel) {
      p.summary.categories.forEach((c) => categories.add(c))
      for (const row of p.rows) {
        const existing = students.get(row.key)
        students.set(row.key, existing ? mergeRows(existing, row) : row)
      }
    }
    return { label, categories: [...categories], files: inLabel.map((p) => p.summary), students }
  })

  return { snapshots, warnings }
}

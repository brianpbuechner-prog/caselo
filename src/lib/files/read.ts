// Turn a chosen file into an UploadedFile: decode, detect delimiter, read
// headers, and auto-map columns. Spreadsheets are converted to CSV text
// first and then take the same path. Runs entirely in the browser.

import { autoMap, mapColumns, type ColumnMapping } from '../mapping/detect'
import { PROFILE_ROWS } from '../mapping/values'
import type { UploadedFile } from '../model'
import type { SisCatalog } from '../sis/types'
import { decodeText, rejectReason } from './decode'
import { dataLines, detectDelimiter, detectHeaderRow, readHeaders, splitLine, type Delimiter } from './delimiter'
import { isSpreadsheet, readWorkbook, type SheetText } from './workbook'

let counter = 0
const nextId = () => `f${++counter}`

/** Guess a snapshot label from a file name, e.g. "attendance_q2.csv" -> "Q2". */
export function guessLabel(fileName: string): string | null {
  const base = fileName.replace(/\.[^.]+$/, '')
  const m =
    base.match(/(?:^|[^a-z0-9])(q[1-4])(?:[^a-z0-9]|$)/i) ??
    base.match(/(?:^|[^a-z0-9])((?:s|t|sem|tri)[1-3])(?:[^a-z0-9]|$)/i) ??
    base.match(/(?:^|[^a-z])(fall|winter|spring|summer)(?:[^a-z]|$)/i)
  if (!m) return null
  const v = m[1]
  return v.length <= 4 ? v.toUpperCase() : v[0].toUpperCase() + v.slice(1).toLowerCase()
}

const matchedCount = (m: ColumnMapping) => Object.values(m).filter((x) => x.index != null).length

/** Header row, header names, and auto-mapping for text with a known delimiter. */
function readLayout(text: string, delimiter: Delimiter, catalog: SisCatalog) {
  const headerLine = detectHeaderRow(text, delimiter, (h) => matchedCount(autoMap(h, catalog)))
  const headers = readHeaders(text, delimiter, headerLine)
  const rows = dataLines(text, headerLine, PROFILE_ROWS).map((line) => splitLine(line, delimiter))
  return { delimiter, headerLine, headers, mapping: mapColumns(headers, rows, catalog) }
}

export function buildUpload(fileName: string, text: string, catalog: SisCatalog, label: string, delimiter?: Delimiter): UploadedFile {
  return { id: nextId(), fileName, label, text, ...readLayout(text, delimiter ?? detectDelimiter(text), catalog) }
}

/** Build an upload from a workbook's sheets, using the first non-empty sheet. */
export function buildWorkbookUpload(fileName: string, sheets: SheetText[], catalog: SisCatalog, label: string): UploadedFile {
  const [first] = sheets
  if (!first) throw new Error(`${fileName}: This spreadsheet has no data.`)
  return { ...buildUpload(fileName, first.text, catalog, label, ','), sheets, sheet: first.name }
}

/** Switch a spreadsheet upload to another sheet. Keeps the label. */
export function withSheet(f: UploadedFile, sheetName: string, catalog: SisCatalog): UploadedFile {
  const sheet = f.sheets?.find((s) => s.name === sheetName)
  if (!sheet) return f
  const next = buildUpload(f.fileName, sheet.text, catalog, f.label, ',')
  return { ...next, id: f.id, sheets: f.sheets, sheet: sheet.name }
}

export async function readFile(file: File, catalog: SisCatalog, fallbackLabel: string): Promise<UploadedFile> {
  const guessed = guessLabel(file.name)
  const label = guessed ?? fallbackLabel
  const labelSource = guessed ? ('name' as const) : ('auto' as const)
  if (isSpreadsheet(file.name)) {
    try {
      return { ...buildWorkbookUpload(file.name, await readWorkbook(await file.arrayBuffer()), catalog, label), labelSource }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'could not be read.'
      throw new Error(msg.startsWith(file.name) ? msg : `${file.name}: ${msg}`)
    }
  }
  const text = decodeText(await file.arrayBuffer())
  const problem = rejectReason(text)
  if (problem) throw new Error(`${file.name}: ${problem}`)
  return { ...buildUpload(file.name, text, catalog, label), labelSource }
}

/**
 * Build an upload from text pasted into the page, for example cells copied
 * from a spreadsheet (tab delimited) or lines copied from a CSV. Same
 * delimiter detection and mapping as a file.
 */
export function readPasted(text: string, catalog: SisCatalog, label: string, name = 'Pasted text', fallbackLabel = 'Snapshot 1'): UploadedFile {
  const clean = text.replace(/^\uFEFF/, '')
  const problem = rejectReason(clean)
  if (problem) throw new Error(problem.replace('This file', 'The pasted text'))
  const given = label.trim()
  return { ...buildUpload(name, clean, catalog, given || fallbackLabel), labelSource: given ? 'user' : 'auto' }
}

/** Re-read a file's headers with a different delimiter. */
export function withDelimiter(f: UploadedFile, delimiter: Delimiter, catalog: SisCatalog): UploadedFile {
  return { ...f, ...readLayout(f.text, delimiter, catalog) }
}

export const SAMPLE_FILES = [
  { path: 'sample-data/ic-students-q1.csv', label: 'Q1' },
  { path: 'sample-data/ic-students-q2.csv', label: 'Q2' },
  { path: 'sample-data/ic-behavior-q2.csv', label: 'Q2' },
]

export const SAMPLE_DOWNLOADS = [
  { path: 'sample-data/ic-students-q1.csv', note: 'One row per student, Q1' },
  { path: 'sample-data/ic-students-q2.csv', note: 'One row per student, Q2' },
  { path: 'sample-data/ic-behavior-q2.csv', note: 'Behavior incidents, many rows per student' },
  { path: 'sample-data/ic-students-renamed.tsv', note: 'Renamed headers, tab delimited' },
]

/** Synthetic sample files, fetched from this site. */
export async function loadSamples(catalog: SisCatalog): Promise<UploadedFile[]> {
  return Promise.all(
    SAMPLE_FILES.map(async ({ path, label }) => {
      const res = await fetch(`/${path}`)
      if (!res.ok) throw new Error('Could not load the sample data.')
      return { ...buildUpload(path.split('/').pop()!, await res.text(), catalog, label), labelSource: 'name' as const }
    }),
  )
}

// Turn a chosen file into an UploadedFile: decode, detect delimiter, read
// headers, and auto-map columns. Runs entirely in the browser.

import { autoMap } from '../mapping/detect'
import type { UploadedFile } from '../model'
import type { SisCatalog } from '../sis/types'
import { decodeText, rejectReason } from './decode'
import { detectDelimiter, readHeaders, type Delimiter } from './delimiter'

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

export function buildUpload(fileName: string, text: string, catalog: SisCatalog, label: string, delimiter?: Delimiter): UploadedFile {
  const d = delimiter ?? detectDelimiter(text)
  const headers = readHeaders(text, d)
  return { id: nextId(), fileName, label, text, delimiter: d, headers, mapping: autoMap(headers, catalog) }
}

export async function readFile(file: File, catalog: SisCatalog, fallbackLabel: string): Promise<UploadedFile> {
  const early = rejectReason(file.name)
  if (early) throw new Error(`${file.name}: ${early}`)
  const text = decodeText(await file.arrayBuffer())
  const late = rejectReason(file.name, text)
  if (late) throw new Error(`${file.name}: ${late}`)
  return buildUpload(file.name, text, catalog, guessLabel(file.name) ?? fallbackLabel)
}

/** Re-read a file's headers with a different delimiter. */
export function withDelimiter(f: UploadedFile, delimiter: Delimiter, catalog: SisCatalog): UploadedFile {
  const headers = readHeaders(f.text, delimiter)
  return { ...f, delimiter, headers, mapping: autoMap(headers, catalog) }
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
      return buildUpload(path.split('/').pop()!, await res.text(), catalog, label)
    }),
  )
}

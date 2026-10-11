// Save and load a column mapping as JSON. A mapping file holds header names
// only, never student data, so it is safe to keep and reuse.

import type { SisCatalog } from '../sis/types'
import type { ColumnMapping } from './detect'

export interface MappingFile {
  format: 'caselo-column-mapping'
  version: 1
  sis: string
  /** Field key to header text as it appears in the export. */
  fields: Record<string, string>
}

export function mappingToJson(mapping: ColumnMapping, headers: string[], catalog: SisCatalog): MappingFile {
  const fields: Record<string, string> = {}
  for (const f of catalog.fields) {
    const m = mapping[f.key]
    if (m?.index != null) fields[f.key] = headers[m.index]
  }
  return { format: 'caselo-column-mapping', version: 1, sis: catalog.id, fields }
}

/**
 * Apply a saved mapping to a file's headers. Fields whose saved header is
 * not in this file keep their current match.
 */
export function applyMappingJson(
  json: unknown,
  headers: string[],
  current: ColumnMapping,
  catalog: SisCatalog,
): { mapping: ColumnMapping; applied: number; missing: string[] } {
  const file = json as Partial<MappingFile>
  if (!file || file.format !== 'caselo-column-mapping' || typeof file.fields !== 'object' || !file.fields) {
    throw new Error('This is not a Caselo column mapping file.')
  }
  const lower = headers.map((h) => h.trim().toLowerCase())
  const mapping: ColumnMapping = { ...current }
  const missing: string[] = []
  let applied = 0
  for (const f of catalog.fields) {
    const saved = file.fields[f.key]
    if (typeof saved !== 'string') continue
    const index = lower.indexOf(saved.trim().toLowerCase())
    if (index < 0) {
      missing.push(saved)
      continue
    }
    // Free the column if another field had it.
    for (const k of Object.keys(mapping)) {
      if (mapping[k].index === index) mapping[k] = { index: null, method: 'none', score: 0 }
    }
    mapping[f.key] = { index, method: 'manual', score: 1 }
    applied++
  }
  return { mapping, applied, missing }
}

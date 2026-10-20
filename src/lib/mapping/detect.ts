// Column mapping: match a file's headers to catalog fields.
//
// Order of matching:
//   1. Default SIS header names, e.g. "student.grade" or "student_grade"
//      (case-insensitive). The part after the prefix, e.g. "grade", also
//      counts when no other field in the catalog ends the same way.
//   2. Fuzzy matching on plain-language aliases, for districts that renamed
//      columns, e.g. "Grade Level" or "Days Absent (YTD)".
//   3. When the file's first rows are available, the values in each column
//      confirm or rule out a match (values.ts). A column of A, B, C is not
//      grade level, even if it is named "Grade".
//   4. Anything still uncertain is shown to the user in the mapping editor.

import type { Category, FieldSpec, SisCatalog } from '../sis/types'
import { EVENT_CATEGORIES } from '../sis/types'
import { fieldFit, profileColumn, type ColumnProfile, type Fit } from './values'

export type MatchMethod = 'default' | 'fuzzy' | 'values' | 'manual' | 'none'

export interface FieldMatch {
  /** Zero-based column position in the file, or null if unmatched. */
  index: number | null
  method: MatchMethod
  /** 0 to 1. Default matches are 1. */
  score: number
  /**
   * True when Caselo is sure enough not to ask. Missing on mappings built
   * before values were read; isConfident() fills the gap.
   */
  confident?: boolean
}

export type ColumnMapping = Record<string, FieldMatch>

export const FUZZY_THRESHOLD = 0.72
/** A fuzzy score at or above this needs no confirmation from the values. */
export const SURE_SCORE = 0.9
/** A weaker name match still counts when the values have a telltale shape. */
export const HINT_SCORE = 0.5

function clean(s: string): string {
  return s.replace(/^﻿/, '').trim().replace(/^"|"$/g, '').trim()
}

function lastSegment(s: string): string {
  const i = s.lastIndexOf('.')
  return i >= 0 ? s.slice(i + 1) : s
}

/** Split camelCase and punctuation into lowercase word tokens. */
export function tokens(s: string): string[] {
  return clean(s)
    .replace(/%/g, ' percent ')
    .replace(/#/g, ' number ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>()
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2)
    m.set(g, (m.get(g) ?? 0) + 1)
  }
  return m
}

/** Sorensen-Dice similarity on character bigrams, 0 to 1. */
export function dice(a: string, b: string): number {
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0
  const A = bigrams(a)
  const B = bigrams(b)
  let overlap = 0
  for (const [g, n] of A) overlap += Math.min(n, B.get(g) ?? 0)
  return (2 * overlap) / (a.length - 1 + (b.length - 1))
}

/** How closely a header matches a field's aliases, 0 to 1. */
export function fuzzyScore(header: string, field: FieldSpec): number {
  const hTokens = tokens(lastSegment(clean(header)))
  const hCompact = hTokens.join('')
  if (!hCompact) return 0
  const candidates = [...field.aliases, ...field.defaultHeaders.map(lastSegment)]
  let best = 0
  for (const alias of candidates) {
    const aTokens = tokens(alias)
    const aCompact = aTokens.join('')
    let score = dice(hCompact, aCompact)
    // Every alias word appears in the header: "days absent" in "Total Days Absent YTD".
    if (aTokens.length > 1 && aTokens.every((t) => hTokens.includes(t))) score = Math.max(score, 0.9)
    // A one-word alias only counts as a whole word: "grade" in "Grade (current)".
    if (aTokens.length === 1 && hTokens.includes(aTokens[0])) {
      score = Math.max(score, hTokens.length === 1 ? 1 : 0.8)
    }
    best = Math.max(best, score)
  }
  return best
}

/** Object prefixes in the catalog's default headers, e.g. "student". */
function prefixes(catalog: SisCatalog): string[] {
  const out = new Set<string>()
  for (const f of catalog.fields) {
    for (const d of f.defaultHeaders) {
      const i = d.indexOf('.')
      if (i > 0) out.add(d.slice(0, i).toLowerCase())
    }
  }
  return [...out]
}

/**
 * Some exports write "student_studentNumber" instead of
 * "student.studentNumber". Treat the two the same.
 */
export function normalizeHeader(header: string, objectPrefixes: string[]): string {
  const h = clean(header)
  const lower = h.toLowerCase()
  for (const p of objectPrefixes) {
    if (lower.startsWith(`${p}_`) && h.length > p.length + 1) return `${h.slice(0, p.length)}.${h.slice(p.length + 1)}`
  }
  return h
}

function suffixCounts(catalog: SisCatalog): Map<string, number> {
  const counts = new Map<string, number>()
  for (const f of catalog.fields) {
    for (const d of f.defaultHeaders) {
      const s = lastSegment(d).toLowerCase()
      counts.set(s, (counts.get(s) ?? 0) + 1)
    }
  }
  return counts
}

/**
 * 1 for the full default name ("student.grade"), 0.95 for the bare suffix
 * ("grade") when only one field ends that way, else 0.
 */
function defaultScore(header: string, field: FieldSpec, suffixes: Map<string, number>): number {
  const h = clean(header).toLowerCase()
  let best = 0
  for (const d of field.defaultHeaders) {
    const dl = d.toLowerCase()
    if (h === dl) return 1
    const suffix = lastSegment(dl)
    if (h === suffix && suffixes.get(suffix) === 1) best = 0.95
  }
  return best
}

/** Header names only. Used to find the header row, and when no rows are available. */
export function autoMap(headers: string[], catalog: SisCatalog): ColumnMapping {
  return mapColumns(headers, null, catalog)
}

/**
 * Match columns to fields using header names and, when given, the file's
 * first data rows (one array of cells per row).
 */
export function mapColumns(headers: string[], rows: string[][] | null, catalog: SisCatalog): ColumnMapping {
  const mapping: ColumnMapping = {}
  const used = new Set<number>()
  const suffixes = suffixCounts(catalog)
  const names = headers.map((h) => normalizeHeader(h, prefixes(catalog)))
  const profiles: (ColumnProfile | null)[] = rows
    ? headers.map((_, i) => profileColumn(rows.map((r) => r[i] ?? '')))
    : headers.map(() => null)
  const fit = (field: FieldSpec, index: number): Fit => {
    const p = profiles[index]
    return p ? fieldFit(field, p) : 'unknown'
  }

  // Pass 1: default header names. The full name is trusted as is. A bare
  // suffix ("grade") must not be contradicted by the values.
  for (const field of catalog.fields) {
    for (let index = 0; index < names.length; index++) {
      if (used.has(index)) continue
      const score = defaultScore(names[index], field, suffixes)
      if (!score) continue
      if (score < 1 && fit(field, index) === 'no') continue
      mapping[field.key] = { index, method: 'default', score, confident: true }
      used.add(index)
      break
    }
  }

  // Pass 2: names and values together. Best pairs first, so each column is
  // used once.
  const pairs: { key: string; index: number; score: number; rank: number; method: MatchMethod; confident: boolean }[] = []
  for (const field of catalog.fields) {
    if (mapping[field.key]) continue
    names.forEach((header, index) => {
      if (used.has(index)) return
      const score = fuzzyScore(header, field)
      if (score < HINT_SCORE) return
      const f = fit(field, index)
      if (f === 'no') return
      if (score >= FUZZY_THRESHOLD) {
        const confident = f === 'strong' || f === 'yes' || score >= SURE_SCORE
        pairs.push({ key: field.key, index, score, rank: score + (f === 'strong' ? 0.2 : 0), method: 'fuzzy', confident })
      } else if (f === 'strong') {
        // A loose name with a telltale shape, e.g. "Grade" holding A, B, C.
        pairs.push({ key: field.key, index, score, rank: score + 0.2, method: 'values', confident: true })
      }
    })
  }
  pairs.sort((a, b) => b.rank - a.rank)
  for (const p of pairs) {
    if (mapping[p.key] || used.has(p.index)) continue
    mapping[p.key] = { index: p.index, method: p.method, score: p.score, confident: p.confident }
    used.add(p.index)
  }

  // Pass 3: no student ID by name. Suggest the column that looks most like
  // one, but ask before using it.
  if (rows && !catalog.studentKeys.some((k) => mapping[k])) {
    const key = catalog.studentKeys[0]
    const field = catalog.fields.find((f) => f.key === key)
    const index = field
      ? profiles.findIndex(
          (p, i) => p != null && !used.has(i) && p.filled === p.rows && p.filled >= 3 && p.distinct / p.filled >= 0.9 && fieldFit(field, p) !== 'no' && p.numeric >= 0.95,
        )
      : -1
    if (index >= 0) {
      mapping[key] = { index, method: 'values', score: 0, confident: false }
      used.add(index)
    }
  }

  for (const field of catalog.fields) {
    if (!mapping[field.key]) mapping[field.key] = { index: null, method: 'none', score: 0 }
  }
  return mapping
}

/** True when a match can be used without asking. */
export function isConfident(m: FieldMatch | undefined): boolean {
  if (!m || m.index == null) return true
  if (m.confident != null) return m.confident
  return m.method === 'default' || m.method === 'manual' || m.score >= SURE_SCORE
}

/** Field keys that are matched but not certain. */
export function uncertainFields(mapping: ColumnMapping): string[] {
  return Object.keys(mapping).filter((k) => mapping[k].index != null && !isConfident(mapping[k]))
}

export function isMapped(mapping: ColumnMapping, key: string): boolean {
  return mapping[key]?.index != null
}

/** Categories whose required fields are all mapped. */
export function presentCategories(mapping: ColumnMapping, catalog: SisCatalog): Category[] {
  return (Object.keys(catalog.requirements) as Category[]).filter((cat) =>
    catalog.requirements[cat].some((group) => group.every((k) => isMapped(mapping, k))),
  )
}

/** The student ID field this file will use, or null if none is mapped. */
export function studentKeyField(mapping: ColumnMapping, catalog: SisCatalog): string | null {
  return catalog.studentKeys.find((k) => isMapped(mapping, k)) ?? null
}

export function hasEventCategory(categories: Category[]): boolean {
  return categories.some((c) => EVENT_CATEGORIES.includes(c))
}

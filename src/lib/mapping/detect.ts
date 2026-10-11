// Column mapping: match a file's headers to catalog fields.
//
// Order of matching:
//   1. Default SIS header names, e.g. "student.grade" (case-insensitive).
//      The part after the prefix, e.g. "grade", also counts when no other
//      field in the catalog ends the same way.
//   2. Fuzzy matching on plain-language aliases, for districts that renamed
//      columns, e.g. "Grade Level" or "Days Absent (YTD)".
//   3. The user confirms or corrects the result in the mapping editor.

import type { Category, FieldSpec, SisCatalog } from '../sis/types'
import { EVENT_CATEGORIES } from '../sis/types'

export type MatchMethod = 'default' | 'fuzzy' | 'manual' | 'none'

export interface FieldMatch {
  /** Zero-based column position in the file, or null if unmatched. */
  index: number | null
  method: MatchMethod
  /** 0 to 1. Default matches are 1. */
  score: number
}

export type ColumnMapping = Record<string, FieldMatch>

export const FUZZY_THRESHOLD = 0.72

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

function isDefaultMatch(header: string, field: FieldSpec, suffixes: Map<string, number>): boolean {
  const h = clean(header).toLowerCase()
  return field.defaultHeaders.some((d) => {
    const dl = d.toLowerCase()
    if (h === dl) return true
    const suffix = lastSegment(dl)
    return h === suffix && suffixes.get(suffix) === 1
  })
}

export function autoMap(headers: string[], catalog: SisCatalog): ColumnMapping {
  const mapping: ColumnMapping = {}
  const used = new Set<number>()
  const suffixes = suffixCounts(catalog)

  // Pass 1: default header names.
  for (const field of catalog.fields) {
    const index = headers.findIndex((h, i) => !used.has(i) && isDefaultMatch(h, field, suffixes))
    if (index >= 0) {
      mapping[field.key] = { index, method: 'default', score: 1 }
      used.add(index)
    }
  }

  // Pass 2: fuzzy matching. Best pairs first, so each column is used once.
  const pairs: { key: string; index: number; score: number }[] = []
  for (const field of catalog.fields) {
    if (mapping[field.key]) continue
    headers.forEach((header, index) => {
      if (used.has(index)) return
      const score = fuzzyScore(header, field)
      if (score >= FUZZY_THRESHOLD) pairs.push({ key: field.key, index, score })
    })
  }
  pairs.sort((a, b) => b.score - a.score)
  for (const p of pairs) {
    if (mapping[p.key] || used.has(p.index)) continue
    mapping[p.key] = { index: p.index, method: 'fuzzy', score: p.score }
    used.add(p.index)
  }

  for (const field of catalog.fields) {
    if (!mapping[field.key]) mapping[field.key] = { index: null, method: 'none', score: 0 }
  }
  return mapping
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

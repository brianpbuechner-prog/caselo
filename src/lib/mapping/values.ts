// Read a column's values to judge what kind of data it holds. Runs on the
// first rows of a file, in the browser. Nothing here leaves the page.
//
// The result is a fit for one catalog field:
//   strong   the values have a shape only this kind of field has
//            (K-12 grade levels, letter grades, dates, Y/N flags, GPAs)
//   yes      the values are consistent with the field
//   unknown  too few values to tell
//   no       the values cannot be this field

import type { FieldSpec } from '../sis/types'

export type Fit = 'strong' | 'yes' | 'unknown' | 'no'

export interface ColumnProfile {
  /** Non-empty values seen. */
  filled: number
  /** Rows looked at. */
  rows: number
  distinct: number
  /** Share of non-empty values that are numbers (a trailing % is allowed). */
  numeric: number
  /** Share of numeric values that are whole numbers. */
  integer: number
  /** Share of numeric values with two or more decimal places. */
  twoDecimals: number
  min: number | null
  max: number | null
  /** Share of non-empty values that look like dates. */
  dates: number
  /** Share of non-empty values containing a space. */
  spaces: number
  /** Longest value, in characters. */
  maxLength: number
  /** Distinct values, upper-cased, when there are 40 or fewer. */
  values: Set<string> | null
}

/** How many data rows to read per file when judging columns. */
export const PROFILE_ROWS = 200

const NUMBER = /^[-+]?(\d+(\.\d*)?|\.\d+)%?$/
const DATE =
  /^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})([ T]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?\s*(AM|PM)?Z?)?$/i

export function profileColumn(cells: string[]): ColumnProfile {
  const values = cells.map((c) => c.trim()).filter((c) => c !== '')
  const distinct = new Set(values.map((v) => v.toUpperCase()))
  const nums: number[] = []
  let decimals2 = 0
  let dates = 0
  let spaces = 0
  let maxLength = 0
  for (const v of values) {
    if (NUMBER.test(v.replace(/,/g, ''))) {
      nums.push(Number(v.replace(/[,%]/g, '')))
      if (/\.\d{2,}%?$/.test(v)) decimals2++
    }
    if (DATE.test(v)) dates++
    if (/\s/.test(v)) spaces++
    maxLength = Math.max(maxLength, v.length)
  }
  const n = values.length || 1
  const m = nums.length || 1
  return {
    filled: values.length,
    rows: cells.length,
    distinct: distinct.size,
    numeric: nums.length / n,
    integer: nums.filter((x) => Number.isInteger(x)).length / m,
    twoDecimals: decimals2 / m,
    min: nums.length ? Math.min(...nums) : null,
    max: nums.length ? Math.max(...nums) : null,
    dates: dates / n,
    spaces: spaces / n,
    maxLength,
    values: distinct.size <= 40 ? distinct : null,
  }
}

const GRADE_LEVELS = new Set(['PK', 'PREK', 'P', 'TK', 'K', 'KG', 'KN', 'EC', 'UG', ...Array.from({ length: 14 }, (_, i) => String(i)), ...Array.from({ length: 13 }, (_, i) => String(i).padStart(2, '0'))])
const LETTER_GRADE = /^(A|B|C|D|E|F)[+-]?$/
const MARK_WORDS = new Set(['P', 'F', 'NP', 'I', 'INC', 'W', 'WF', 'WP', 'NC', 'CR', 'S', 'U', 'N', 'M', 'NG', 'AU', 'E', 'O', 'NA', 'N/A'])
const FLAG_SETS = [
  ['Y', 'N'],
  ['YES', 'NO'],
  ['T', 'F'],
  ['TRUE', 'FALSE'],
  ['1', '0'],
  ['X', ''],
]

/** Values every row in a set must come from, ignoring empties. */
function within(values: Set<string> | null, allowed: (v: string) => boolean): boolean {
  return values != null && [...values].every(allowed)
}

/** Is this column consistent with this field? */
export function fieldFit(field: FieldSpec, p: ColumnProfile): Fit {
  // A handful of values says little either way.
  if (p.filled < 3) return 'unknown'
  const allNumbers = p.numeric >= 0.95
  const min = p.min ?? 0
  const max = p.max ?? 0

  switch (field.kind) {
    case 'id':
      if (p.spaces > 0.05 || p.maxLength > 24 || p.dates > 0.5) return 'no'
      if (allNumbers && p.integer < 0.95) return 'no'
      return 'yes'

    case 'text':
      if (allNumbers || p.dates > 0.5) return 'no'
      return 'yes'

    case 'grade':
      if (!within(p.values, (v) => GRADE_LEVELS.has(v))) return 'no'
      // A column of only 0 and 1 is more likely a flag.
      if (p.distinct < 2 || within(p.values, (v) => v === '0' || v === '1')) return 'yes'
      return 'strong'

    case 'percent':
      if (!allNumbers || min < 0 || max > 100) return 'no'
      return 'yes'

    case 'number':
      if (!allNumbers || min < 0) return 'no'
      if (field.key === 'cumGPA' || field.key === 'unweightedGPA') {
        if (max > 6) return 'no'
        // GPAs are mostly decimals with two or more places.
        return p.twoDecimals >= 0.5 ? 'strong' : 'yes'
      }
      // Counts of days: whole numbers or halves, at most a school year.
      if (max > 400) return 'no'
      return 'yes'

    case 'flag': {
      const vals = p.values
      if (!vals || vals.size > 2) return 'no'
      const fits = FLAG_SETS.some((set) => [...vals].every((v) => set.includes(v)))
      return fits ? 'strong' : 'no'
    }

    case 'date':
      return p.dates >= 0.9 ? 'strong' : 'no'

    case 'code':
      if (p.maxLength > 40 || p.dates > 0.5) return 'no'
      if (field.key === 'courseGrade') {
        if (within(p.values, (v) => LETTER_GRADE.test(v) || MARK_WORDS.has(v))) return 'strong'
        if (allNumbers) return min >= 0 && max <= 100 ? 'yes' : 'no'
        return p.values != null && p.maxLength <= 6 ? 'yes' : 'no'
      }
      return 'yes'
  }
}

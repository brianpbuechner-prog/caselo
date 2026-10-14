// Number check for the AI draft. Every number in the draft must appear in
// the summary that was sent. Counts are compared as written; rates are
// compared as whole percents (rate times 100, rounded), the same way the
// prompt asks the model to write them. Small ("<10") and hidden ("*") cells
// have no number in the payload, so any number written for one of them is
// reported as not found.

import { MIN_SHOWN } from './validate'

// A number not glued to a letter or digit on its left ("Q2" is a label, not
// a 2). Commas inside a number ("1,204") are allowed.
const NUMBER = /(?<![A-Za-z0-9.])\d{1,3}(?:,\d{3})+(?:\.\d+)?%?|(?<![A-Za-z0-9.])\d+(?:\.\d+)?%?/g

export interface NumberToken {
  text: string
  value: number
  percent: boolean
  index: number
}

export function findNumbers(text: string): NumberToken[] {
  const out: NumberToken[] = []
  for (const m of text.matchAll(NUMBER)) {
    const percent = m[0].endsWith('%')
    const value = Number(m[0].replace(/[,%]/g, ''))
    if (Number.isFinite(value)) out.push({ text: m[0], value, percent, index: m.index })
  }
  return out
}

export interface AllowedNumbers {
  /** Counts, grades, tier numbers, and numbers in the rule text. */
  plain: Set<number>
  /** Rates as whole percents, and percents in the rule text. */
  percent: Set<number>
}

/** Collect the numbers a draft may use from the exact payload text that was sent. */
export function allowedNumbers(payload: string): AllowedNumbers {
  const plain = new Set<number>([MIN_SHOWN])
  const percent = new Set<number>()
  const walk = (v: unknown, key: string | null) => {
    if (typeof v === 'number') {
      if (key === 'rate') percent.add(Math.round(v * 100))
      else if (key !== 'version') plain.add(v)
    } else if (typeof v === 'string') {
      for (const t of findNumbers(v)) (t.percent ? percent : plain).add(t.value)
    } else if (Array.isArray(v)) {
      for (const x of v) walk(x, null)
    } else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        // Tier keys "1", "2", "3" are names a draft will use ("Tier 3").
        if (/^\d+$/.test(k)) plain.add(Number(k))
        walk(x, k)
      }
    }
  }
  walk(JSON.parse(payload), null)
  return { plain, percent }
}

export interface Mismatch extends NumberToken {
  /** A few words either side, for showing where the number is. */
  before: string
  after: string
}

// A change in percentage points is always a calculated number, even when
// the digits happen to match a count in the summary.
const POINTS = /^\s*-?\s*(percentage[- ])?(points?|pts?)\b/i

// A time frame in a suggested step ("for 4 weeks", "a 6-week group") is
// not a claim about the data. Days are not exempt, since "missed 12 days"
// would be one.
const TIME_FRAME = /^\s*-?\s*(weeks?|months?|minutes?|hours?)\b/i

/** Numbers in the text that are not in the payload. */
export function checkNumbers(text: string, allowed: AllowedNumbers): Mismatch[] {
  return findNumbers(text)
    .filter((t) => POINTS.test(text.slice(t.index + t.text.length)) || !(t.percent ? allowed.percent : allowed.plain).has(t.value))
    .filter((t) => t.percent || !TIME_FRAME.test(text.slice(t.index + t.text.length)))
    .map((t) => ({
      ...t,
      before: text.slice(Math.max(0, t.index - 40), t.index).split('\n').at(-1)!.replace(/^\S*\s/, ''),
      after: text.slice(t.index + t.text.length, t.index + t.text.length + 40).split('\n')[0].replace(/\s\S*$/, ''),
    }))
}

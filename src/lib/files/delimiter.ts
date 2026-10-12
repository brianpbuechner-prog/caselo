// Delimited text: delimiter detection and header reading.

export type Delimiter = ',' | '\t' | '|' | '^'

export const DELIMITERS: { value: Delimiter; label: string }[] = [
  { value: ',', label: 'Comma' },
  { value: '\t', label: 'Tab' },
  { value: '|', label: 'Pipe' },
  { value: '^', label: 'Caret' },
]

export function delimiterLabel(d: Delimiter): string {
  return DELIMITERS.find((x) => x.value === d)?.label ?? d
}

/** Split one line on a delimiter, respecting double-quoted values. */
export function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else inQuotes = false
      } else cur += c
    } else if (c === '"') inQuotes = true
    else if (c === delimiter) {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}

export interface TextRecord {
  /** Zero-based position, counted the way DuckDB counts lines for `skip`. */
  index: number
  text: string
}

/**
 * Split the start of a file into records. Blank lines count as records and
 * a double-quoted value can span lines, which matches how DuckDB's read_csv
 * counts the lines it skips. Stops after `max` records.
 */
export function readRecords(text: string, max: number): TextRecord[] {
  const out: TextRecord[] = []
  let start = 0
  let inQuotes = false
  for (let i = 0; i <= text.length && out.length < max; i++) {
    const c = text[i]
    if (c === '"') inQuotes = !inQuotes
    else if (i === text.length || (c === '\n' && !inQuotes)) {
      if (i === text.length && start >= text.length) break
      out.push({ index: out.length, text: text.slice(start, i).replace(/\r$/, '') })
      start = i + 1
    }
  }
  return out
}

function nonEmpty(text: string, max: number): TextRecord[] {
  return readRecords(text, max).filter((r) => r.text.trim())
}

/** Most common value, preferring the larger value on a tie. */
function mode(values: number[]): { value: number; count: number } {
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best = { value: 0, count: 0 }
  for (const [value, count] of counts) {
    if (count > best.count || (count === best.count && value > best.value)) best = { value, count }
  }
  return best
}

/**
 * Pick the delimiter that splits the first lines into the same number of
 * columns most consistently, preferring more columns. Uses the most common
 * column count, so a title line above the header does not throw it off.
 */
export function detectDelimiter(text: string): Delimiter {
  const lines = nonEmpty(text, 40).slice(0, 25).map((r) => r.text)
  let best: Delimiter = ','
  let bestScore = -1
  for (const { value } of DELIMITERS) {
    const { value: columns, count } = mode(lines.map((l) => splitLine(l, value).length))
    if (columns < 2) continue
    const score = (count / lines.length) * 100 + Math.min(columns, 99)
    if (score > bestScore) {
      bestScore = score
      best = value
    }
  }
  return best
}

/** How many header lines are considered, and how many lines after each are compared. */
export const HEADER_SCAN_LINES = 10
const FOLLOWING_LINES = 40

/**
 * Find the header row. Some exports start with a report title, a
 * "generated on" line, or blank lines. Each of the first 10 non-empty lines
 * is a candidate. A candidate qualifies when its column count matches at
 * least half of the lines after it. Among those, the one whose names match
 * the most catalog fields wins, then the one matching the most following
 * lines, then the earliest. Returns the record index (see readRecords).
 *
 * `matches` counts catalog field matches for a list of header names.
 */
export function detectHeaderRow(text: string, delimiter: Delimiter, matches: (headers: string[]) => number = () => 0): number {
  const lines = nonEmpty(text, 400).slice(0, HEADER_SCAN_LINES + FOLLOWING_LINES)
  if (!lines.length) return 0
  const cols = lines.map((l) => splitLine(l.text, delimiter).length)
  const anyMulti = cols.slice(0, HEADER_SCAN_LINES).some((c) => c >= 2)
  const candidates = lines.slice(0, HEADER_SCAN_LINES).map((line, i) => {
    const following = cols.slice(i + 1, i + 1 + FOLLOWING_LINES)
    const same = following.filter((c) => c === cols[i]).length
    return {
      index: line.index,
      same,
      ok: following.length > 0 && same * 2 >= following.length && (cols[i] >= 2 || !anyMulti),
      matches: matches(splitLine(line.text, delimiter).map((h) => h.trim())),
    }
  })
  const pool = candidates.some((c) => c.ok) ? candidates.filter((c) => c.ok) : candidates
  pool.sort((a, b) => b.matches - a.matches || b.same - a.same || a.index - b.index)
  return pool[0].index
}

/** Header names on the given record, or on the first non-empty record. */
export function readHeaders(text: string, delimiter: Delimiter, headerLine?: number): string[] {
  const records = readRecords(text, headerLine == null ? 400 : headerLine + 1)
  const line = headerLine == null ? records.find((r) => r.text.trim()) : records[headerLine]
  if (!line) return []
  return splitLine(line.text, delimiter).map((h) => h.trim())
}

/** Up to `n` non-empty records after the header row. */
export function dataLines(text: string, headerLine: number, n: number): string[] {
  return nonEmpty(text, headerLine + 1 + n * 2)
    .filter((r) => r.index > headerLine)
    .slice(0, n)
    .map((r) => r.text)
}

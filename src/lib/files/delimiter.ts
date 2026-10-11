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

function firstLines(text: string, n: number): string[] {
  const lines: string[] = []
  let start = 0
  while (lines.length < n && start < text.length) {
    let end = text.indexOf('\n', start)
    if (end === -1) end = text.length
    const line = text.slice(start, end).replace(/\r$/, '')
    if (line.trim()) lines.push(line)
    start = end + 1
  }
  return lines
}

/**
 * Pick the delimiter that splits the first lines into the same number of
 * columns most consistently, preferring more columns.
 */
export function detectDelimiter(text: string): Delimiter {
  const lines = firstLines(text, 25)
  let best: Delimiter = ','
  let bestScore = -1
  for (const { value } of DELIMITERS) {
    const counts = lines.map((l) => splitLine(l, value).length)
    const header = counts[0] ?? 1
    if (header < 2) continue
    const consistent = counts.filter((c) => c === header).length / counts.length
    const score = consistent * 100 + Math.min(header, 99)
    if (score > bestScore) {
      bestScore = score
      best = value
    }
  }
  return best
}

export function readHeaders(text: string, delimiter: Delimiter): string[] {
  const [first] = firstLines(text, 1)
  if (!first) return []
  return splitLine(first, delimiter).map((h) => h.trim())
}

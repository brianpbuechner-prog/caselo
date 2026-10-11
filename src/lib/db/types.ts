// A minimal interface over DuckDB so the same SQL code runs in the browser
// (DuckDB-WASM in a Web Worker) and in tests (DuckDB-WASM for Node).

export interface SqlRunner {
  /** Make text available to DuckDB under a virtual file name. In memory only. */
  registerText(name: string, text: string): Promise<void>
  dropFile(name: string): Promise<void>
  query<T = Record<string, unknown>>(sql: string): Promise<T[]>
}

/** Convert DuckDB/Arrow values to plain JavaScript values. */
export function plain(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (typeof value === 'bigint') return Number(value)
  if (Array.isArray(value)) return value.map(plain)
  if (typeof value === 'object') {
    const v = value as { toArray?: () => unknown[]; toJSON?: () => unknown }
    if (value instanceof Date) return value
    // Arrow struct rows and list vectors both offer toJSON (object or array).
    if (typeof v.toJSON === 'function') return plain(v.toJSON())
    if (typeof v.toArray === 'function') return Array.from(v.toArray()).map(plain)
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(value as Record<string, unknown>)) out[k] = plain(x)
    return out
  }
  return value
}

/** Quote a SQL string literal. */
export function sqlString(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'"
}

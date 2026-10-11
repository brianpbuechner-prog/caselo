// DuckDB-WASM for Node, used only by tests. Same SQL as the browser.

import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import * as duckdb from '@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs'
import { plain, type SqlRunner } from '../../src/lib/db/types'

const require = createRequire(import.meta.url)
const DIST = dirname(require.resolve('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs'))

export async function createNodeRunner(): Promise<SqlRunner> {
  const db = await duckdb.createDuckDB(
    {
      mvp: { mainModule: join(DIST, 'duckdb-mvp.wasm'), mainWorker: join(DIST, 'duckdb-node-mvp.worker.cjs') },
      eh: { mainModule: join(DIST, 'duckdb-eh.wasm'), mainWorker: join(DIST, 'duckdb-node-eh.worker.cjs') },
    },
    new duckdb.VoidLogger(),
    duckdb.NODE_RUNTIME,
  )
  await db.instantiate()
  const conn = db.connect()
  return {
    async registerText(name, text) {
      db.registerFileText(name, text)
    },
    async dropFile(name) {
      db.dropFile(name)
    },
    async query<T>(sql: string) {
      const result = conn.query(sql)
      return result.toArray().map((row) => plain(row.toJSON()) as T)
    },
  }
}

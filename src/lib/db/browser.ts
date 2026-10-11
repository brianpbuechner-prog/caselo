// DuckDB-WASM in the browser. Runs in a Web Worker with an in-memory
// database. Nothing is written to disk, IndexedDB, or any server. The
// WebAssembly files are served from this site, not a CDN.

import * as duckdb from '@duckdb/duckdb-wasm'
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'
import ehWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import mvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import { plain, type SqlRunner } from './types'

const BUNDLES: duckdb.DuckDBBundles = {
  mvp: { mainModule: mvpWasm, mainWorker: mvpWorker },
  eh: { mainModule: ehWasm, mainWorker: ehWorker },
}

interface Instance {
  db: duckdb.AsyncDuckDB
  conn: duckdb.AsyncDuckDBConnection
  worker: Worker
}

let instance: Promise<Instance> | null = null

async function start(): Promise<Instance> {
  const bundle = await duckdb.selectBundle(BUNDLES)
  const worker = new Worker(bundle.mainWorker!)
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker)
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
  // Never try to download extensions; everything Caselo needs is built in.
  await db.open({ query: { castBigIntToDouble: true } })
  const conn = await db.connect()
  await conn.query('SET autoinstall_known_extensions = false')
  await conn.query('SET autoload_known_extensions = false')
  return { db, conn, worker }
}

function get(): Promise<Instance> {
  if (!instance) {
    instance = start().catch((e) => {
      instance = null
      throw e
    })
  }
  return instance
}

/** Start loading DuckDB early so analysis feels fast. Safe to call often. */
export function warmUp(): void {
  get().catch(() => {})
}

/** Stop the worker and discard its memory. Used by "Clear data". */
export async function shutdown(): Promise<void> {
  if (!instance) return
  const current = instance
  instance = null
  try {
    const { worker } = await current
    worker.terminate()
  } catch {
    // Already gone.
  }
}

export const browserRunner: SqlRunner = {
  async registerText(name, text) {
    const { db } = await get()
    await db.registerFileText(name, text)
  },
  async dropFile(name) {
    const { db } = await get()
    await db.dropFile(name)
  },
  async query<T>(sql: string) {
    const { conn } = await get()
    const result = await conn.query(sql)
    return result.toArray().map((row) => plain(row.toJSON()) as T)
  },
}

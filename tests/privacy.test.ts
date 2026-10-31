// Student data never leaves the browser. Three layers:
//
//   1. Every way the source code could send or hand off data (network
//      calls, workers, downloads, clipboard, outside URLs) is listed below.
//      A new one fails this test until someone reviews it and adds it.
//   2. The whole pipeline runs on synthetic files with every network API
//      replaced by a recorder. The only request allowed is the AI draft,
//      and it must hold no name, ID, or course name from the files.
//   3. The draft function's request to Anthropic is checked the same way.
//
// The synthetic names and IDs act as canaries: the CSV export (which stays
// on the device) is checked to contain them, so the test can see them.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { handleDraft } from '../api/draft'
import { DEFAULT_THRESHOLDS as T } from '../src/config/rules'
import { DRAFT_ENDPOINT, payloadText, sendPayload } from '../src/lib/ai/client'
import { checkSummary } from '../src/lib/ai/validate'
import { analyze } from '../src/lib/compare/analyze'
import type { SqlRunner } from '../src/lib/db/types'
import { resultsToCsv } from '../src/lib/export/csv'
import { readFile, readPasted, SAMPLE_FILES } from '../src/lib/files/read'
import { planSnapshots } from '../src/lib/grouping/plan'
import { buildSnapshots } from '../src/lib/grouping/snapshots'
import { DEFAULT_PREFERENCES, loadPreferences, savePreferences } from '../src/lib/preferences'
import { infiniteCampus } from '../src/lib/sis/infinite-campus/fields'
import { buildSummary } from '../src/lib/summary/build'
import { createNodeRunner } from './helpers/node-db'
import { BEHAVIOR_HEADER_SETS, behaviorText, caseload, STUDENT_HEADER_SETS, studentText, type SynthStudent } from './helpers/synthetic'

const ROOT = join(__dirname, '..')

// ---------------------------------------------------------------------------
// 1. Every place the code can send or hand off data.

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx|html)$/.test(name) ? [path] : []
  })
}

const SINKS: [string, RegExp][] = [
  ['fetch', /\bfetch(Impl)?\s*\(/],
  ['XMLHttpRequest', /XMLHttpRequest/],
  ['WebSocket', /WebSocket/],
  ['EventSource', /EventSource/],
  ['sendBeacon', /sendBeacon/],
  ['WebRTC', /RTCPeerConnection|RTCDataChannel/],
  ['importScripts', /importScripts/],
  ['image request', /new Image\b|\.src\s*=/],
  ['navigation', /window\.open|location\.(href|assign|replace)\s*[=(]|<form\b|\.submit\(/],
  ['worker', /new (Shared)?Worker\(|serviceWorker/],
  ['clipboard', /navigator\.clipboard/],
  ['download', /createObjectURL|\.download\s*=|\bdownload\b\s*>|\bdownload\b\s*\/?>|\sdownload(\s|>)/],
  ['outside URL', /https?:\/\/(?!localhost)/],
  ['storage', /localStorage|sessionStorage|indexedDB|document\.cookie|caches\./],
]

// Each reviewed use: file, kind, and the line it is on. Why each is safe:
const ALLOWED: [string, string, RegExp][] = [
  // Synthetic sample files from this site.
  ['src/lib/files/read.ts', 'fetch', /await fetch\(`\/\$\{path\}`\)/],
  // The AI draft, same origin, de-identified summary only (layer 2).
  ['src/lib/ai/client.ts', 'fetch', /fetchImpl\(DRAFT_ENDPOINT,/],
  // The draft function's call to Anthropic, summary only (layer 3).
  ['api/draft.ts', 'fetch', /fetchImpl\(API_URL,/],
  ['api/draft.ts', 'outside URL', /const API_URL = 'https:\/\/api\.anthropic\.com\/v1\/messages'/],
  // Links to the public source code. Plain links, no data in them.
  ['src/components/common.tsx', 'outside URL', /export const REPO_URL = 'https:\/\/github\.com\/brianpbuechner-prog\/caselo'/],
  ['src/lib/ai/client.ts', 'outside URL', /export const PROMPT_URL = 'https:\/\/github\.com\/brianpbuechner-prog\/caselo\/blob\/main\/src\/lib\/ai\/prompt\.md'/],
  // DuckDB's own worker, served from this site, in memory.
  ['src/lib/db/browser.ts', 'worker', /new Worker\(bundle\.mainWorker!\)/],
  // Local downloads the person asks for: results CSV, mapping JSON, sample files.
  ['src/lib/export/csv.ts', 'download', /URL\.createObjectURL\(blob\)/],
  ['src/lib/export/csv.ts', 'download', /a\.download = fileName/],
  ['src/components/common.tsx', 'download', /<a href=\{`\/\$\{s\.path\}`\} download>/],
  // Copying the AI payload or draft, which hold no student rows.
  ['src/components/results/AiDraft.tsx', 'clipboard', /navigator\.clipboard\.writeText\(text\)/],
  // Settings only (layer 4).
  ['src/lib/preferences.ts', 'storage', /window\.localStorage\.getItem\(KEY\)/],
  ['src/lib/preferences.ts', 'storage', /window\.localStorage\.setItem\(KEY, JSON\.stringify\(p\)\)/],
]

describe('every way the code can send data is reviewed', () => {
  const found: { file: string; kind: string; line: string }[] = []
  for (const path of [...sourceFiles(join(ROOT, 'src')), ...sourceFiles(join(ROOT, 'api')), join(ROOT, 'index.html')]) {
    const file = relative(ROOT, path).split('\\').join('/')
    for (const raw of readFileSync(path, 'utf8').split('\n')) {
      const line = raw.trim()
      if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/*') || line.startsWith('{/*')) continue
      for (const [kind, re] of SINKS) if (re.test(line)) found.push({ file, kind, line })
    }
  }

  test('nothing outside the reviewed list', () => {
    const unreviewed = found.filter((f) => !ALLOWED.some(([file, kind, re]) => file === f.file && kind === f.kind && re.test(f.line)))
    expect(unreviewed.map((f) => `${f.file} [${f.kind}] ${f.line}`)).toEqual([])
  })

  test('the reviewed list is current', () => {
    const missing = ALLOWED.filter(([file, kind, re]) => !found.some((f) => f.file === file && f.kind === kind && re.test(f.line)))
    expect(missing.map(([file, kind]) => `${file} [${kind}]`)).toEqual([])
  })

  test('the two fetch targets are on this site', () => {
    expect(DRAFT_ENDPOINT).toBe('/api/draft')
    for (const s of SAMPLE_FILES) expect(s.path).toMatch(/^sample-data\/[\w.-]+\.csv$/)
  })
})

// ---------------------------------------------------------------------------
// 2 and 3. The pipeline, with the network replaced by recorders.

interface Sent {
  api: string
  url: string
  body: string
}

const sent: Sent[] = []
const DRAFT = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'hand-draft-q2.json'), 'utf8'))

function stubNetwork() {
  sent.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      sent.push({ api: 'fetch', url: String(url), body: String(init?.body ?? '') })
      return new Response(JSON.stringify({ model: 'test-model', draft: DRAFT }), { status: 200, headers: { 'content-type': 'application/json' } })
    }),
  )
  const blocked = (api: string) =>
    class {
      constructor(url?: unknown) {
        sent.push({ api, url: String(url), body: '' })
      }
    }
  vi.stubGlobal('XMLHttpRequest', blocked('XMLHttpRequest'))
  vi.stubGlobal('WebSocket', blocked('WebSocket'))
  vi.stubGlobal('EventSource', blocked('EventSource'))
  vi.stubGlobal('navigator', {
    ...globalThis.navigator,
    sendBeacon: (url: string, body: unknown) => {
      sent.push({ api: 'sendBeacon', url, body: String(body) })
      return true
    },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

let db: SqlRunner
beforeAll(async () => {
  db = await createNodeRunner()
})

const q1 = caseload({ count: 80, seed: 31 })
const q2 = q1.map((s, i) => ({ ...s, absenteeismPercentage: i % 5 === 0 ? s.absenteeismPercentage + 6 : s.absenteeismPercentage }))
const COURSE = 'Zzcanary Course'

/** Strings from the files that must never be sent: names, IDs, course names. */
function canaries(list: SynthStudent[]): string[] {
  return [...list.flatMap((s) => [s.lastName, s.firstName, s.studentNumber, s.stateID]), COURSE]
}

function leaks(text: string, list: SynthStudent[]): string[] {
  const upper = text.toUpperCase()
  return canaries(list).filter((c) => upper.includes(c.toUpperCase()))
}

async function fourFiles() {
  const IC = STUDENT_HEADER_SETS['Infinite Campus defaults']
  const courses = ['student.studentNumber,grading.courseName,grading.score', ...q2.map((s, i) => `${s.studentNumber},${COURSE},${i % 6 ? 'B' : 'F'}`)].join('\n')
  const file = (name: string, text: string) => readFile(new File([text], name), infiniteCampus, 'Snapshot 1')
  return Promise.all([
    file('students_q1.csv', studentText(q1, IC)),
    file('behavior_q1.csv', behaviorText(q1, BEHAVIOR_HEADER_SETS['Infinite Campus defaults'])),
    file('students_q2.csv', studentText(q2, IC, { delimiter: '\t' })),
    file('grades_q2.csv', courses),
  ])
}

describe('the pipeline with the network recorded', () => {
  test('reading, analyzing, and summarizing four files makes no request', async () => {
    stubNetwork()
    const plan = planSnapshots(await fourFiles(), infiniteCampus)
    expect(plan.ready).toBe(true)
    const { snapshots } = await buildSnapshots(db, plan.files, infiniteCampus)
    const results = analyze(snapshots, T)
    buildSummary(results, T)
    expect(sent).toEqual([])
    // The canaries are in the data on the device, so the checks below can see them.
    expect(leaks(resultsToCsv(results.students, results.labels), q2).length).toBe(canaries(q2).length)
  })

  test('the AI draft is the only request, and it holds no names, IDs, or course names', async () => {
    stubNetwork()
    const { snapshots } = await buildSnapshots(db, planSnapshots(await fourFiles(), infiniteCampus).files, infiniteCampus)
    const results = analyze(snapshots, T)
    const payload = payloadText(buildSummary(results, T))
    await sendPayload(payload)
    expect(sent.map((s) => `${s.api} ${s.url}`)).toEqual(['fetch /api/draft'])
    expect(sent[0].body).toBe(payload)
    expect(leaks(sent[0].body, q2)).toEqual([])
    expect(checkSummary(JSON.parse(sent[0].body))).toBeNull()
    // No per-student list of any kind: nothing in the payload has one entry per student.
    const lengths: number[] = []
    JSON.parse(payload, (_k, v) => (Array.isArray(v) && lengths.push(v.length), v))
    expect(Math.max(...lengths)).toBeLessThan(results.students.length)
  })

  test('the draft function sends Anthropic the fixed prompt and that payload, nothing else', async () => {
    const { snapshots } = await buildSnapshots(db, planSnapshots(await fourFiles(), infiniteCampus).files, infiniteCampus)
    const payload = payloadText(buildSummary(analyze(snapshots, T), T))
    const upstream: { url: string; body: Record<string, unknown> }[] = []
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      upstream.push({ url: String(url), body: JSON.parse(String(init?.body)) })
      return new Response(JSON.stringify({ model: 'm', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(DRAFT) }] }), { status: 200 })
    })
    const req = new Request('https://caselo.test/api/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload })
    expect((await handleDraft(req, { ANTHROPIC_API_KEY: 'test-key' }, fetchImpl)).status).toBe(200)
    expect(upstream).toHaveLength(1)
    expect(upstream[0].url).toBe('https://api.anthropic.com/v1/messages')
    const body = upstream[0].body as { system: string; messages: { role: string; content: string }[] }
    expect(Object.keys(body).sort()).toEqual(['max_tokens', 'messages', 'model', 'output_config', 'system'])
    expect(body.system).toBe(readFileSync(join(ROOT, 'src', 'lib', 'ai', 'prompt.md'), 'utf8'))
    expect(body.messages).toEqual([{ role: 'user', content: payload }])
    expect(leaks(JSON.stringify(body), q2)).toEqual([])
  })

  test('the draft function refuses a body that carries student rows', async () => {
    const fetchImpl = vi.fn()
    const rows = q2.slice(0, 3).map((s) => ({ name: s.lastName, id: s.studentNumber }))
    for (const body of [JSON.stringify(rows), JSON.stringify({ students: rows }), resultsToCsv([], [])]) {
      const req = new Request('https://caselo.test/api/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body })
      expect((await handleDraft(req, { ANTHROPIC_API_KEY: 'k' }, fetchImpl)).status).toBe(400)
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('saved settings', () => {
  test('only known settings are stored, never student values', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('window', { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) } })
    const tampered = { ...DEFAULT_PREFERENCES, students: q1.slice(0, 3), thresholds: { ...T, note: q1[0].lastName } }
    savePreferences(tampered as typeof DEFAULT_PREFERENCES)
    // A save writes what it is given; loading keeps only known keys.
    const loaded = loadPreferences()
    expect(leaks(JSON.stringify(loaded), q1)).toEqual([])
    expect(Object.keys(loaded).sort()).toEqual(['layout', 'role', 'thresholds'])
  })
})

// Known bug (listed in the PR): two fields in the summary come from the
// person or the file, not from Caselo: the snapshot label and each grade
// value. The server check (validate.ts LABEL and GRADE) accepts letters,
// so a label typed as a name, or a grade column mapped to a name column,
// is sent to caselo.org and Anthropic once the counselor presses Send.
// The preview shows it first, but the rule is not enforced by code. These
// tests flip to failing once it is; then change test.fails to test.
describe('known bug: free text in the summary can carry a name off the device', () => {
  const few = q1.slice(0, 15)
  const IC = STUDENT_HEADER_SETS['Infinite Campus defaults']

  test.fails('a snapshot label typed as a student name is not sent', async () => {
    stubNetwork()
    const file = readPasted(studentText(few, IC), infiniteCampus, `${few[0].firstName} ${few[0].lastName}`)
    const { snapshots } = await buildSnapshots(db, [file], infiniteCampus)
    await sendPayload(payloadText(buildSummary(analyze(snapshots, T), T)))
    expect(leaks(sent.map((s) => s.body).join(''), few)).toEqual([])
  })

  test.fails('names in a column mapped as grade level are not sent', async () => {
    stubNetwork()
    const file = readPasted(studentText(few, IC), infiniteCampus, 'Q1')
    file.mapping = { ...file.mapping, grade: { index: file.headers.indexOf('student.lastName'), method: 'manual', score: 1 } }
    const { snapshots } = await buildSnapshots(db, [file], infiniteCampus)
    const payload = payloadText(buildSummary(analyze(snapshots, T), T))
    // The server check accepts it today; this is what it should refuse.
    expect(checkSummary(JSON.parse(payload))).not.toBeNull()
    await sendPayload(payload)
    expect(leaks(sent.map((s) => s.body).join(''), few)).toEqual([])
  })
})

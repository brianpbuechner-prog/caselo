// POST /api/draft: the only server code in Caselo.
//
// Takes a Caselo de-identified summary, checks that it is exactly that
// (src/lib/ai/validate.ts), adds the fixed public instructions
// (src/lib/ai/prompt.md), and asks Anthropic's Messages API for a draft.
// Returns the model name and the draft. Request and response bodies are
// never logged or stored.
//
// Environment variables:
//   ANTHROPIC_API_KEY  required
//   DRAFT_MODEL        model name, default claude-sonnet-5-5
//   DRAFT_DISABLED     set to 1 or true to turn the feature off (503)

/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { checkSummary, DRAFT_JSON_SCHEMA, MAX_BODY_BYTES, parseDraftContent } from '../src/lib/ai/validate.js'

export const DEFAULT_MODEL = 'claude-sonnet-5-5'
// Covers the draft plus any thinking the model does first. Billing is for
// tokens used, not this cap.
export const MAX_TOKENS = 8000
const API_URL = 'https://api.anthropic.com/v1/messages'
const TIMEOUT_MS = 110_000

export interface DraftEnv {
  ANTHROPIC_API_KEY?: string
  DRAFT_MODEL?: string
  DRAFT_DISABLED?: string
}

let prompt: string | null = null
function systemPrompt(): string {
  prompt ??= readFileSync(new URL('../src/lib/ai/prompt.md', import.meta.url), 'utf8')
  return prompt
}

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

const error = (status: number, message: string) => reply(status, { error: message })

function isOn(v: string | undefined): boolean {
  return !!v && !['0', 'false', 'no', 'off'].includes(v.trim().toLowerCase())
}

export async function handleDraft(request: Request, env: DraftEnv, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (isOn(env.DRAFT_DISABLED)) return error(503, 'The AI draft is turned off right now. Everything else in Caselo still works.')
  if (request.method !== 'POST') return error(405, 'Use POST.')
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return error(415, 'Send the summary as JSON.')
  }
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > MAX_BODY_BYTES) return error(413, 'The summary is larger than expected.')

  const payload = await request.text()
  if (new TextEncoder().encode(payload).length > MAX_BODY_BYTES) return error(413, 'The summary is larger than expected.')

  let summary: unknown
  try {
    summary = JSON.parse(payload)
  } catch {
    return error(400, 'The request is not valid JSON.')
  }
  const problem = checkSummary(summary)
  if (problem !== null) return error(400, `Only a Caselo summary can be sent. ${problem}.`)

  const key = env.ANTHROPIC_API_KEY
  if (!key) return error(503, 'The AI draft is not set up on this server.')
  const model = env.DRAFT_MODEL?.trim() || DEFAULT_MODEL

  let upstream: Response
  try {
    upstream = await fetchImpl(API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        system: systemPrompt(),
        // The summary text exactly as the counselor previewed it.
        messages: [{ role: 'user', content: payload }],
        output_config: { format: { type: 'json_schema', schema: DRAFT_JSON_SCHEMA } },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    return error(504, 'The model did not answer in time. Try again.')
  }

  if (!upstream.ok) {
    // Status only. The upstream body is not logged or passed on.
    console.error(`draft: upstream status ${upstream.status}`)
    if (upstream.status === 429 || upstream.status === 529) return error(503, 'The model is busy. Try again in a minute.')
    return error(502, 'The model returned an error. Try again later.')
  }

  const result = (await upstream.json().catch(() => null)) as {
    model?: unknown
    stop_reason?: unknown
    content?: { type?: unknown; text?: unknown }[]
    usage?: { output_tokens?: unknown }
  } | null
  if (result?.stop_reason !== 'end_turn') {
    // Counts and block types only, never content.
    const blocks = (result?.content ?? []).map((b) => String(b.type)).join(',')
    console.error(`draft: stop_reason ${String(result?.stop_reason)} output_tokens ${String(result?.usage?.output_tokens)} blocks ${blocks}`)
    return error(502, 'The model did not finish the draft. Try again.')
  }
  const text = result.content?.find((b) => b.type === 'text')?.text
  let content: unknown = null
  try {
    content = typeof text === 'string' ? JSON.parse(text) : null
  } catch {
    content = null
  }
  const draft = parseDraftContent(content)
  if (typeof draft === 'string') {
    console.error('draft: response did not match the draft format')
    return error(502, 'The draft came back in an unexpected form. Try again.')
  }
  return reply(200, { model: typeof result.model === 'string' ? result.model : model, draft })
}

export function POST(request: Request): Promise<Response> {
  return handleDraft(request, process.env)
}

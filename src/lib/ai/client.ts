// The browser side of the AI draft. Posts the summary to the same-origin
// function at /api/draft (see api/draft.ts), so the Content Security Policy
// (connect-src 'self') does not change. Another way to reach a model, such
// as a user's own key, could replace sendPayload without UI changes.

import type { DeidentifiedSummary, Draft, DraftFromSummary } from './types'
import { parseDraftContent } from './validate'

export const DRAFT_ENDPOINT = '/api/draft'

/** Public link to the instructions the function adds to every request. */
export const PROMPT_URL = 'https://github.com/brianpbuechner-prog/caselo/blob/main/src/lib/ai/prompt.md'

/**
 * The exact text that is shown in the preview and posted. Built once and
 * passed along as a string so what is sent is what was shown.
 */
export function payloadText(summary: DeidentifiedSummary): string {
  return JSON.stringify(summary, null, 2)
}

export class DraftError extends Error {}

/** Post a payload string exactly as given. */
export async function sendPayload(payload: string, fetchImpl: typeof fetch = fetch): Promise<Draft> {
  let res: Response
  try {
    res = await fetchImpl(DRAFT_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload })
  } catch {
    throw new DraftError('Could not reach caselo.org. Check the connection and try again.')
  }
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : `The draft service returned an error (${res.status}).`
    throw new DraftError(message)
  }
  const model = body && typeof body === 'object' && 'model' in body && typeof body.model === 'string' ? body.model : null
  const parsed = parseDraftContent(body && typeof body === 'object' && 'draft' in body ? body.draft : null)
  if (!model || !parsed.ok) throw new DraftError('The draft came back in an unexpected form. Try again.')
  return { ...parsed.draft, model, createdAt: new Date().toISOString(), payload }
}

export const draftFromSummary: DraftFromSummary = (summary) => sendPayload(payloadText(summary))

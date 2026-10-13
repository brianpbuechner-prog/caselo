// Types for the AI draft (Phase 3). The only input is the de-identified
// summary from src/lib/summary/build.ts.

import type { DeidentifiedSummary } from '../summary/build'
import type { DraftContent, DraftGoal } from './validate'

export type { DeidentifiedSummary, DraftContent, DraftGoal }

/** What the browser posts to /api/draft: the summary, as JSON text. */
export type DraftRequest = DeidentifiedSummary

/** What /api/draft returns on success. */
export interface DraftResponse {
  /** The model that wrote the draft, as reported by the API. */
  model: string
  draft: DraftContent
}

/** A draft held in the page (memory only). */
export interface Draft extends DraftContent {
  model: string
  /** When the draft came back, ISO 8601. */
  createdAt: string
  /** The exact text that was sent, kept for the number check. */
  payload: string
}

/** Turns a summary into a draft. The UI depends only on this. */
export type DraftFromSummary = (summary: DeidentifiedSummary) => Promise<Draft>

/** The draft on the page: what came back, and the counselor's edited text. */
export interface DraftState {
  draft: Draft
  text: string
}

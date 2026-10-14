// The optional AI draft (Phase 3). Nothing is sent until the counselor opens
// the preview, sees the exact text, and presses Send. The text shown in the
// preview is the string that is posted. The draft that comes back is held in
// memory only (App state) and Clear data discards it.

import { useEffect, useMemo, useState } from 'react'
import { DraftError, payloadText, PROMPT_URL, sendPayload } from '../../lib/ai/client'
import { describePayload, draftDate, draftStrings, draftText } from '../../lib/ai/describe'
import { allowedNumbers, checkNumbers } from '../../lib/ai/numbers'
import type { DraftState } from '../../lib/ai/types'
import type { DraftContent } from '../../lib/ai/validate'
import type { DeidentifiedSummary } from '../../lib/summary/build'
import { Spinner } from '../common'
import { DraftTabs, DraftTop, Section, TABS } from './DraftView'

export const DRAFT_HEADING = 'AI draft, edit before use'

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => setDone(false), 1600)
    return () => clearTimeout(t)
  }, [done])
  return (
    <button
      className="btn sm"
      onClick={() =>
        navigator.clipboard.writeText(text).then(
          () => setDone(true),
          () => setDone(false),
        )
      }
    >
      {done ? 'Copied' : label}
    </button>
  )
}

function NumberCheck({ content, payload }: { content: DraftContent; payload: string }) {
  const allowed = useMemo(() => allowedNumbers(payload), [payload])
  const misses = useMemo(() => draftStrings(content).flatMap((t) => checkNumbers(t, allowed)), [content, allowed])
  if (!misses.length) {
    return <p className="small muted">Number check: every number in this draft appears in the summary that was sent.</p>
  }
  return (
    <div className="ai-check" role="status">
      <p>
        <strong>Number check: {misses.length === 1 ? '1 number is' : `${misses.length} numbers are`} not in the summary that was sent.</strong>{' '}
        {misses.length === 1 ? 'It is' : 'They are'} highlighted in the cards, and tabs with one show a red dot. Check before using this draft.
      </p>
      <ul>
        {misses.map((m, i) => (
          <li key={`${m.index}-${i}`}>
            {m.before}
            <mark>{m.text}</mark>
            {m.after}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Label({ state }: { state: DraftState }) {
  return (
    <p className="small muted">
      {state.draft.model}, {draftDate(state.draft.createdAt)}. Written from the de-identified summary only.
    </p>
  )
}

/** The draft as printed in the PDF: every section, under the AI draft label. */
export function DraftPrint({ state }: { state: DraftState }) {
  const allowed = allowedNumbers(state.draft.payload)
  return (
    <section className="report-block draft-print">
      <h2>{DRAFT_HEADING}</h2>
      <Label state={state} />
      <DraftTop content={state.content} allowed={allowed} />
      {TABS.map((t) => (
        <div key={t.id} className="print-section">
          <h3>{t.label}</h3>
          <Section tab={t.id} content={state.content} allowed={allowed} editable={false} onChange={() => {}} />
        </div>
      ))}
      <p className="small muted">
        <strong>Limits.</strong> {state.content.limits}
      </p>
    </section>
  )
}

export function AiDraftPanel({
  summary,
  state,
  onState,
}: {
  summary: DeidentifiedSummary
  state: DraftState | null
  onState: (s: DraftState) => void
}) {
  const current = useMemo(() => payloadText(summary), [summary])
  // The exact string shown in the preview. Send posts this string.
  const [opened, setOpened] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // If the rules change while the preview is open, the preview closes, so a
  // payload that is no longer current can't be sent.
  const preview = opened !== null && opened === current ? opened : null
  const setPreview = setOpened

  const send = async () => {
    if (preview === null) return
    setSending(true)
    setError(null)
    try {
      const draft = await sendPayload(preview)
      onState({ draft, content: structuredClone(draft) })
      setPreview(null)
    } catch (e) {
      setError(e instanceof DraftError ? e.message : 'Something went wrong. Try again.')
    } finally {
      setSending(false)
    }
  }

  const stale = state !== null && state.draft.payload !== current

  return (
    <section className="ai no-print" aria-label="AI draft">
      <p className="small muted ai-intro">
        Optional. Drafts short insight cards from the de-identified summary only: the big picture, next steps for
        counselors, administrators, teachers, and the support team, how those roles connect, and 2 or 3 ASCA goals.
        Nothing is sent until you preview it and choose Send.
      </p>

      {preview === null ? (
        <div>
          <button className="btn sm" onClick={() => setPreview(current)} disabled={sending}>
            Preview what would be sent
          </button>
        </div>
      ) : (
        <div className="ai-preview">
          <p>{describePayload(preview)}</p>
          <pre className="ai-json" tabIndex={0} aria-label="Exact data that would be sent">
            {preview}
          </pre>
          <p className="small muted">
            caselo.org adds fixed instructions for the model.{' '}
            <a href={PROMPT_URL} target="_blank" rel="noreferrer">
              Read them
            </a>
            .
          </p>
          <div className="ai-actions">
            <button className="btn primary sm" onClick={send} disabled={sending}>
              Send
            </button>
            <CopyButton text={preview} label="Copy data" />
            <button className="btn ghost sm" onClick={() => setPreview(null)} disabled={sending}>
              Close preview
            </button>
          </div>
        </div>
      )}

      {sending && <Spinner text="Writing the draft" />}
      {error && <p className="error">{error}</p>}

      {state && <DraftOutput state={state} stale={stale} onState={onState} />}
    </section>
  )
}

function DraftOutput({ state, stale, onState }: { state: DraftState; stale: boolean; onState: (s: DraftState) => void }) {
  const allowed = useMemo(() => allowedNumbers(state.draft.payload), [state.draft.payload])
  const setContent = (content: DraftContent) => onState({ ...state, content })
  return (
    <div className="ai-output">
      <div className="ai-output-head">
        <h2>{DRAFT_HEADING}</h2>
        <Label state={state} />
      </div>
      {stale && (
        <p className="small muted">
          The rules or files changed after this draft was written. The draft and the number check still use the summary
          that was sent.
        </p>
      )}
      <NumberCheck content={state.content} payload={state.draft.payload} />
      <DraftTop content={state.content} allowed={allowed} />
      <DraftTabs content={state.content} allowed={allowed} onChange={setContent} />
      <p className="small muted draft-limits">
        <strong>Limits.</strong> {state.content.limits}
      </p>
      <div className="ai-actions">
        <CopyButton text={draftText(state.content)} label="Copy all as text" />
        <span className="small muted">Held in this tab only. Clear data discards it.</span>
      </div>
    </div>
  )
}

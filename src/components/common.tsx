import { useEffect, useRef, useState, type ReactNode } from 'react'
import { PROMPT_URL } from '../lib/ai/client'
import { SAMPLE_DOWNLOADS } from '../lib/files/read'

export const REPO_URL = 'https://github.com/brianpbuechner-prog/caselo'
export const MAX_FILES = 4
export const ACCEPT = '.csv,.txt,.tsv,.xlsx,.xls,.xlsm,.ods'

export function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function PrivacyStatement() {
  return (
    <p className="privacy">
      <LockIcon />
      <span>
        Your files stay on this computer. Caselo reads them in your browser and does not upload, store, or share
        them. Closing or refreshing this tab clears them.
      </span>
    </p>
  )
}

export function DropZone({
  onFiles,
  compact,
  disabled,
  label,
}: {
  onFiles: (files: File[]) => void
  compact?: boolean
  disabled?: boolean
  label?: ReactNode
}) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  return (
    <div
      className={`dropzone${compact ? ' compact' : ''}${over ? ' over' : ''}`}
      role="button"
      tabIndex={0}
      aria-disabled={disabled}
      onClick={() => !disabled && input.current?.click()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          input.current?.click()
        }
      }}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        if (!disabled) onFiles([...e.dataTransfer.files])
      }}
    >
      {label ?? (
        <>
          <strong>Drop an Infinite Campus export here, or choose files</strong>
          <span className="muted small">Up to {MAX_FILES} files. CSV, Excel, or other delimited text.</span>
        </>
      )}
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
    </div>
  )
}

export function Modal({ onClose, children, kind = 'dialog', title }: { onClose: () => void; children: ReactNode; kind?: 'dialog' | 'drawer'; title: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className={kind} role="dialog" aria-modal="true" aria-label={title}>
        {children}
      </div>
    </>
  )
}

export function About({ onClose }: { onClose: () => void }) {
  return (
    <Modal onClose={onClose} title="About Caselo">
      <h2>About Caselo</h2>
      <p>
        Caselo was created by Brian Buechner, a licensed Minnesota school counselor. It reads a student information
        system export and shows who needs support now, who is slipping before any rule catches it, and the reason
        for each.
      </p>
      <p>
        <strong>The words it uses.</strong> In place of tiers and flags: <em>Needs support now</em> (Tier 3),{' '}
        <em>Worth a check-in</em> (Tier 2), and <em>No signals</em> (Tier 1). A signal is one area (attendance,
        academics, or behavior) past a line. With two snapshots, each student's direction is <em>Gaining ground</em>,{' '}
        <em>Steady</em>, <em>Slipping</em>, or <em>Finding footing</em>. The words describe the situation, not the
        student, and tier numbers stay available for MTSS teams in Rules and the CSV export.
      </p>
      <p>
        <strong>How your data is handled.</strong> Caselo has no database or accounts. Files are read in this browser
        tab and held in memory. Nothing from a file is saved to this computer or sent anywhere. Refreshing or closing
        the tab clears it. Rule settings you change are saved in this browser; they contain no student data.
      </p>
      <p>
        <strong>AI draft.</strong> Student data never leaves the browser. One optional feature, the AI draft, sends a de-identified summary (counts and rates only, no names, IDs, or individual values, small counts already hidden) to caselo.org, which forwards it to Anthropic's API and returns a draft. You see the exact data before it is sent, and nothing is sent unless you choose to. caselo.org does not store or log the summary or the draft. Anthropic's terms state that API data is not used to train models, and Anthropic deletes API inputs and outputs within 30 days. The instructions sent with the summary are public: {' '}
        <a href={PROMPT_URL} target="_blank" rel="noreferrer">
          the instructions
        </a>
        .
      </p>
      <p>
        <strong>Supported exports.</strong> Infinite Campus Ad Hoc exports from Filter Designer, Query Wizard, or Data
        Export, saved as comma, tab, pipe, or caret delimited text.
      </p>
      <div>
        <p>
          <strong>Sample files.</strong> Synthetic data with invented students, for trying Caselo:
        </p>
        <ul>
          {SAMPLE_DOWNLOADS.map((s) => (
            <li key={s.path}>
              <a href={`/${s.path}`} download>
                {s.path.split('/').pop()}
              </a>{' '}
              <span className="muted">({s.note})</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="muted small">
        Open source under the MIT License. Copyright (c) 2026 Empty Bar LLC.{' '}
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          Source code
        </a>
      </p>
      <div>
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  )
}

export function Footer({ onAbout }: { onAbout: () => void }) {
  return (
    <footer className="footer">
      <button className="link" onClick={onAbout}>
        About
      </button>
      <a className="link" href={REPO_URL} target="_blank" rel="noreferrer">
        Source code
      </a>
      <span>MIT License</span>
      <span>© 2026 Empty Bar LLC</span>
    </footer>
  )
}

export function Spinner({ text }: { text: string }) {
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden="true" />
      {text}
    </div>
  )
}

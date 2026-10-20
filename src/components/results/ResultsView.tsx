// The results page. One page, read top to bottom: the summary and a short
// role-based "start here" section, then patterns, then every student.
// "Download PDF" prints the de-identified summary (no names) unless the
// counselor chooses to include names, which prints this page instead.
// The optional AI draft (Phase 3) sits in a collapsed section beside
// Download PDF and reads only the de-identified summary.

import { useEffect, useMemo, useRef, useState } from 'react'
import { ruleDescriptions, type Thresholds } from '../../config/rules'
import type { DraftState } from '../../lib/ai/types'
import { analyze } from '../../lib/compare/analyze'
import type { Snapshot } from '../../lib/model'
import { getRole, ROLES } from '../../lib/roles/roles'
import { buildSummary } from '../../lib/summary/build'
import { AiDraftPanel, DraftPrint } from './AiDraft'
import { Brief } from './Brief'
import { Patterns } from './Patterns'
import { StudentDetail } from './StudentDetail'
import { Slipping } from './Slipping'
import { SummaryReport } from './SummaryReport'
import { DEFAULT_FILTER, StudentList, type ListFilter } from './StudentList'
import { MissingLine, Summary } from './Summary'
import { ThresholdPanel } from './ThresholdPanel'

export function ResultsView({
  snapshots,
  warnings,
  thresholds,
  onThresholds,
  role,
  onRole,
  compact,
  onCompact,
  onFiles,
  onReadout,
  fileCount,
  onClear,
  onAbout,
  draft,
  onDraft,
}: {
  snapshots: Snapshot[]
  warnings: string[]
  thresholds: Thresholds
  onThresholds: (t: Thresholds) => void
  role: string
  onRole: (r: string) => void
  compact: boolean
  onCompact: (v: boolean) => void
  onFiles: () => void
  onReadout: () => void
  fileCount: number
  onClear: () => void
  onAbout: () => void
  draft: DraftState | null
  onDraft: (d: DraftState) => void
}) {
  const results = useMemo(() => analyze(snapshots, thresholds), [snapshots, thresholds])
  const summary = useMemo(() => buildSummary(results, thresholds), [results, thresholds])
  const [aiOpen, setAiOpen] = useState(draft !== null)
  const [withDraft, setWithDraft] = useState(true)
  const printDraft = draft !== null && withDraft ? draft : null
  const [filter, setFilter] = useState<ListFilter>(DEFAULT_FILTER)
  const [panel, setPanel] = useState(false)
  const [withNames, setWithNames] = useState(false)

  // Printing with names is opt-in for one print only. Any other print,
  // including the browser's own Print command, gets the no-names summary.
  useEffect(() => {
    const reset = () => delete document.body.dataset.print
    window.addEventListener('afterprint', reset)
    return () => window.removeEventListener('afterprint', reset)
  }, [])
  const downloadPdf = () => {
    if (withNames) document.body.dataset.print = 'full'
    else delete document.body.dataset.print
    window.print()
  }
  const [openKey, setOpenKey] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const onFilter = (f: Partial<ListFilter>) => setFilter((cur) => ({ ...cur, ...f }))

  /** Apply a filter from a chart or summary and bring the list into view. */
  const showStudents = (f: Partial<ListFilter>) => {
    setFilter({ ...DEFAULT_FILTER, ...f })
    listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const attendanceCodes = useMemo(() => {
    const codes = new Set<string>()
    for (const s of snapshots) for (const row of s.students.values()) for (const m of row.attendanceMarks) if (m.code) codes.add(m.code)
    return [...codes].sort()
  }, [snapshots])
  const hasCourseGrades = snapshots.some((s) => s.categories.includes('courseGrades'))

  const labels = results.labels
  const context = labels.length > 1 ? `${labels.at(-1)}, compared with ${labels.at(-2)}` : labels[0]
  const open = openKey ? results.students.find((s) => s.key === openKey) : null

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <button className="brand" onClick={onAbout} title="About Caselo">
            Caselo
          </button>
          <span className="context">{context}</span>
          <div className="actions">
            {ROLES.length > 1 && (
              <label className="role">
                <span className="small muted">View as</span>
                <select value={getRole(role).id} onChange={(e) => onRole(e.target.value)}>
                  {ROLES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button className="btn ghost sm" onClick={() => setPanel(true)}>
              Rules
            </button>
            <button className="btn ghost sm" onClick={onFiles}>
              Files
            </button>
            <button className="btn ghost sm" onClick={onClear}>
              Clear data
            </button>
          </div>
        </div>
      </header>
      <SummaryReport results={results} summary={summary} draft={printDraft} tierText={ruleDescriptions(thresholds).tiers} />
      <main className="page results-page">
        <div className="pdf-bar no-print">
          <button className="btn ghost sm ai-toggle" aria-expanded={aiOpen} onClick={() => setAiOpen((v) => !v)}>
            <span aria-hidden="true">{aiOpen ? '▾' : '▸'}</span> AI draft narrative and goals
          </button>
          {draft && (
            <label className="small muted pdf-names">
              <input type="checkbox" checked={withDraft} onChange={(e) => setWithDraft(e.target.checked)} />
              Include draft narrative and goals
            </label>
          )}
          <label className="small muted pdf-names">
            <input type="checkbox" checked={withNames} onChange={(e) => setWithNames(e.target.checked)} />
            Include student names
          </label>
          <button className="btn sm" onClick={downloadPdf} title={withNames ? 'This page, with names and the student list' : 'Counts and rates only, with no names. Safe to share.'}>
            Download PDF
          </button>
        </div>
        {aiOpen && <AiDraftPanel summary={summary} state={draft} onState={onDraft} />}
        <p className="names-note">Contains student names. Share only with staff who need it.</p>
        <p className="small muted readout-line no-print">
          Read {fileCount} {fileCount === 1 ? 'file' : 'files'} as {labels.length === 1 ? 'one snapshot' : `${labels.length} snapshots`}.{' '}
          <button className="link" onClick={onReadout}>
            How Caselo read your files
          </button>
        </p>
        <MissingLine results={results} warnings={warnings} />
        <div className="top">
          <Summary results={results} filter={filter} onShowStudents={showStudents} />
          <Brief role={getRole(role)} results={results} onOpenStudent={setOpenKey} onShowStudents={showStudents} />
        </div>
        <Slipping results={results} role={getRole(role)} onOpenStudent={setOpenKey} onShowStudents={showStudents} />
        <Patterns results={results} thresholds={thresholds} onShowStudents={showStudents} />
        <div ref={listRef} className="roster">
          <h2 className="h2">All students</h2>
          <StudentList results={results} filter={filter} onFilter={onFilter} compact={compact} onOpenStudent={setOpenKey} />
        </div>
        {printDraft && <DraftPrint state={printDraft} />}
      </main>
      {open && <StudentDetail student={open} results={results} thresholds={thresholds} onClose={() => setOpenKey(null)} />}
      {panel && (
        <ThresholdPanel
          thresholds={thresholds}
          onChange={onThresholds}
          onClose={() => setPanel(false)}
          attendanceCodes={attendanceCodes}
          hasCourseGrades={hasCourseGrades}
          compact={compact}
          onCompact={onCompact}
        />
      )}
    </>
  )
}

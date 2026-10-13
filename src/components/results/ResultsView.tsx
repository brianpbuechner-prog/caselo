// The results page. One page, read top to bottom: the summary and a short
// role-based "start here" section, then patterns, then every student.
// "Download PDF" prints the de-identified summary (no names) unless the
// counselor chooses to include names, which prints this page instead.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Thresholds } from '../../config/rules'
import { analyze } from '../../lib/compare/analyze'
import type { Snapshot } from '../../lib/model'
import { getRole, ROLES } from '../../lib/roles/roles'
import { Brief } from './Brief'
import { Patterns } from './Patterns'
import { StudentDetail } from './StudentDetail'
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
  onClear,
  onAbout,
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
  onClear: () => void
  onAbout: () => void
}) {
  const results = useMemo(() => analyze(snapshots, thresholds), [snapshots, thresholds])
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
      <SummaryReport results={results} thresholds={thresholds} />
      <main className="page results-page">
        <div className="pdf-bar no-print">
          <label className="small muted pdf-names">
            <input type="checkbox" checked={withNames} onChange={(e) => setWithNames(e.target.checked)} />
            Include student names
          </label>
          <button className="btn sm" onClick={downloadPdf} title={withNames ? 'This page, with names and the student list' : 'Counts and rates only, with no names. Safe to share.'}>
            Download PDF
          </button>
        </div>
        <p className="names-note">Contains student names. Share only with staff who need it.</p>
        <MissingLine results={results} warnings={warnings} />
        <div className="top">
          <Summary results={results} filter={filter} onShowStudents={showStudents} />
          <Brief role={getRole(role)} results={results} onOpenStudent={setOpenKey} onShowStudents={showStudents} />
        </div>
        <Patterns results={results} thresholds={thresholds} onShowStudents={showStudents} />
        <div ref={listRef} className="roster">
          <h2 className="h2">All students</h2>
          <StudentList results={results} filter={filter} onFilter={onFilter} compact={compact} onOpenStudent={setOpenKey} />
        </div>
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

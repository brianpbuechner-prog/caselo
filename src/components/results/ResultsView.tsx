import { useMemo, useState, type ReactNode } from 'react'
import type { Thresholds } from '../../config/rules'
import { analyze } from '../../lib/compare/analyze'
import type { Snapshot } from '../../lib/model'
import { getRole, ROLES, type ViewId } from '../../lib/roles/roles'
import { ByGrade, ChangeView, MissingNotice, SummaryTiles } from './Overview'
import { DEFAULT_FILTER, StudentList, type ListFilter } from './StudentList'
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
  const onFilter = (f: Partial<ListFilter>) => setFilter((cur) => ({ ...cur, ...f }))

  const attendanceCodes = useMemo(() => {
    const codes = new Set<string>()
    for (const s of snapshots) for (const row of s.students.values()) for (const m of row.attendanceMarks) if (m.code) codes.add(m.code)
    return [...codes].sort()
  }, [snapshots])
  const hasCourseGrades = snapshots.some((s) => s.categories.includes('courseGrades'))

  const labels = results.labels
  const context =
    labels.length > 1 ? `Showing ${labels.at(-1)}, compared with ${labels.slice(0, -1).join(', ')}` : `Showing ${labels[0]}`

  const views: Record<ViewId, ReactNode> = {
    missing: <MissingNotice results={results} snapshots={snapshots} warnings={warnings} thresholds={thresholds} />,
    summary: <SummaryTiles results={results} />,
    change: <ChangeView results={results} filter={filter} onFilter={onFilter} />,
    byGrade: <ByGrade results={results} />,
    students: <StudentList results={results} filter={filter} onFilter={onFilter} compact={compact} onCompact={onCompact} />,
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <button className="brand" onClick={onAbout} title="About Caselo">
            Caselo
          </button>
          <span className="context">{context}</span>
          <div className="actions">
            <label className="visually-hidden" htmlFor="role">
              Role
            </label>
            <select id="role" value={role} onChange={(e) => onRole(e.target.value)} disabled={ROLES.length === 1} title="Role">
              {ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <button className="btn sm" onClick={() => setPanel(true)}>
              Rules and thresholds
            </button>
            <button className="btn sm" onClick={onFiles}>
              Files
            </button>
            <button className="btn sm" onClick={onClear}>
              Clear data
            </button>
          </div>
        </div>
      </header>
      <main className="page">
        {getRole(role).views.map((v) => (
          <div key={v}>{views[v]}</div>
        ))}
      </main>
      {panel && (
        <ThresholdPanel
          thresholds={thresholds}
          onChange={onThresholds}
          onClose={() => setPanel(false)}
          attendanceCodes={attendanceCodes}
          hasCourseGrades={hasCourseGrades}
        />
      )}
    </>
  )
}

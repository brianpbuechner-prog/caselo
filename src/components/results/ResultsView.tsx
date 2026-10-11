import { useMemo, useState } from 'react'
import type { Thresholds } from '../../config/rules'
import { analyze } from '../../lib/compare/analyze'
import type { Snapshot } from '../../lib/model'
import { getRole, ROLES, type TabId } from '../../lib/roles/roles'
import { CaseloadTab, MissingLine } from './Overview'
import { DEFAULT_FILTER, StudentsTab, type ListFilter } from './StudentList'
import { ThresholdPanel } from './ThresholdPanel'

const TAB_LABELS: Record<TabId, string> = { students: 'Students', caseload: 'Caseload' }

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
  const tabs = getRole(role).tabs
  const [tab, setTab] = useState<TabId>(tabs[0])
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
  const context = labels.length > 1 ? `${labels.at(-1)}, compared with ${labels.at(-2)}` : labels[0]

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
              <select aria-label="Role" value={role} onChange={(e) => onRole(e.target.value)}>
                {ROLES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
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
      <main className="page">
        <MissingLine results={results} warnings={warnings} />
        <div className="tabs" role="tablist" aria-label="Results">
          {tabs.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={`tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
        <div role="tabpanel" aria-label={TAB_LABELS[tab]}>
          {tab === 'students' ? (
            <StudentsTab results={results} filter={filter} onFilter={onFilter} compact={compact} />
          ) : (
            <CaseloadTab
              results={results}
              snapshots={snapshots}
              thresholds={thresholds}
              onShowStudents={(f) => {
                setFilter({ ...DEFAULT_FILTER, ...f })
                setTab('students')
                window.scrollTo(0, 0)
              }}
            />
          )}
        </div>
      </main>
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

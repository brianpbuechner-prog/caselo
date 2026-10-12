// The short "start here" section. What it shows depends on the role:
// counselors get a handful of students, administrators get the grades and
// areas that stand out, with no names.

import { useMemo } from 'react'
import type { Results, StudentResult } from '../../lib/compare/analyze'
import { areaPhrase, hotspots, START_HERE_ORDER, startHere } from '../../lib/compare/insights'
import { RULE_LABELS } from '../../lib/rules/engine'
import type { Role } from '../../lib/roles/roles'
import { studentName, type ListFilter } from './StudentList'

const pct = (r: number) => `${Math.round(r * 100)}%`

/** The values that caused this student's flags, as short phrases. */
export function flaggedValues(s: StudentResult): string[] {
  const e = s.latest
  const out: string[] = []
  if (e.marks.absence && e.absencePct != null) out.push(`${e.absencePct.toFixed(1)}% absent`)
  if (e.marks.gpa && e.gpa != null) out.push(`GPA ${e.gpa.toFixed(2)}`)
  if (e.marks.failing) out.push(`${e.failingCourses.length} failing`)
  if (e.marks.incidents && e.incidents != null) out.push(`${e.incidents} incidents`)
  return out
}

export function Brief({
  role,
  results,
  onOpenStudent,
  onShowStudents,
}: {
  role: Role
  results: Results
  onOpenStudent: (key: string) => void
  onShowStudents: (f: Partial<ListFilter>) => void
}) {
  const latest = results.summaries[results.summaries.length - 1]
  const students = useMemo(() => startHere(results, 5), [results])
  const groups = useMemo(() => hotspots(results, 4), [results])
  const flagged = latest.tiers[2] + latest.tiers[3]

  if (role.brief === 'groups') {
    return (
      <section className="brief" aria-label="Where to look">
        <h2 className="brief-title">Where to look</h2>
        {groups.length === 0 ? (
          <p className="muted small">No grade stands out from the rest of the caseload.</p>
        ) : (
          <ol className="brief-list">
            {groups.map((g) => (
              <li key={`${g.grade}-${g.category}`}>
                <button className="brief-row" onClick={() => onShowStudents({ grade: g.grade, flag: g.category })}>
                  <span className="brief-name">
                    Grade {g.grade}, {RULE_LABELS[g.category].toLowerCase()}
                  </span>
                  <span className="brief-values num">
                    {pct(g.rate)} {areaPhrase(g.category)} ({g.count} of {g.students}). Caseload: {pct(g.caseloadRate)}.
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
        <p className="brief-foot small muted">Grades with a higher rate than the whole caseload, largest gap first. Grades under 10 students are left out.</p>
      </section>
    )
  }

  return (
    <section className="brief" aria-label="Start here">
      <h2 className="brief-title">Start here</h2>
      {students.length === 0 ? (
        <p className="muted small">No students are flagged.</p>
      ) : (
        <ol className="brief-list">
          {students.map((s) => (
            <li key={s.key}>
              <button className="brief-row" onClick={() => onOpenStudent(s.key)}>
                <span className="brief-name">
                  {studentName(s)}
                  <span className="muted"> Grade {s.latest.row.grade ?? 'unknown'}</span>
                  {s.change === 'up' && results.transitions && <span className="tag look">Tier rose since {results.transitions.from}</span>}
                </span>
                <span className="brief-values num">{flaggedValues(s).join(', ')}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <p className="brief-foot small muted">
        {START_HERE_ORDER}{' '}
        {flagged > students.length && (
          <button className="link" onClick={() => onShowStudents({ tier: latest.tiers[3] > 0 ? '3' : '2' })}>
            See all {latest.tiers[3] > 0 ? `${latest.tiers[3]} in Tier 3` : `${latest.tiers[2]} in Tier 2`}
          </button>
        )}
      </p>
    </section>
  )
}

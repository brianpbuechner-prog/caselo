// "Slipping, no signals yet": students no rule has caught, whose numbers
// are moving toward a line. With one snapshot, students close to a line.
// These are the students most likely to slip through the cracks.

import { useMemo } from 'react'
import type { Results, StudentResult } from '../../lib/compare/analyze'
import { closeToLine, slippingQuietly, withDirection } from '../../lib/compare/insights'
import type { Role } from '../../lib/roles/roles'
import { studentName, type ListFilter } from './StudentList'

const SHOWN = 6

export function Slipping({
  results,
  role,
  onOpenStudent,
  onShowStudents,
}: {
  results: Results
  role: Role
  onOpenStudent: (key: string) => void
  onShowStudents: (f: Partial<ListFilter>) => void
}) {
  const tr = results.transitions
  const list = useMemo(() => (tr ? slippingQuietly(results) : closeToLine(results)), [results, tr])
  const finding = useMemo(() => (tr ? withDirection(results, 'finding').length : 0), [results, tr])
  const title = tr ? 'Slipping, no signals yet' : 'Close to a line, no signals yet'
  const filter: Partial<ListFilter> = { direction: tr ? 'quiet' : 'near' }
  const reasons = (s: StudentResult) => (tr ? (s.movement?.reasons ?? []) : s.near)

  // Grades with the most, for roles that see groups instead of names.
  const grades = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of list) m.set(s.latest.row.grade ?? 'unknown', (m.get(s.latest.row.grade ?? 'unknown') ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  }, [list])

  return (
    <section className="slipping" aria-label={title}>
      <div className="slipping-head">
        <h2 className="brief-title">{title}</h2>
        <span className="small muted">
          {tr
            ? `No rule has caught these students, but their numbers moved toward a line since ${tr.from}.`
            : 'No rule has caught these students yet, but they are close to a line. Add a second snapshot to see who is slipping.'}
        </span>
      </div>
      {list.length === 0 ? (
        <p className="small muted">{tr ? `No students without signals moved toward a line since ${tr.from}.` : 'No students without signals are close to a line.'}</p>
      ) : role.brief === 'groups' ? (
        <p className="num">
          <b>{list.length}</b> {list.length === 1 ? 'student' : 'students'}, most in{' '}
          {grades.map(([g, n]) => `grade ${g} (${n})`).join(', ')}.
        </p>
      ) : (
        <ul className="slipping-list">
          {list.slice(0, SHOWN).map((s) => (
            <li key={s.key}>
              <button className="brief-row plain" onClick={() => onOpenStudent(s.key)}>
                <span className="brief-name">
                  {studentName(s)}
                  <span className="muted"> Grade {s.latest.row.grade ?? 'unknown'}</span>
                </span>
                <span className="brief-values num">{reasons(s).join('. ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="brief-foot small muted">
        {list.length > SHOWN || (role.brief === 'groups' && list.length > 0) ? (
          <button className="link" onClick={() => onShowStudents(filter)}>
            See all {list.length}
          </button>
        ) : null}
        {finding > 0 && (
          <>
            {list.length > SHOWN || (role.brief === 'groups' && list.length > 0) ? ' · ' : ''}
            <button className="link" onClick={() => onShowStudents({ direction: 'finding' })}>
              {finding} finding their footing
            </button>{' '}
            with fewer signals than in {tr!.from}.
          </>
        )}
      </p>
    </section>
  )
}

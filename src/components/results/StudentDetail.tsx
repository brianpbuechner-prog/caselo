// One student's full picture: each area with its value and the rule it
// was checked against, then the same values across snapshots.

import { ruleDescriptions, type Thresholds } from '../../config/rules'
import type { Results, StudentResult } from '../../lib/compare/analyze'
import { ATTENDANCE_METHOD_LABELS, RULE_CATEGORIES, RULE_LABELS, type Evaluation, type RuleCategory } from '../../lib/rules/engine'
import { Modal } from '../common'
import { studentName } from './StudentList'

const dash = '–'

function valueText(e: Evaluation, c: RuleCategory): string {
  if (c === 'attendance') {
    if (e.absencePct != null) return `${e.absencePct.toFixed(1)}% of days absent`
    if (e.absenceCount != null) return `${e.absenceCount} absences`
    return 'No value in the file'
  }
  if (c === 'academics') {
    const parts: string[] = []
    if (e.gpa != null) parts.push(`GPA ${e.gpa.toFixed(2)}`)
    if (e.row.courses.length) parts.push(`${e.failingCourses.length} failing of ${e.row.courses.length} courses`)
    return parts.join(', ') || 'No value in the file'
  }
  return e.incidents == null ? 'No value in the file' : `${e.incidents} ${e.incidents === 1 ? 'incident' : 'incidents'}`
}

export function StudentDetail({
  student,
  results,
  thresholds,
  onClose,
}: {
  student: StudentResult
  results: Results
  thresholds: Thresholds
  onClose: () => void
}) {
  const e = student.latest
  const r = e.row
  const latest = results.summaries[results.summaries.length - 1]
  const rules = ruleDescriptions(thresholds)
  const multi = results.labels.length > 1
  const cell = (h: Evaluation | null, get: (x: Evaluation) => string | null) => (h ? (get(h) ?? dash) : dash)
  return (
    <Modal kind="drawer" onClose={onClose} title={studentName(student)}>
      <div className="detail-head">
        <div>
          <h2>{studentName(student)}</h2>
          <p className="muted small num">
            Grade {r.grade ?? 'unknown'}
            {r.studentNumber ?? r.stateId ? `, ID ${r.studentNumber ?? r.stateId}` : ''}
          </p>
        </div>
        <button className="btn ghost sm" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="detail-tier">
        <span className={`tier tier-${e.tier}`}>Tier {e.tier}</span>
        <span className="small muted">
          {e.flags.length} {e.flags.length === 1 ? 'flag' : 'flags'} in {latest.label}. {rules.tiers}
        </span>
      </div>

      <ul className="detail-areas">
        {RULE_CATEGORIES.map((c) => {
          if (!latest.rules[c]) {
            return (
              <li key={c} className="na">
                <h3>{RULE_LABELS[c]}</h3>
                <p className="small muted">Not in your {latest.label} files.</p>
              </li>
            )
          }
          const flag = e.flags.find((f) => f.category === c)
          return (
            <li key={c} className={flag ? 'flagged' : undefined}>
              <h3>
                {RULE_LABELS[c]}
                <span className={`tag${flag ? ' look' : ''}`}>{flag ? 'Flagged' : 'No flag'}</span>
              </h3>
              <p className="detail-value num">{valueText(e, c)}</p>
              <p className="small muted">{flag ? flag.reason : rules[c]}</p>
              {c === 'attendance' && e.attendanceMethod && (
                <p className="small muted">Source: {ATTENDANCE_METHOD_LABELS[e.attendanceMethod].toLowerCase()}.</p>
              )}
              {c === 'academics' && e.failingCourses.length > 0 && (
                <p className="small muted">Failing: {e.failingCourses.map((x) => `${x.course ?? 'course'} (${x.grade})`).join(', ')}.</p>
              )}
              {c === 'behavior' && r.resolutionCodes.length > 0 && (
                <p className="small muted">Resolution codes: {r.resolutionCodes.join(', ')}.</p>
              )}
            </li>
          )
        })}
      </ul>

      {multi && (
        <div>
          <h3 className="detail-h3">Across snapshots</h3>
          <div className="table-wrap">
            <table className="detail-table num">
              <thead>
                <tr>
                  <th />
                  {results.labels.map((l) => (
                    <th key={l} className="r">
                      {l}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Tier</th>
                  {student.history.map((h, i) => (
                    <td key={i} className="r">
                      {cell(h, (x) => String(x.tier))}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Absent</th>
                  {student.history.map((h, i) => (
                    <td key={i} className="r">
                      {cell(h, (x) => (x.absencePct == null ? null : `${x.absencePct.toFixed(1)}%`))}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">GPA</th>
                  {student.history.map((h, i) => (
                    <td key={i} className="r">
                      {cell(h, (x) => (x.gpa == null ? null : x.gpa.toFixed(2)))}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Incidents</th>
                  {student.history.map((h, i) => (
                    <td key={i} className="r">
                      {cell(h, (x) => (x.incidents == null ? null : String(x.incidents)))}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="small muted">
            A dash means the snapshot had no value. Tiers count only the data each snapshot included.
          </p>
        </div>
      )}
    </Modal>
  )
}

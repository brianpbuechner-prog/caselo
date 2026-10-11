import { useMemo, useState } from 'react'
import { CHANGE_LABELS, gradeSortValue, newlyFlagged, type ChangeStatus, type Results, type StudentResult } from '../../lib/compare/analyze'
import { downloadText, resultsToCsv } from '../../lib/export/csv'
import { ATTENDANCE_METHOD_LABELS, RULE_CATEGORIES, RULE_LABELS, type RuleCategory } from '../../lib/rules/engine'

export interface ListFilter {
  search: string
  tier: 'all' | '1' | '2' | '3' | '2+'
  flag: 'any' | 'none' | RuleCategory
  grade: string
  change: 'all' | ChangeStatus
  newly: RuleCategory | null
}

export const DEFAULT_FILTER: ListFilter = { search: '', tier: 'all', flag: 'any', grade: 'all', change: 'all', newly: null }

type SortKey = 'priority' | 'name' | 'grade' | 'absence' | 'gpa' | 'incidents' | 'change'

const name = (s: StudentResult) =>
  [s.latest.row.lastName, s.latest.row.firstName].filter(Boolean).join(', ') || s.latest.row.studentNumber || s.key

/** Nulls always sort last. */
function cmpNum(a: number | null, b: number | null, dir: number): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return (a - b) * dir
}

function prioritySort(a: StudentResult, b: StudentResult): number {
  return (
    b.latest.tier - a.latest.tier ||
    b.latest.flags.length - a.latest.flags.length ||
    cmpNum(a.latest.absencePct, b.latest.absencePct, -1) ||
    cmpNum(a.latest.gpa, b.latest.gpa, 1) ||
    name(a).localeCompare(name(b))
  )
}

export function StudentList({
  results,
  filter,
  onFilter,
  compact,
  onCompact,
}: {
  results: Results
  filter: ListFilter
  onFilter: (f: Partial<ListFilter>) => void
  compact: boolean
  onCompact: (v: boolean) => void
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'priority', dir: 1 })
  const latest = results.summaries[results.summaries.length - 1]
  const multi = results.labels.length > 1
  const grades = useMemo(() => results.byGrade.map((g) => g.grade), [results])
  const show = {
    attendance: latest.rules.attendance,
    academics: latest.rules.academics,
    behavior: latest.rules.behavior,
  }

  const rows = useMemo(() => {
    const q = filter.search.trim().toLowerCase()
    const list = results.students.filter((s) => {
      const e = s.latest
      if (q) {
        const hay = [e.row.lastName, e.row.firstName, e.row.studentNumber, e.row.stateId].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (filter.tier === '2+' ? e.tier < 2 : filter.tier !== 'all' && String(e.tier) !== filter.tier) return false
      if (filter.flag === 'none' && e.flags.length) return false
      if (filter.flag !== 'any' && filter.flag !== 'none' && !e.flags.some((f) => f.category === filter.flag)) return false
      if (filter.grade !== 'all' && (e.row.grade ?? 'Unknown') !== filter.grade) return false
      if (filter.change !== 'all' && s.change !== filter.change) return false
      if (filter.newly && !newlyFlagged(s, filter.newly)) return false
      return true
    })
    const d = sort.dir
    const changeRank: Record<string, number> = { up: 0, new: 1, same: 2, down: 3 }
    const sorters: Record<SortKey, (a: StudentResult, b: StudentResult) => number> = {
      priority: (a, b) => prioritySort(a, b) * d,
      name: (a, b) => name(a).localeCompare(name(b)) * d,
      grade: (a, b) => (gradeSortValue(a.latest.row.grade ?? '') - gradeSortValue(b.latest.row.grade ?? '')) * d || prioritySort(a, b),
      absence: (a, b) => cmpNum(a.latest.absencePct, b.latest.absencePct, -d) || prioritySort(a, b),
      gpa: (a, b) => cmpNum(a.latest.gpa, b.latest.gpa, d) || prioritySort(a, b),
      incidents: (a, b) => cmpNum(a.latest.incidents, b.latest.incidents, -d) || prioritySort(a, b),
      change: (a, b) => ((changeRank[a.change ?? 'same'] ?? 9) - (changeRank[b.change ?? 'same'] ?? 9)) * d || prioritySort(a, b),
    }
    return [...list].sort(sorters[sort.key])
  }, [results, filter, sort])

  const head = (key: SortKey, label: string, right = false) => (
    <th className={right ? 'r' : undefined} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((s.dir * -1) as 1 | -1) : 1 }))}>
        {label}
        {sort.key === key && <span aria-hidden="true">{sort.dir === 1 ? '↓' : '↑'}</span>}
      </button>
    </th>
  )

  const filtered = rows.length !== results.students.length

  return (
    <div className="section">
      <div className="section-head">
        <h2>Students</h2>
        <span className="small muted">
          Sorted by priority: tier, then number of flags, then absence rate, then GPA. Select a column to sort by it.
        </span>
      </div>
      <div className="card">
        <div className="filters">
          <input
            type="search"
            placeholder="Search name or ID"
            aria-label="Search students"
            value={filter.search}
            onChange={(e) => onFilter({ search: e.target.value })}
          />
          <select aria-label="Tier" value={filter.tier} onChange={(e) => onFilter({ tier: e.target.value as ListFilter['tier'] })}>
            <option value="all">All tiers</option>
            <option value="2+">Tier 2 and 3</option>
            <option value="3">Tier 3</option>
            <option value="2">Tier 2</option>
            <option value="1">Tier 1</option>
          </select>
          <select aria-label="Flag" value={filter.flag} onChange={(e) => onFilter({ flag: e.target.value as ListFilter['flag'] })}>
            <option value="any">Any or no flag</option>
            {RULE_CATEGORIES.filter((c) => show[c]).map((c) => (
              <option key={c} value={c}>
                {RULE_LABELS[c]} flag
              </option>
            ))}
            <option value="none">No flags</option>
          </select>
          <select aria-label="Grade" value={filter.grade} onChange={(e) => onFilter({ grade: e.target.value })}>
            <option value="all">All grades</option>
            {grades.map((g) => (
              <option key={g} value={g}>
                Grade {g}
              </option>
            ))}
          </select>
          {multi && (
            <select
              aria-label="Change"
              value={filter.newly ? `newly-${filter.newly}` : filter.change}
              onChange={(e) => {
                const v = e.target.value
                if (v.startsWith('newly-')) onFilter({ change: 'all', newly: v.slice(6) as RuleCategory })
                else onFilter({ change: v as ListFilter['change'], newly: null })
              }}
            >
              <option value="all">Any change</option>
              {(Object.keys(CHANGE_LABELS) as ChangeStatus[]).map((c) => (
                <option key={c} value={c}>
                  {CHANGE_LABELS[c]}
                </option>
              ))}
              {RULE_CATEGORIES.filter((c) => show[c]).map((c) => (
                <option key={c} value={`newly-${c}`}>
                  Newly flagged: {RULE_LABELS[c].toLowerCase()}
                </option>
              ))}
            </select>
          )}
          <span className="count num" role="status">
            {filtered ? `${rows.length} of ${results.students.length}` : `${rows.length}`} students
          </span>
          {filtered && (
            <button className="btn ghost sm" onClick={() => onFilter({ ...DEFAULT_FILTER })}>
              Clear filters
            </button>
          )}
          <label className="small muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={compact} onChange={(e) => onCompact(e.target.checked)} /> Compact
          </label>
          <button
            className="btn sm"
            onClick={() =>
              downloadText(`caselo-${latest.label.replace(/[^\w-]+/g, '-').toLowerCase()}-students.csv`, resultsToCsv(rows, results.labels))
            }
          >
            Export CSV
          </button>
        </div>
        <div className="table-wrap">
          <table className={compact ? 'compact' : undefined}>
            <thead>
              <tr>
                {head('priority', 'Tier')}
                {head('name', 'Student')}
                {head('grade', 'Grade')}
                {show.attendance && head('absence', 'Absent', true)}
                {show.academics && head('gpa', 'GPA', true)}
                {show.behavior && head('incidents', 'Incidents', true)}
                <th>Why flagged</th>
                {multi && head('change', 'Change')}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <Row key={s.key} s={s} labels={results.labels} show={show} multi={multi} />
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted">
                    No students match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Row({
  s,
  labels,
  show,
  multi,
}: {
  s: StudentResult
  labels: string[]
  show: Record<RuleCategory, boolean>
  multi: boolean
}) {
  const e = s.latest
  const r = e.row
  const hist = (fn: (i: number) => string | null) =>
    multi ? (
      <div className="history num">
        {labels
          .map((l, i) => {
            const v = fn(i)
            return v == null ? null : `${l} ${v}`
          })
          .filter(Boolean)
          .join(', ')}
      </div>
    ) : null
  return (
    <tr>
      <td>
        <span className={`tier tier-${e.tier}`} title={`Tier ${e.tier}`}>
          Tier {e.tier}
        </span>
      </td>
      <td>
        <div className="student-name">{[r.lastName, r.firstName].filter(Boolean).join(', ') || 'No name'}</div>
        <div className="small muted num">{r.studentNumber ?? r.stateId}</div>
      </td>
      <td className="num">{r.grade ?? ''}</td>
      {show.attendance && (
        <td className="r num" title={e.attendanceMethod ? ATTENDANCE_METHOD_LABELS[e.attendanceMethod] : undefined}>
          {e.absencePct != null ? `${e.absencePct.toFixed(1)}%` : e.absenceCount != null ? `${e.absenceCount} days` : ''}
          {hist((i) => {
            const h = s.history[i]
            return h?.absencePct == null ? null : `${h.absencePct.toFixed(1)}%`
          })}
        </td>
      )}
      {show.academics && (
        <td className="r num">
          {e.gpa != null ? e.gpa.toFixed(2) : ''}
          {hist((i) => {
            const h = s.history[i]
            return h?.gpa == null ? null : h.gpa.toFixed(2)
          })}
        </td>
      )}
      {show.behavior && <td className="r num">{e.incidents ?? ''}</td>}
      <td>
        {e.flags.length ? (
          <ul className="reasons">
            {e.flags.map((f) => (
              <li key={f.category}>
                <span className="tag accent">{RULE_LABELS[f.category]}</span>
                <span>{f.reason}</span>
              </li>
            ))}
          </ul>
        ) : (
          <span className="muted small">No flags</span>
        )}
      </td>
      {multi && (
        <td>
          {s.change && <span className="small">{CHANGE_LABELS[s.change]}</span>}
          {s.comparableTiers && s.change !== 'same' && (
            <div className="history">
              Tier {s.comparableTiers.previous} to {s.comparableTiers.latest}
            </div>
          )}
        </td>
      )}
    </tr>
  )
}

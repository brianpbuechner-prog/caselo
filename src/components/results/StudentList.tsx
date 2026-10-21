// The full student list. Values that caused a signal are marked; selecting
// one shows the rule. Selecting a name opens that student's detail.

import { useEffect, useMemo, useRef, useState } from 'react'
import { gradeSortValue, newlyFlagged, type ChangeStatus, type Results, type StudentResult } from '../../lib/compare/analyze'
import { downloadText, resultsToCsv } from '../../lib/export/csv'
import { RULE_CATEGORIES, RULE_LABELS, type MarkedValue, type RuleCategory } from '../../lib/rules/engine'
import { comboKey } from '../../lib/compare/insights'
import { DIRECTION_LABELS, TIER_NAMES, TIER_SHORT, type Direction } from '../../lib/language'
import type { TierFilter } from './TierBar'

export interface ListFilter {
  search: string
  tier: TierFilter
  flag: 'any' | 'none' | RuleCategory
  grade: string
  change: 'all' | ChangeStatus
  newly: RuleCategory | null
  /** Students flagged in the previous snapshot for this category and not now. */
  resolved: RuleCategory | null
  /** An exact set of flags, as made by comboKey. */
  combo: string | null
  /** Direction since the last snapshot. "quiet" is slipping with no signals; "near" is close to a line. */
  direction: 'all' | Direction | 'quiet' | 'near'
}

export const DEFAULT_FILTER: ListFilter = { search: '', tier: 'all', flag: 'any', grade: 'all', change: 'all', newly: null, resolved: null, combo: null, direction: 'all' }

export const DIRECTION_FILTER_LABELS: Record<Exclude<ListFilter['direction'], 'all'>, string> = {
  quiet: 'Slipping, no signals yet',
  near: 'Close to a line',
  ...DIRECTION_LABELS,
}

type SortKey = 'priority' | 'name' | 'grade' | 'absence' | 'gpa' | 'failing' | 'incidents' | 'change'

export const studentName = (s: StudentResult) =>
  [s.latest.row.lastName, s.latest.row.firstName].filter(Boolean).join(', ') || s.latest.row.studentNumber || s.key
const name = studentName

const hasFlag = (e: StudentResult['latest'] | null, c: RuleCategory) => Boolean(e?.flags.some((f) => f.category === c))

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

const DIRECTION_RANK: Record<string, number> = { slipping: 0, new: 1, finding: 2, gaining: 3, steady: 4 }
const directionKey = (s: StudentResult) => (s.change === 'new' ? 'new' : (s.movement?.direction ?? 'steady'))

export function StudentList({
  results,
  filter,
  onFilter,
  compact,
  onOpenStudent,
}: {
  results: Results
  filter: ListFilter
  onFilter: (f: Partial<ListFilter>) => void
  compact: boolean
  onOpenStudent: (key: string) => void
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'priority', dir: 1 })
  const latest = results.summaries[results.summaries.length - 1]
  const multi = results.labels.length > 1
  const grades = useMemo(() => results.byGrade.map((g) => g.grade), [results])
  const show = {
    absence: latest.rules.attendance,
    gpa: latest.rules.academics && latest.categories.includes('gpa'),
    failing: latest.categories.includes('courseGrades'),
    incidents: latest.rules.behavior,
  }

  const rows = useMemo(() => {
    const q = filter.search.trim().toLowerCase()
    const list = results.students.filter((s) => {
      const e = s.latest
      if (q) {
        const hay = [e.row.lastName, e.row.firstName, e.row.studentNumber, e.row.stateId].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (filter.tier !== 'all' && String(e.tier) !== filter.tier) return false
      if (filter.flag === 'none' && e.flags.length) return false
      if (filter.flag !== 'any' && filter.flag !== 'none' && !e.flags.some((f) => f.category === filter.flag)) return false
      if (filter.grade !== 'all' && (e.row.grade ?? 'Unknown') !== filter.grade) return false
      if (filter.change !== 'all' && s.change !== filter.change) return false
      if (filter.newly && !newlyFlagged(s, filter.newly)) return false
      if (filter.resolved && !(hasFlag(s.previous, filter.resolved) && !hasFlag(e, filter.resolved))) return false
      if (filter.combo && comboKey(e.flags.map((f) => f.category)) !== filter.combo) return false
      if (filter.direction === 'quiet' && !(e.flags.length === 0 && s.movement?.direction === 'slipping')) return false
      if (filter.direction === 'near' && s.near.length === 0) return false
      if (filter.direction !== 'all' && filter.direction !== 'quiet' && filter.direction !== 'near' && s.movement?.direction !== filter.direction) return false
      return true
    })
    const d = sort.dir
    const sorters: Record<SortKey, (a: StudentResult, b: StudentResult) => number> = {
      priority: (a, b) => prioritySort(a, b) * d,
      name: (a, b) => name(a).localeCompare(name(b)) * d,
      grade: (a, b) => (gradeSortValue(a.latest.row.grade ?? '') - gradeSortValue(b.latest.row.grade ?? '')) * d || prioritySort(a, b),
      absence: (a, b) => cmpNum(a.latest.absencePct, b.latest.absencePct, -d) || prioritySort(a, b),
      gpa: (a, b) => cmpNum(a.latest.gpa, b.latest.gpa, d) || prioritySort(a, b),
      failing: (a, b) => (b.latest.failingCourses.length - a.latest.failingCourses.length) * d || prioritySort(a, b),
      incidents: (a, b) => cmpNum(a.latest.incidents, b.latest.incidents, -d) || prioritySort(a, b),
      change: (a, b) => ((DIRECTION_RANK[directionKey(a)] ?? 9) - (DIRECTION_RANK[directionKey(b)] ?? 9)) * d || prioritySort(a, b),
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
  const changeValue = filter.newly
    ? `newly-${filter.newly}`
    : filter.resolved
      ? `resolved-${filter.resolved}`
      : filter.direction !== 'all'
        ? `dir-${filter.direction}`
        : filter.change

  return (
    <section className="card list" aria-label="All students">
      <div className="filters">
        <input
          type="search"
          placeholder="Search name or ID"
          aria-label="Search students"
          value={filter.search}
          onChange={(e) => onFilter({ search: e.target.value })}
        />
        <select aria-label="Signal" value={filter.flag} onChange={(e) => onFilter({ flag: e.target.value as ListFilter['flag'] })}>
          <option value="any">All signals</option>
          {RULE_CATEGORIES.filter((c) => latest.rules[c]).map((c) => (
            <option key={c} value={c}>
              {RULE_LABELS[c]}
            </option>
          ))}
          <option value="none">No signals</option>
        </select>
        <select aria-label="Grade" value={filter.grade} onChange={(e) => onFilter({ grade: e.target.value })}>
          <option value="all">All grades</option>
          {grades.map((g) => (
            <option key={g} value={g}>
              Grade {g}
            </option>
          ))}
        </select>
        <select
          aria-label="Direction"
          value={changeValue}
          onChange={(e) => {
            const v = e.target.value
            const reset = { change: 'all' as const, newly: null, resolved: null, direction: 'all' as const }
            if (v.startsWith('newly-')) onFilter({ ...reset, newly: v.slice(6) as RuleCategory })
            else if (v.startsWith('resolved-')) onFilter({ ...reset, resolved: v.slice(9) as RuleCategory })
            else if (v.startsWith('dir-')) onFilter({ ...reset, direction: v.slice(4) as ListFilter['direction'] })
            else onFilter({ ...reset, change: v as ListFilter['change'] })
          }}
        >
          <option value="all">{multi ? 'Any direction' : 'Everyone'}</option>
          {multi ? (
            <>
              <option value="dir-quiet">{DIRECTION_FILTER_LABELS.quiet}</option>
              <option value="dir-slipping">Slipping</option>
              <option value="dir-finding">Finding footing</option>
              <option value="dir-gaining">Gaining ground</option>
              <option value="dir-steady">Steady</option>
              <option value="new">New in {latest.label}</option>
              {results.transitions?.comparable.map((c) => (
                <option key={c} value={`newly-${c}`}>
                  New {RULE_LABELS[c].toLowerCase()} signal
                </option>
              ))}
              {results.transitions?.comparable.map((c) => (
                <option key={c} value={`resolved-${c}`}>
                  {RULE_LABELS[c]} signal cleared
                </option>
              ))}
            </>
          ) : (
            <option value="dir-near">{DIRECTION_FILTER_LABELS.near}</option>
          )}
        </select>
        <span className="count num" role="status">
          {filtered ? `${rows.length} of ${results.students.length}` : rows.length} students
        </span>
        {filter.combo && (
          <span className="chip static">
            {filter.combo.split('+').map((c) => RULE_LABELS[c as RuleCategory]).join(' and ')}
            {filter.combo.includes('+') ? '' : ' only'}
          </span>
        )}
        {filtered && (
          <button className="btn ghost sm" onClick={() => onFilter({ ...DEFAULT_FILTER })}>
            Clear
          </button>
        )}
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
              {head('priority', 'Support')}
              {head('name', 'Student')}
              {head('grade', 'Grade')}
              {show.absence && head('absence', 'Absent', true)}
              {show.gpa && head('gpa', 'GPA', true)}
              {show.failing && head('failing', 'Failing', true)}
              {show.incidents && head('incidents', 'Incidents', true)}
              {multi && head('change', `Since ${results.labels.at(-2)}`)}
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <Row key={s.key} s={s} labels={results.labels} show={show} multi={multi} onOpen={() => onOpenStudent(s.key)} />
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
      <p className="list-foot small muted">Marked values caused a signal. Select one to see the rule, or a name to see the student.</p>
    </section>
  )
}

/** A value cell. When the value caused a signal it is marked and opens its rule. */
function Value({ text, mark, history }: { text: string; mark?: string; history?: string | null }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <td className="r num">
      {mark ? (
        <span className="mark-wrap" ref={ref}>
          <button className="mark" aria-expanded={open} aria-label={`${text}. Show the rule`} onClick={() => setOpen((o) => !o)}>
            {text}
          </button>
          {open && (
            <span className="pop" role="note">
              {mark}
            </span>
          )}
        </span>
      ) : (
        text
      )}
      {history && <div className="history">{history}</div>}
    </td>
  )
}

function Row({
  s,
  labels,
  show,
  multi,
  onOpen,
}: {
  s: StudentResult
  labels: string[]
  show: Record<MarkedValue, boolean>
  multi: boolean
  onOpen: () => void
}) {
  const e = s.latest
  const r = e.row
  // Show an earlier value only when it differs enough to matter.
  const hist = (get: (h: (typeof s.history)[number]) => number | null, fmt: (n: number) => string, minChange: number) => {
    if (!multi) return null
    const now = get(e)
    const parts = labels.slice(0, -1).flatMap((l, i) => {
      const h = s.history[i]
      const v = h ? get(h) : null
      if (v == null || (now != null && Math.abs(v - now) < minChange)) return []
      return [`${l} ${fmt(v)}`]
    })
    return parts.join(', ') || null
  }
  return (
    <tr className={e.tier === 1 ? 'calm' : undefined}>
      <td>
        <span className={`tier tier-${e.tier}`} title={`${TIER_NAMES[e.tier]} (Tier ${e.tier})`}>
          {TIER_SHORT[e.tier]}
        </span>
      </td>
      <td>
        <button className="student-name" onClick={onOpen}>
          {[r.lastName, r.firstName].filter(Boolean).join(', ') || 'No name'}
        </button>
        <div className="small muted num">{r.studentNumber ?? r.stateId}</div>
      </td>
      <td className="num">{r.grade ?? ''}</td>
      {show.absence && (
        <Value
          text={e.absencePct != null ? `${e.absencePct.toFixed(1)}%` : e.absenceCount != null ? `${e.absenceCount} days` : ''}
          mark={e.marks.absence}
          history={hist((h) => h?.absencePct ?? null, (n) => `${n.toFixed(1)}%`, 1)}
        />
      )}
      {show.gpa && (
        <Value
          text={e.gpa != null ? e.gpa.toFixed(2) : ''}
          mark={e.marks.gpa}
          history={hist((h) => h?.gpa ?? null, (n) => n.toFixed(2), 0.1)}
        />
      )}
      {show.failing && <Value text={String(e.failingCourses.length)} mark={e.marks.failing} />}
      {show.incidents && <Value text={e.incidents == null ? '' : String(e.incidents)} mark={e.marks.incidents} />}
      {multi && (
        <td>
          {s.change === 'new' ? (
            <span className="small">New</span>
          ) : (
            s.movement &&
            s.movement.direction !== 'steady' && (
              <span className={`small dir dir-${s.movement.direction}`} title={s.movement.reasons.join('. ')}>
                {DIRECTION_LABELS[s.movement.direction]}
              </span>
            )
          )}
        </td>
      )}
    </tr>
  )
}

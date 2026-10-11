// The Students tab: one wins-first number, the tier bar, then the list.
// Values that caused a flag are marked; selecting one shows the rule.

import { useEffect, useMemo, useRef, useState } from 'react'
import { gradeSortValue, newlyFlagged, type ChangeStatus, type Results, type StudentResult } from '../../lib/compare/analyze'
import { downloadText, resultsToCsv } from '../../lib/export/csv'
import { RULE_CATEGORIES, RULE_LABELS, type MarkedValue, type RuleCategory } from '../../lib/rules/engine'
import { TierBar, type TierFilter } from './TierBar'

export interface ListFilter {
  search: string
  tier: TierFilter
  flag: 'any' | 'none' | RuleCategory
  grade: string
  change: 'all' | ChangeStatus
  newly: RuleCategory | null
}

export const DEFAULT_FILTER: ListFilter = { search: '', tier: 'all', flag: 'any', grade: 'all', change: 'all', newly: null }

type SortKey = 'priority' | 'name' | 'grade' | 'absence' | 'gpa' | 'failing' | 'incidents' | 'change'

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

const CHANGE_SHORT: Record<ChangeStatus, string> = {
  up: 'Up',
  down: 'Down',
  same: '',
  new: 'New',
}

export function StudentsTab({
  results,
  filter,
  onFilter,
  compact,
}: {
  results: Results
  filter: ListFilter
  onFilter: (f: Partial<ListFilter>) => void
  compact: boolean
}) {
  const latest = results.summaries[results.summaries.length - 1]
  const noFlags = results.students.filter((s) => s.latest.flags.length === 0).length
  return (
    <>
      <section className="glance card" aria-label="Caseload at a glance">
        <div className="glance-win">
          <span className="big num">{latest.students ? Math.round((noFlags / latest.students) * 100) : 0}%</span>
          <span>
            of students have no flags
            <span className="muted small num">
              {noFlags} of {latest.students} in {latest.label}
            </span>
          </span>
        </div>
        <TierBar tiers={latest.tiers} total={latest.students} selected={filter.tier} onSelect={(tier) => onFilter({ tier })} />
      </section>
      <StudentList results={results} filter={filter} onFilter={onFilter} compact={compact} />
    </>
  )
}

function StudentList({
  results,
  filter,
  onFilter,
  compact,
}: {
  results: Results
  filter: ListFilter
  onFilter: (f: Partial<ListFilter>) => void
  compact: boolean
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
      failing: (a, b) => (b.latest.failingCourses.length - a.latest.failingCourses.length) * d || prioritySort(a, b),
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
  const changeValue = filter.newly ? `newly-${filter.newly}` : filter.change

  return (
    <section className="card list" aria-label="Students">
      <div className="filters">
        <input
          type="search"
          placeholder="Search name or ID"
          aria-label="Search students"
          value={filter.search}
          onChange={(e) => onFilter({ search: e.target.value })}
        />
        <select aria-label="Flag" value={filter.flag} onChange={(e) => onFilter({ flag: e.target.value as ListFilter['flag'] })}>
          <option value="any">All flags</option>
          {RULE_CATEGORIES.filter((c) => latest.rules[c]).map((c) => (
            <option key={c} value={c}>
              {RULE_LABELS[c]}
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
            value={changeValue}
            onChange={(e) => {
              const v = e.target.value
              if (v.startsWith('newly-')) onFilter({ change: 'all', newly: v.slice(6) as RuleCategory })
              else onFilter({ change: v as ListFilter['change'], newly: null })
            }}
          >
            <option value="all">Any change</option>
            <option value="up">Moved up a tier</option>
            <option value="down">Moved down a tier</option>
            <option value="new">New in {latest.label}</option>
            {results.transitions?.comparable.map((c) => (
              <option key={c} value={`newly-${c}`}>
                Newly flagged: {RULE_LABELS[c].toLowerCase()}
              </option>
            ))}
          </select>
        )}
        <span className="count num" role="status">
          {filtered ? `${rows.length} of ${results.students.length}` : rows.length} students
        </span>
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
              {head('priority', 'Tier')}
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
      <p className="list-foot small muted">Marked values caused a flag. Select one to see the rule.</p>
    </section>
  )
}

/** A value cell. When the value caused a flag it is marked and opens its rule. */
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
}: {
  s: StudentResult
  labels: string[]
  show: Record<MarkedValue, boolean>
  multi: boolean
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
        <span className={`tier tier-${e.tier}`}>Tier {e.tier}</span>
      </td>
      <td>
        <div className="student-name">{[r.lastName, r.firstName].filter(Boolean).join(', ') || 'No name'}</div>
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
          {s.change && CHANGE_SHORT[s.change] && (
            <span className="small">
              {CHANGE_SHORT[s.change]}
              {s.comparableTiers && s.change !== 'same' && (
                <span className="muted">
                  {' '}
                  from Tier {s.comparableTiers.previous}
                </span>
              )}
            </span>
          )}
        </td>
      )}
    </tr>
  )
}

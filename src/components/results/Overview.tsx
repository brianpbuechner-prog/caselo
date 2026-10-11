// Caseload-level views: missing data notice, summary tiles, change between
// snapshots, and counts by grade.

import type { ReactNode } from 'react'
import { ruleDescriptions, type Thresholds } from '../../config/rules'
import type { Results, Transitions } from '../../lib/compare/analyze'
import type { Snapshot } from '../../lib/model'
import { RULE_CATEGORIES, RULE_LABELS, type RuleCategory } from '../../lib/rules/engine'
import type { ListFilter } from './StudentList'

const pct = (n: number, d: number) => (d === 0 ? '0%' : `${Math.round((n / d) * 1000) / 10}%`)
const signed = (n: number) => (n > 0 ? `+${n}` : String(n))

const MISSING_TEXT: Record<RuleCategory, string> = {
  attendance: 'Attendance (absence percentage, days absent and scheduled days, or attendance detail)',
  academics: 'Academics (GPA or course grades)',
  behavior: 'Behavior (incident records)',
}

export function MissingNotice({
  results,
  snapshots,
  warnings,
  thresholds,
}: {
  results: Results
  snapshots: Snapshot[]
  warnings: string[]
  thresholds: Thresholds
}) {
  const latest = results.summaries[results.summaries.length - 1]
  const earlierGaps = results.summaries
    .slice(0, -1)
    .map((s) => ({ label: s.label, missing: RULE_CATEGORIES.filter((c) => !s.rules[c] && latest.rules[c]) }))
    .filter((g) => g.missing.length)
  const usesDistrictPct = snapshots[snapshots.length - 1].files.some((f) => f.categories.includes('attendanceSummary'))
  const rules = ruleDescriptions(thresholds)
  return (
    <div className="section" style={{ display: 'grid', gap: 10 }}>
      {results.missingRules.length > 0 && (
        <div className="notice">
          <strong>Not in your files for {latest.label}</strong>
          <span>
            {results.missingRules.map((c) => MISSING_TEXT[c]).join('. ')}. Rules for{' '}
            {results.missingRules.length === 1 ? 'this category were' : 'these categories were'} not run, and no
            student is flagged for {results.missingRules.length === 1 ? 'it' : 'them'}.
          </span>
        </div>
      )}
      {earlierGaps.map((g) => (
        <div className="notice" key={g.label}>
          <span>
            {g.label} has no {g.missing.map((c) => RULE_LABELS[c].toLowerCase()).join(' or ')} data, so change in{' '}
            {g.missing.length === 1 ? 'that category' : 'those categories'} is not compared.
          </span>
        </div>
      ))}
      {latest.rules.attendance && usesDistrictPct && (
        <div className="notice accent">
          <span>
            {rules.attendance} Absence percentages come from Infinite Campus
            (attChronicAbsenteeism.absenteeismPercentage) and reflect your district's own attendance calculation
            method.
          </span>
        </div>
      )}
      {warnings.map((w) => (
        <div className="notice" key={w}>
          <span>{w}</span>
        </div>
      ))}
    </div>
  )
}

export function SummaryTiles({ results }: { results: Results }) {
  const n = results.summaries.length
  const latest = results.summaries[n - 1]
  const prev = n > 1 ? results.summaries[n - 2] : null
  const change = (a: number, b: number | undefined) =>
    prev && b !== undefined ? <div className="sub num">{signed(a - b)} since {prev.label}</div> : null
  // Tier counts are only comparable when both snapshots had the same kinds of data.
  const sameRules = prev ? RULE_CATEGORIES.every((c) => prev.rules[c] === latest.rules[c]) : false
  const tierChange = (a: number, b: number | undefined) => (sameRules ? change(a, b) : null)

  const tiles = [
    { label: 'Students', value: latest.students, sub: change(latest.students, prev?.students) },
    {
      label: 'Tier 3',
      value: latest.tiers[3],
      sub: (
        <>
          <div className="sub num">{pct(latest.tiers[3], latest.students)} of students</div>
          {tierChange(latest.tiers[3], prev?.tiers[3])}
        </>
      ),
    },
    {
      label: 'Tier 2',
      value: latest.tiers[2],
      sub: (
        <>
          <div className="sub num">{pct(latest.tiers[2], latest.students)} of students</div>
          {tierChange(latest.tiers[2], prev?.tiers[2])}
        </>
      ),
    },
  ]
  return (
    <div className="section">
      <div className="section-head">
        <h2>{latest.label}</h2>
        <span className="small muted">Caseload summary</span>
      </div>
      <div className="tiles">
        {tiles.map((t) => (
          <div key={t.label} className="card tile">
            <div className="label">{t.label}</div>
            <div className="value num">{t.value}</div>
            {t.sub}
          </div>
        ))}
        {RULE_CATEGORIES.map((c) =>
          latest.rules[c] ? (
            <div key={c} className="card tile">
              <div className="label">{RULE_LABELS[c]} flags</div>
              <div className="value num">{latest.flagged[c]}</div>
              <div className="sub num">{pct(latest.flagged[c], latest.students)} of students</div>
              {prev?.rules[c] ? change(latest.flagged[c], prev.flagged[c]) : null}
            </div>
          ) : (
            <div key={c} className="card tile na">
              <div className="label">{RULE_LABELS[c]} flags</div>
              <div className="value">Not in files</div>
            </div>
          ),
        )}
      </div>
    </div>
  )
}

export function ChangeView({
  results,
  filter,
  onFilter,
}: {
  results: Results
  filter: ListFilter
  onFilter: (f: Partial<ListFilter>) => void
}) {
  const tr = results.transitions
  if (!tr) return null
  const chip = (on: boolean, label: ReactNode, apply: Partial<ListFilter>) => (
    <button
      className={`chip${on ? ' on' : ''}`}
      onClick={() => onFilter(on ? { change: 'all', newly: null } : { change: 'all', newly: null, ...apply })}
      aria-pressed={on}
    >
      {label}
    </button>
  )
  return (
    <div className="section">
      <div className="section-head">
        <h2>
          Change from {tr.from} to {tr.to}
        </h2>
        <span className="small muted">
          {tr.comparable.length < RULE_CATEGORIES.filter((c) => results.summaries.at(-1)!.rules[c]).length
            ? `Tier changes count only ${tr.comparable.map((c) => RULE_LABELS[c].toLowerCase()).join(' and ')}, the categories in both snapshots. `
            : ''}
          Select a count to filter the student list.
        </span>
      </div>
      <div className="card pad" style={{ display: 'grid', gap: 14 }}>
        <div className="chips">
          {chip(filter.change === 'up', <><b className="num">{tr.tierUp}</b> moved up a tier</>, { change: 'up' })}
          {chip(filter.change === 'down', <><b className="num">{tr.tierDown}</b> moved down a tier</>, { change: 'down' })}
          {tr.comparable.map((c) => (
            <NewlyChips key={c} c={c} tr={tr} filter={filter} chip={chip} />
          ))}
          {chip(filter.change === 'new', <><b className="num">{tr.onlyInLatest}</b> new in {tr.to}</>, { change: 'new' })}
          <span className="chip" style={{ cursor: 'default' }}>
            <b className="num">{tr.onlyInPrevious}</b> in {tr.from} but not {tr.to}
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Snapshot</th>
                <th className="r">Students</th>
                <th className="r">Tier 3</th>
                <th className="r">Tier 2</th>
                {RULE_CATEGORIES.map((c) => (
                  <th key={c} className="r">
                    {RULE_LABELS[c]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.summaries.map((s) => (
                <tr key={s.label}>
                  <td>{s.label}</td>
                  <td className="r num">{s.students}</td>
                  <td className="r num">
                    {s.tiers[3]} <span className="muted">({pct(s.tiers[3], s.students)})</span>
                  </td>
                  <td className="r num">
                    {s.tiers[2]} <span className="muted">({pct(s.tiers[2], s.students)})</span>
                  </td>
                  {RULE_CATEGORIES.map((c) => (
                    <td key={c} className="r num">
                      {s.rules[c] ? (
                        <>
                          {s.flagged[c]} <span className="muted">({pct(s.flagged[c], s.students)})</span>
                        </>
                      ) : (
                        <span className="muted">Not in files</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function NewlyChips({
  c,
  tr,
  filter,
  chip,
}: {
  c: RuleCategory
  tr: Transitions
  filter: ListFilter
  chip: (on: boolean, label: ReactNode, apply: Partial<ListFilter>) => ReactNode
}) {
  const name = c === 'attendance' ? 'chronically absent' : `flagged for ${RULE_LABELS[c].toLowerCase()}`
  return (
    <>
      {chip(filter.newly === c, <><b className="num">{tr.newlyFlagged[c]}</b> newly {name}</>, { newly: c })}
      <span className="chip" style={{ cursor: 'default' }}>
        <b className="num">{tr.noLongerFlagged[c]}</b> no longer {name}
      </span>
    </>
  )
}

export function ByGrade({ results }: { results: Results }) {
  const latest = results.summaries[results.summaries.length - 1]
  const cats = RULE_CATEGORIES.filter((c) => latest.rules[c])
  return (
    <div className="section">
      <div className="section-head">
        <h2>By grade</h2>
        <span className="small muted">{latest.label}. Counts with the rate in each grade.</span>
      </div>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Grade</th>
              <th className="r">Students</th>
              <th className="r">Tier 3</th>
              <th className="r">Tier 2</th>
              {cats.map((c) => (
                <th key={c} className="r">
                  {RULE_LABELS[c]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.byGrade.map((g) => (
              <tr key={g.grade}>
                <td>{g.grade}</td>
                <td className="r num">{g.students}</td>
                <td className="r num">
                  {g.tiers[3]} <span className="muted">({pct(g.tiers[3], g.students)})</span>
                </td>
                <td className="r num">
                  {g.tiers[2]} <span className="muted">({pct(g.tiers[2], g.students)})</span>
                </td>
                {cats.map((c) => (
                  <td key={c} className="r num">
                    {g.flagged[c]} <span className="muted">({pct(g.flagged[c], g.students)})</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// The Caseload tab: wins first, then what to look at, then the numbers
// by flag type, by snapshot, and by grade.

import type { ReactNode } from 'react'
import { ruleDescriptions, type Thresholds } from '../../config/rules'
import type { Results } from '../../lib/compare/analyze'
import type { Snapshot } from '../../lib/model'
import { RULE_CATEGORIES, RULE_LABELS, type RuleCategory } from '../../lib/rules/engine'
import type { ListFilter } from './StudentList'
import { TierBar } from './TierBar'

const pct = (n: number, d: number) => (d === 0 ? '0%' : `${Math.round((n / d) * 100)}%`)
const signed = (n: number) => (n > 0 ? `+${n}` : String(n))
const flagName = (c: RuleCategory) => (c === 'attendance' ? 'chronically absent' : `flagged for ${RULE_LABELS[c].toLowerCase()}`)

interface GlanceItem {
  kind: 'win' | 'look'
  value: string
  text: string
  apply?: Partial<ListFilter>
}

function glanceItems(results: Results): GlanceItem[] {
  const n = results.summaries.length
  const latest = results.summaries[n - 1]
  const items: GlanceItem[] = []
  const noFlags = results.students.filter((s) => s.latest.flags.length === 0).length
  items.push({ kind: 'win', value: pct(noFlags, latest.students), text: `of students have no flags (${noFlags} of ${latest.students})`, apply: { flag: 'none' } })

  const tr = results.transitions
  if (tr) {
    const best = [...tr.comparable].sort((a, b) => tr.noLongerFlagged[b] - tr.noLongerFlagged[a])[0]
    if (best && tr.noLongerFlagged[best] > 0) {
      items.push({ kind: 'win', value: String(tr.noLongerFlagged[best]), text: `no longer ${flagName(best)} since ${tr.from}` })
    } else if (tr.tierDown > 0) {
      items.push({ kind: 'win', value: String(tr.tierDown), text: `moved down a tier since ${tr.from}`, apply: { change: 'down' } })
    }
    const worst = [...tr.comparable].sort((a, b) => tr.newlyFlagged[b] - tr.newlyFlagged[a])[0]
    if (worst && tr.newlyFlagged[worst] > 0) {
      items.push({ kind: 'look', value: String(tr.newlyFlagged[worst]), text: `newly ${flagName(worst)} since ${tr.from}`, apply: { newly: worst } })
    }
  }

  if (items.length < 3) {
    const grades = results.byGrade.filter((g) => g.students >= 10)
    const top = [...grades].sort((a, b) => b.tiers[3] / b.students - a.tiers[3] / a.students)[0]
    if (top && top.tiers[3] > 0) {
      items.push({ kind: 'look', value: pct(top.tiers[3], top.students), text: `of grade ${top.grade} is in Tier 3, the highest of any grade`, apply: { grade: top.grade, tier: '3' } })
    }
  }
  if (items.length < 3) {
    const common = RULE_CATEGORIES.filter((c) => latest.rules[c]).sort((a, b) => latest.flagged[b] - latest.flagged[a])[0]
    if (common && latest.flagged[common] > 0) {
      items.push({ kind: 'look', value: String(latest.flagged[common]), text: `students have a ${RULE_LABELS[common].toLowerCase()} flag, the most common`, apply: { flag: common } })
    }
  }
  return items.slice(0, 3)
}

export function CaseloadTab({
  results,
  snapshots,
  thresholds,
  onShowStudents,
}: {
  results: Results
  snapshots: Snapshot[]
  thresholds: Thresholds
  onShowStudents: (f: Partial<ListFilter>) => void
}) {
  const n = results.summaries.length
  const latest = results.summaries[n - 1]
  const prev = n > 1 ? results.summaries[n - 2] : null
  const usesDistrictPct = snapshots[n - 1].files.some((f) => f.categories.includes('attendanceSummary'))

  return (
    <>
      <section className="glance-cards" aria-label="At a glance">
        {glanceItems(results).map((g) => (
          <Card key={g.text} item={g} onShowStudents={onShowStudents} />
        ))}
      </section>

      <section className="section">
        <h2 className="h2">Flags by type</h2>
        <div className="tiles">
          {RULE_CATEGORIES.map((c) =>
            latest.rules[c] ? (
              <button key={c} className="card tile" onClick={() => onShowStudents({ flag: c })}>
                <span className="label">{RULE_LABELS[c]}</span>
                <span className="value num">{latest.flagged[c]}</span>
                <span className="sub num">
                  {pct(latest.flagged[c], latest.students)} of students
                  {prev?.rules[c] ? `, ${signed(latest.flagged[c] - prev.flagged[c])} since ${prev.label}` : ''}
                </span>
              </button>
            ) : (
              <div key={c} className="card tile na">
                <span className="label">{RULE_LABELS[c]}</span>
                <span className="value">Not in your files</span>
              </div>
            ),
          )}
        </div>
      </section>

      {n > 1 && (
        <section className="section">
          <h2 className="h2">Tiers by snapshot</h2>
          <div className="card pad snapshots">
            {results.summaries.map((s) => {
              const missing = RULE_CATEGORIES.filter((c) => latest.rules[c] && !s.rules[c])
              return (
                <div key={s.label} className="snapshot-row">
                  <div>
                    <b>{s.label}</b>
                    <div className="small muted num">{s.students} students</div>
                    {missing.length > 0 && <div className="small muted">No {missing.map((c) => RULE_LABELS[c].toLowerCase()).join(' or ')} data</div>}
                  </div>
                  <TierBar tiers={s.tiers} total={s.students} />
                </div>
              )
            })}
            {results.transitions && (
              <div className="chips">
                <Chip value={results.transitions.tierUp} text="moved up a tier" onClick={() => onShowStudents({ change: 'up' })} />
                <Chip value={results.transitions.tierDown} text="moved down a tier" onClick={() => onShowStudents({ change: 'down' })} />
                <Chip value={results.transitions.onlyInLatest} text={`new in ${results.transitions.to}`} onClick={() => onShowStudents({ change: 'new' })} />
                <Chip value={results.transitions.onlyInPrevious} text={`left after ${results.transitions.from}`} />
                {results.transitions.comparable.length < RULE_CATEGORIES.filter((c) => latest.rules[c]).length && (
                  <span className="small muted">
                    Tier changes count {results.transitions.comparable.map((c) => RULE_LABELS[c].toLowerCase()).join(' and ')} only, the data in both snapshots.
                  </span>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      <section className="section">
        <h2 className="h2">By grade</h2>
        <ByGradeTable results={results} />
      </section>

      <p className="footnote small muted">
        {ruleDescriptions(thresholds).tiers}
        {latest.rules.attendance && usesDistrictPct
          ? " Absence percentages come from Infinite Campus and reflect the district's own attendance calculation."
          : ''}
      </p>
    </>
  )
}

function Card({ item, onShowStudents }: { item: GlanceItem; onShowStudents: (f: Partial<ListFilter>) => void }): ReactNode {
  const body = (
    <>
      <span className="kicker">{item.kind === 'win' ? 'Going well' : 'Look here'}</span>
      <span className="big num">{item.value}</span>
      <span className="text">{item.text}</span>
    </>
  )
  return item.apply ? (
    <button className={`card glance-card ${item.kind}`} onClick={() => onShowStudents(item.apply!)}>
      {body}
      <span className="go small">See students</span>
    </button>
  ) : (
    <div className={`card glance-card ${item.kind}`}>{body}</div>
  )
}

function Chip({ value, text, onClick }: { value: number; text: string; onClick?: () => void }) {
  const content = (
    <>
      <b className="num">{value}</b> {text}
    </>
  )
  return onClick ? (
    <button className="chip" onClick={onClick}>
      {content}
    </button>
  ) : (
    <span className="chip static">{content}</span>
  )
}

function ByGradeTable({ results }: { results: Results }) {
  const latest = results.summaries[results.summaries.length - 1]
  const cats = RULE_CATEGORIES.filter((c) => latest.rules[c])
  return (
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
                {g.tiers[3]} <span className="muted">{pct(g.tiers[3], g.students)}</span>
              </td>
              <td className="r num">
                {g.tiers[2]} <span className="muted">{pct(g.tiers[2], g.students)}</span>
              </td>
              {cats.map((c) => (
                <td key={c} className="r num">
                  {g.flagged[c]} <span className="muted">{pct(g.flagged[c], g.students)}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** One slim line when the latest snapshot is missing a category, plus any file warnings. */
export function MissingLine({ results, warnings }: { results: Results; warnings: string[] }) {
  const latest = results.summaries[results.summaries.length - 1]
  if (!results.missingRules.length && !warnings.length) return null
  return (
    <div className="missing small">
      {results.missingRules.length > 0 && (
        <span>
          Not in your {latest.label} files: {results.missingRules.map((c) => RULE_LABELS[c].toLowerCase()).join(', ')}. No student is flagged for{' '}
          {results.missingRules.length === 1 ? 'it' : 'them'}.
        </span>
      )}
      {warnings.map((w) => (
        <span key={w}>{w}</span>
      ))}
    </div>
  )
}

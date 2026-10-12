// Patterns: where flags concentrate, how they overlap, and how the
// caseload is spread around each rule. Each figure's title states what
// the numbers show; the line under it says what is plotted.
//
// Color: the accent marks students who meet a rule. Gray marks those who
// do not. The grade grid uses the accent from light to dark for rate.

import { useMemo, useState, type ReactNode } from 'react'
import { ruleDescriptions, type Thresholds } from '../../config/rules'
import type { Results } from '../../lib/compare/analyze'
import {
  absenceDistribution,
  areaPhrase,
  gpaDistribution,
  highestTier3Grade,
  MIN_GROUP,
  overlap,
  type Distribution,
} from '../../lib/compare/insights'
import { RULE_CATEGORIES, RULE_LABELS, tierFor, type RuleCategory } from '../../lib/rules/engine'
import type { ListFilter } from './StudentList'

const pct = (n: number, d: number) => (d === 0 ? '0%' : `${Math.round((n / d) * 100)}%`)
const trim = (n: number) => String(Math.round(n * 100) / 100)

export function Patterns({
  results,
  thresholds,
  onShowStudents,
}: {
  results: Results
  thresholds: Thresholds
  onShowStudents: (f: Partial<ListFilter>) => void
}) {
  const latest = results.summaries[results.summaries.length - 1]
  const rules = ruleDescriptions(thresholds)
  const abs = useMemo(() => absenceDistribution(results, thresholds), [results, thresholds])
  const gpa = useMemo(() => gpaDistribution(results, thresholds), [results, thresholds])
  const showGpa = gpa && latest.categories.includes('gpa')

  return (
    <section className="patterns" aria-label="Patterns">
      <h2 className="h2">Patterns</h2>
      <div className="figures">
        <GradeGrid results={results} onShowStudents={onShowStudents} />
        <OverlapFigure results={results} thresholds={thresholds} onShowStudents={onShowStudents} />
        {abs && latest.rules.attendance && (
          <Figure
            title={
              abs.near > 0
                ? `${abs.near} ${abs.near === 1 ? 'student is' : 'students are'} within ${trim(abs.binWidth)} points of chronic absence.`
                : 'No students are just under the chronic absence rule.'
            }
            sub="Students by percent of scheduled days absent."
            foot={rules.attendance}
          >
            <Histogram
              d={abs}
              unit="%"
              ruleLabel={`${trim(thresholds.chronicAbsencePct)}% or more`}
              ruleSide="right"
              describe={(from, to) => (to == null ? `${trim(from)}% or more absent` : `${trim(from)}% to under ${trim(to)}% absent`)}
            />
          </Figure>
        )}
        {showGpa && (
          <Figure
            title={
              gpa.near > 0
                ? `${gpa.near} ${gpa.near === 1 ? 'student is' : 'students are'} within ${trim(gpa.binWidth)} of the GPA rule.`
                : 'No students are just above the GPA rule.'
            }
            sub={`Students by ${thresholds.gpaSource === 'unweighted' ? 'unweighted' : 'cumulative'} GPA.`}
            foot={`GPA rule: below ${thresholds.gpaBelow.toFixed(2)}.`}
          >
            <Histogram
              d={gpa}
              unit=""
              ruleLabel={`Below ${thresholds.gpaBelow.toFixed(2)}`}
              ruleSide="left"
              describe={(from, to) => `GPA ${from.toFixed(2)} to ${to == null ? 'up' : `under ${to.toFixed(2)}`}`}
            />
          </Figure>
        )}
      </div>
    </section>
  )
}

function Figure({ title, sub, foot, children }: { title: string; sub: string; foot?: ReactNode; children: ReactNode }) {
  return (
    <figure className="figure">
      <figcaption>
        <h3 className="figure-title num">{title}</h3>
        <p className="figure-sub">{sub}</p>
      </figcaption>
      {children}
      {foot && <p className="figure-foot small muted">{foot}</p>}
    </figure>
  )
}

// ---- Grade by area ----

function GradeGrid({ results, onShowStudents }: { results: Results; onShowStudents: (f: Partial<ListFilter>) => void }) {
  const latest = results.summaries[results.summaries.length - 1]
  const cats = RULE_CATEGORIES.filter((c) => latest.rules[c])
  const top = highestTier3Grade(results)
  if (results.byGrade.length < 2) return null
  const rates = results.byGrade.flatMap((g) => [g.tiers[3] / g.students, ...cats.map((c) => g.flagged[c] / g.students)])
  const max = Math.max(0.01, ...rates)
  const small = results.byGrade.some((g) => g.students < MIN_GROUP)

  const cell = (count: number, students: number, label: string, apply: Partial<ListFilter>) => {
    const rate = students ? count / students : 0
    return (
      <td className="heat">
        <button
          style={{ background: `rgba(15, 110, 106, ${(0.62 * rate) / max})` }}
          title={`${count} of ${students} students ${label}`}
          aria-label={`${pct(count, students)}, ${count} of ${students} students ${label}`}
          disabled={count === 0}
          onClick={() => onShowStudents(apply)}
        >
          <b className="num">{pct(count, students)}</b>
          <span className="num">{count}</span>
        </button>
      </td>
    )
  }

  return (
    <Figure
      title={
        top
          ? `Grade ${top.grade} has the largest share of students in Tier 3, ${Math.round(top.rate * 100)}%.`
          : 'Flags by grade.'
      }
      sub="Share of each grade that is flagged, with the number of students. Darker is a higher share."
      foot={small ? `Grades under ${MIN_GROUP} students are shown but not compared in the title.` : undefined}
    >
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>Grade</th>
              <th className="r">Students</th>
              {cats.map((c) => (
                <th key={c}>{RULE_LABELS[c]}</th>
              ))}
              <th>Tier 3</th>
            </tr>
          </thead>
          <tbody>
            {results.byGrade.map((g) => (
              <tr key={g.grade}>
                <th scope="row">{g.grade}</th>
                <td className="r num muted">{g.students}</td>
                {cats.map((c) => (
                  <Cell key={c}>{cell(g.flagged[c], g.students, areaPhrase(c), { grade: g.grade, flag: c })}</Cell>
                ))}
                <Cell>{cell(g.tiers[3], g.students, 'in Tier 3', { grade: g.grade, tier: '3' })}</Cell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Figure>
  )
}

/** "Attendance only", "Attendance and academics", "Attendance, academics, and behavior". */
function comboLabel(cats: RuleCategory[]): string {
  const names = cats.map((c, i) => (i === 0 ? RULE_LABELS[c] : RULE_LABELS[c].toLowerCase()))
  if (names.length === 1) return `${names[0]} only`
  if (names.length === 2) return names.join(' and ')
  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`
}

const Cell = ({ children }: { children: ReactNode }) => <>{children}</>

// ---- Overlap ----

function OverlapFigure({
  results,
  thresholds,
  onShowStudents,
}: {
  results: Results
  thresholds: Thresholds
  onShowStudents: (f: Partial<ListFilter>) => void
}) {
  const o = useMemo(() => overlap(results), [results])
  const latest = results.summaries[results.summaries.length - 1]
  if (RULE_CATEGORIES.filter((c) => latest.rules[c]).length < 2 || o.flagged === 0) return null
  const max = Math.max(...o.groups.map((g) => g.count))
  const s = o.strongest
  return (
    <Figure
      title={
        s
          ? `${s.both} of the ${s.total} students ${areaPhrase(s.of)} are also ${areaPhrase(s.also)}.`
          : 'How flags combine.'
      }
      sub={`The ${o.flagged} flagged students, by which flags they have.`}
      foot={ruleDescriptions(thresholds).tiers}
    >
      <ul className="bars">
        {o.groups.map((g) => {
          const tier = tierFor(g.categories.length, thresholds)
          return (
            <li key={g.key}>
              <button className="bar-row" onClick={() => onShowStudents({ combo: g.key })} title={`${g.count} students. Select to list them.`}>
                <span className="bar-label">{comboLabel(g.categories)}</span>
                <span className="bar-track">
                  <span className={`bar-fill seg-${tier}`} style={{ width: `${(g.count / max) * 100}%` }} />
                  <b className="num">{g.count}</b>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </Figure>
  )
}

// ---- Histogram ----

function Histogram({
  d,
  unit,
  ruleLabel,
  ruleSide,
  describe,
}: {
  d: Distribution
  unit: string
  ruleLabel: string
  /** Which side of the line is flagged. */
  ruleSide: 'left' | 'right'
  describe: (from: number, to: number | null) => string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...d.bins.map((b) => b.count))
  const n = d.bins.length
  const edge = d.bins.findIndex((b) => (ruleSide === 'right' ? b.flagged : !b.flagged))
  const linePct = (edge / n) * 100
  // Label every other edge so the axis stays readable.
  const step = n > 10 ? 2 : 1
  const active = hover == null ? null : d.bins[hover]
  return (
    <div className="hist">
      <div className="hist-plot" onMouseLeave={() => setHover(null)}>
        <div className="hist-rule" style={{ left: `${linePct}%` }}>
          <span className={`hist-rule-label ${ruleSide}`}>{ruleLabel}</span>
        </div>
        {d.bins.map((b, i) => (
          <button
            key={b.from}
            className={`hist-col${hover === i ? ' on' : ''}`}
            aria-label={`${describe(b.from, b.to)}: ${b.count} students`}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
          >
            <span className={`hist-bar${b.flagged ? ' flagged' : ''}`} style={{ height: `${(b.count / max) * 100}%` }} />
          </button>
        ))}
        {active && hover != null && (
          <div
            className="hist-tip num"
            style={{ left: `${Math.min(88, Math.max(12, ((hover + 0.5) / n) * 100))}%`, bottom: `calc(${(active.count / max) * 100}% + 6px)` }}
            role="status"
          >
            <b>
              {active.count} {active.count === 1 ? 'student' : 'students'}
            </b>
            <span>{describe(active.from, active.to)}</span>
          </div>
        )}
      </div>
      <div className="hist-axis num" aria-hidden="true">
        {d.bins.map((b, i) => (
          <span key={b.from}>{i % step === 0 ? `${trim(b.from)}${unit}${b.to == null ? '+' : ''}` : ''}</span>
        ))}
      </div>
      <div className="hist-legend small muted">
        <span>
          <i className="swatch seg-3" /> Meets the rule
        </span>
        <span>
          <i className="swatch seg-0" /> Does not
        </span>
      </div>
    </div>
  )
}

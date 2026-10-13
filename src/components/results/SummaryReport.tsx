// The de-identified summary (Phase 2). Counts and rates only, with
// small-cell suppression applied in lib/summary. It is not shown on screen:
// it is what "Download PDF" prints by default, and what the browser prints
// if someone prints the results page directly, so names never leave by
// accident. Printing names is a separate, explicit choice (ResultsView).

import { useMemo, useState } from 'react'
import type { Thresholds } from '../../config/rules'
import type { Results } from '../../lib/compare/analyze'
import { areaPhrase } from '../../lib/compare/insights'
import { RULE_LABELS, type RuleCategory } from '../../lib/rules/engine'
import { buildSummary, TIERS } from '../../lib/summary/build'
import { cellText, MIN_CELL, rateText, type Cell } from '../../lib/summary/suppress'

const list = (cats: RuleCategory[]) => cats.map((c) => RULE_LABELS[c].toLowerCase()).join(' and ')

function Num({ cell }: { cell: Cell }) {
  if (cell.kind !== 'shown') return <span className="muted">{cellText(cell)}</span>
  const rate = rateText(cell)
  return (
    <>
      <strong>{cell.count}</strong>
      {rate && <span className="muted"> {rate}</span>}
    </>
  )
}

/** "21% → 23%" when both rates are shown, otherwise counts. */
function RateChange({ before, after }: { before: Cell; after: Cell }) {
  if (before.kind === 'shown' && after.kind === 'shown' && before.rate != null && after.rate != null) {
    return <>{`${rateText(before)} → ${rateText(after)}`}</>
  }
  return <>{`${cellText(before)} → ${cellText(after)}`}</>
}

export function SummaryReport({ results, thresholds }: { results: Results; thresholds: Thresholds }) {
  const s = useMemo(() => buildSummary(results, thresholds), [results, thresholds])
  const [today] = useState(() => new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }))

  const allTiersShown = TIERS.every((k) => s.tiers[k].kind === 'shown')
  const anyHidden = s.byGrade.some((g) => g.students.kind === 'hidden' || TIERS.some((k) => g.tiers[k].kind === 'hidden') || s.rules.some((c) => g.flagged[c]?.kind === 'hidden'))
  const [topPair, ...otherPairs] = s.pairs
  const labelsUsed = results.labels.join(' and ')

  return (
      <article className="report print-only" aria-label="De-identified summary">
        <header className="report-head">
          <span className="report-eyebrow">{today}</span>
          <h1 className="report-title">Student support summary, {s.label}</h1>
          <p className="muted num">
            {cellText(s.students)} students{s.change ? `, compared with ${s.change.from}` : ''}. Counts and rates only: no names or student IDs. Counts
            under {MIN_CELL} show as &lt;{MIN_CELL}.
          </p>
        </header>

        <div className="report-grid">
          <section className="report-block">
            <h2>Tiers</h2>
            {allTiersShown && (
              <div className="report-bar" aria-hidden="true">
                {TIERS.map((k) => (
                  <span key={k} className={`seg t${k}`} style={{ flex: s.tiers[k].count ?? 0 }} />
                ))}
              </div>
            )}
            <div className="report-tiers num">
              {TIERS.map((k) => (
                <div key={k}>
                  <span className="small muted">Tier {k}</span>
                  <span className="big">{cellText(s.tiers[k])}</span>
                  <span className="small muted">{rateText(s.tiers[k]) || ' '}</span>
                </div>
              ))}
            </div>
            <p className="small muted">{s.tierText}</p>
          </section>

          <section className="report-block">
            <h2>Students flagged, by area</h2>
            <div className="report-areas num">
              {s.rules.map((c) => {
                const cell = s.flagged[c]!
                return (
                  <div key={c} className="report-area">
                    <span>{RULE_LABELS[c]}</span>
                    <span className="meter" aria-hidden="true">
                      {cell.kind === 'shown' && cell.rate != null && <span style={{ width: `${Math.max(2, cell.rate * 100)}%` }} />}
                    </span>
                    <span className="value">
                      <Num cell={cell} />
                    </span>
                  </div>
                )
              })}
            </div>
            <p className="small muted">
              A student can be flagged in more than one area.
              {topPair && topPair.cell.kind === 'shown' && ` Flagged together most often: ${list(topPair.categories)} (${topPair.cell.count} students).`}
              {otherPairs.length > 0 && otherPairs.every((p) => p.cell.kind !== 'shown') && ` Other pairs: <${MIN_CELL} each.`}
              {otherPairs
                .filter((p) => p.cell.kind === 'shown')
                .map((p) => ` ${list(p.categories)[0].toUpperCase()}${list(p.categories).slice(1)}: ${p.cell.count}.`)}
              {s.missingRules.length > 0 && ` Not in these files: ${list(s.missingRules)}.`}
            </p>
          </section>
        </div>

        {s.change && (
          <section className="report-block">
            <h2>Since {s.change.from}</h2>
            <div className="report-changes num">
              {s.change.compared.map((c) => (
                <div key={c} className="report-change">
                  <span className="small muted">{areaPhrase(c)[0].toUpperCase() + areaPhrase(c).slice(1)}</span>
                  <span className="mid">
                    <RateChange before={s.change!.previous[c]!} after={s.change!.latest[c]!} />
                  </span>
                  <span className="small muted">
                    {cellText(s.change!.newlyFlagged[c]!)} newly, {cellText(s.change!.noLongerFlagged[c]!)} no longer
                  </span>
                </div>
              ))}
              <div className="report-change">
                <span className="small muted">Moved up a tier</span>
                <span className="mid">{cellText(s.change.tierUp)}</span>
                <span className="small muted">{cellText(s.change.tierDown)} moved down</span>
              </div>
            </div>
            <p className="small muted num">
              Compares the {cellText(s.change.inBoth)} students in both snapshots
              {s.change.compared.length ? `, using ${list(s.change.compared)} only` : ''}.
              {s.change.notCompared.length > 0 && ` ${list(s.change.notCompared)[0].toUpperCase()}${list(s.change.notCompared).slice(1)} ${s.change.notCompared.length === 1 ? 'was' : 'were'} not in the ${s.change.from} files.`}
            </p>
          </section>
        )}

        <section className="report-block">
          <h2>By grade</h2>
          <div className="report-table">
            <table className="num">
              <thead>
                <tr>
                  <th>Grade</th>
                  <th>Students</th>
                  {TIERS.map((k) => (
                    <th key={k}>Tier {k}</th>
                  ))}
                  {s.rules.map((c) => (
                    <th key={c}>{RULE_LABELS[c]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.byGrade.map((g) => (
                  <tr key={g.grade}>
                    <td>{g.grade}</td>
                    <td>
                      <Num cell={{ ...g.students, rate: null }} />
                    </td>
                    {TIERS.map((k) => (
                      <td key={k}>
                        <Num cell={g.tiers[k]} />
                      </td>
                    ))}
                    {s.rules.map((c) => (
                      <td key={c}>
                        <Num cell={g.flagged[c]!} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {anyHidden && (
            <p className="small muted">* Hidden so a count under {MIN_CELL} in the same row or column can't be worked out by subtraction from the totals.</p>
          )}
        </section>

        <footer className="report-foot small muted">
          <span>
            <strong>Rules used.</strong> {[...s.ruleText, s.tierText].join(' ')}
          </span>
          <span>
            Prepared with Caselo (caselo.org) from {labelsUsed} exports. Made in the browser; no student data was uploaded.
          </span>
        </footer>
      </article>
  )
}

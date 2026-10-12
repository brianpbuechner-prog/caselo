// Top of the results page: the win first, the tier bar, then what changed
// since the previous snapshot.

import { areaPhrase } from '../../lib/compare/insights'
import type { Results } from '../../lib/compare/analyze'
import { RULE_LABELS } from '../../lib/rules/engine'
import type { ListFilter } from './StudentList'
import { TierBar } from './TierBar'

export function Summary({
  results,
  filter,
  onShowStudents,
}: {
  results: Results
  filter: ListFilter
  onShowStudents: (f: Partial<ListFilter>) => void
}) {
  const latest = results.summaries[results.summaries.length - 1]
  const noFlags = latest.tiers[1]
  const tr = results.transitions
  return (
    <section className="summary" aria-label="Caseload summary">
      <h1 className="headline num">
        {noFlags} of {latest.students} students have no flags.
      </h1>
      <p className="headline-sub num">
        {latest.tiers[3]} in Tier 3 and {latest.tiers[2]} in Tier 2, from {latest.label}.
      </p>
      <TierBar
        tiers={latest.tiers}
        total={latest.students}
        selected={filter.tier}
        onSelect={(tier) => onShowStudents({ tier })}
      />
      {tr && (
        <div className="since">
          <h2 className="since-title">Since {tr.from}</h2>
          <ul className="since-list num">
            {tr.comparable.map((c) => (
              <li key={c}>
                <span className="since-area">{RULE_LABELS[c]}</span>
                <Move n={tr.noLongerFlagged[c]} text={`no longer ${areaPhrase(c)}`} onClick={() => onShowStudents({ resolved: c })} />
                <Move n={tr.newlyFlagged[c]} text={`newly ${areaPhrase(c)}`} look onClick={() => onShowStudents({ newly: c })} />
              </li>
            ))}
            <li>
              <span className="since-area">Tiers</span>
              <Move n={tr.tierDown} text="moved down a tier" onClick={() => onShowStudents({ change: 'down' })} />
              <Move n={tr.tierUp} text="moved up a tier" look onClick={() => onShowStudents({ change: 'up' })} />
            </li>
          </ul>
          <p className="small muted num">
            {tr.onlyInLatest} new in {tr.to}, {tr.onlyInPrevious} left after {tr.from}.
            {tr.comparable.length < Object.values(latest.rules).filter(Boolean).length &&
              ` Changes count ${tr.comparable.map((c) => RULE_LABELS[c].toLowerCase()).join(' and ')} only, the data in both snapshots.`}
          </p>
        </div>
      )}
    </section>
  )
}

function Move({ n, text, look, onClick }: { n: number; text: string; look?: boolean; onClick: () => void }) {
  if (n === 0) return <span className="move none">0 {text}</span>
  return (
    <button className={`move${look ? ' look' : ''}`} onClick={onClick}>
      <b>{n}</b> {text}
    </button>
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

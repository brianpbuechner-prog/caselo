// One horizontal bar split by support level, with a legend that doubles as
// the filter. "Needs support now" sits first because it is where a counselor
// looks first.

import { TIER_NAMES } from '../../lib/language'
import type { Tier } from '../../lib/rules/engine'

export type TierFilter = 'all' | '1' | '2' | '3'

const ORDER: Tier[] = [3, 2, 1]

export function TierBar({
  tiers,
  total,
  selected,
  onSelect,
}: {
  tiers: Record<Tier, number>
  total: number
  selected?: TierFilter
  onSelect?: (t: TierFilter) => void
}) {
  const pick = (t: Tier) => onSelect?.(selected === String(t) ? 'all' : (String(t) as TierFilter))
  return (
    <div className="tierbar">
      <div className="tierbar-track" aria-hidden="true">
        {ORDER.map((t) =>
          tiers[t] > 0 ? (
            <span
              key={t}
              className={`seg seg-${t}${selected && selected !== 'all' && selected !== String(t) ? ' dim' : ''}`}
              style={{ flexGrow: tiers[t] }}
              title={`${TIER_NAMES[t]} (Tier ${t}): ${tiers[t]} students`}
              onClick={() => pick(t)}
            />
          ) : null,
        )}
      </div>
      <div className="tierbar-legend">
        {ORDER.map((t) => {
          const on = selected === String(t)
          const content = (
            <>
              <span className={`swatch seg-${t}`} aria-hidden="true" />
              <span>{TIER_NAMES[t]}</span>
              <b className="num">{tiers[t]}</b>
              <span className="muted num">{total ? Math.round((tiers[t] / total) * 100) : 0}%</span>
            </>
          )
          return onSelect ? (
            <button key={t} className={`legend-item${on ? ' on' : ''}`} aria-pressed={on} onClick={() => pick(t)}>
              {content}
            </button>
          ) : (
            <span key={t} className="legend-item static">
              {content}
            </span>
          )
        })}
      </div>
    </div>
  )
}

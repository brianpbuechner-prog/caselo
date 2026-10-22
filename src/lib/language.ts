// Caselo's words for support levels and direction. Code keeps "tier" and
// "flag" so the MTSS equivalents stay exact; the screen uses these.
//
//   Tier 3  Needs support now
//   Tier 2  Worth a check-in
//   Tier 1  No signals
//   flag    signal
//
// Direction, from one snapshot to the next: Gaining ground, Steady, Slipping,
// Finding footing. Describe the situation, not the student: "attendance is
// slipping", not "a slipping student".

import type { Tier } from './rules/engine'

export const TIER_NAMES: Record<Tier, string> = {
  3: 'Needs support now',
  2: 'Worth a check-in',
  1: 'No signals',
}

/** Short forms for table pills. */
export const TIER_SHORT: Record<Tier, string> = {
  3: 'Support now',
  2: 'Check-in',
  1: 'No signals',
}

/** "Needs support now (Tier 3)", for places MTSS teams will read. */
export const tierWithEquivalent = (t: Tier) => `${TIER_NAMES[t]} (Tier ${t})`

export type Direction = 'gaining' | 'steady' | 'slipping' | 'finding'

export const DIRECTION_LABELS: Record<Direction, string> = {
  gaining: 'Gaining ground',
  steady: 'Steady',
  slipping: 'Slipping',
  finding: 'Finding footing',
}

export const signalCount = (n: number) => `${n} ${n === 1 ? 'signal' : 'signals'}`

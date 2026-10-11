// Preferences saved in this browser: role, thresholds, and layout.
// These never contain student data. Reads and writes fail quietly when
// storage is blocked (private windows, strict settings).

import { DEFAULT_THRESHOLDS, type Thresholds } from '../config/rules'

const KEY = 'caselo.preferences.v1'

export interface Preferences {
  role: string
  thresholds: Thresholds
  layout: {
    density: 'comfortable' | 'compact'
  }
}

export const DEFAULT_PREFERENCES: Preferences = {
  role: 'counselor',
  thresholds: DEFAULT_THRESHOLDS,
  layout: { density: 'comfortable' },
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function strings(v: unknown, fallback: string[]): string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string') ? v : fallback
}

/** Only known keys with the right types are kept. */
export function sanitize(raw: unknown): Preferences {
  const r = (raw ?? {}) as Record<string, unknown>
  const t = (r.thresholds ?? {}) as Record<string, unknown>
  const d = DEFAULT_THRESHOLDS
  const layout = (r.layout ?? {}) as Record<string, unknown>
  return {
    role: typeof r.role === 'string' ? r.role : DEFAULT_PREFERENCES.role,
    thresholds: {
      chronicAbsencePct: num(t.chronicAbsencePct, d.chronicAbsencePct),
      gpaBelow: num(t.gpaBelow, d.gpaBelow),
      gpaSource: t.gpaSource === 'cumulative' ? 'cumulative' : 'unweighted',
      failingGradesAtLeast: num(t.failingGradesAtLeast, d.failingGradesAtLeast),
      failingMarks: strings(t.failingMarks, d.failingMarks),
      failingNumericBelow: num(t.failingNumericBelow, d.failingNumericBelow),
      behaviorIncidentsAtLeast: num(t.behaviorIncidentsAtLeast, d.behaviorIncidentsAtLeast),
      absenceCodes: strings(t.absenceCodes, d.absenceCodes),
      tier2MinFlags: num(t.tier2MinFlags, d.tier2MinFlags),
      tier3MinFlags: num(t.tier3MinFlags, d.tier3MinFlags),
    },
    layout: { density: layout.density === 'compact' ? 'compact' : 'comfortable' },
  }
}

export function loadPreferences(): Preferences {
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? sanitize(JSON.parse(raw)) : DEFAULT_PREFERENCES
  } catch {
    return DEFAULT_PREFERENCES
  }
}

export function savePreferences(p: Preferences): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    // Storage unavailable. Preferences last for this visit only.
  }
}

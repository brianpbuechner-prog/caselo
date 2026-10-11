// Every rule threshold and default lives in this file. The UI shows these
// values next to each flag so a counselor can see why a student was
// flagged, and lets the counselor adjust them.

export type GpaSource = 'unweighted' | 'cumulative'

export interface Thresholds {
  /** Chronic absence: flag at this percent of scheduled days missed, or more. */
  chronicAbsencePct: number
  /** Academics: flag when GPA is below this value. */
  gpaBelow: number
  /** Which GPA to check first. The other is used when the first is missing. */
  gpaSource: GpaSource
  /** Academics: flag at this many failing course grades, or more. */
  failingGradesAtLeast: number
  /** Course grades counted as failing. Compared without regard to case. */
  failingMarks: string[]
  /** Numeric course grades below this count as failing. */
  failingNumericBelow: number
  /** Behavior: flag at this many incidents in the snapshot, or more. */
  behaviorIncidentsAtLeast: number
  /**
   * Attendance detail codes that count as an absence. Empty means every
   * attendance detail row counts. Codes vary by district.
   */
  absenceCodes: string[]
  /** Tier 2 starts at this many flags. */
  tier2MinFlags: number
  /** Tier 3 starts at this many flags. */
  tier3MinFlags: number
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  chronicAbsencePct: 10,
  gpaBelow: 2.0,
  gpaSource: 'unweighted',
  failingGradesAtLeast: 1,
  failingMarks: ['F', 'E', 'NC', 'U', 'NP'],
  failingNumericBelow: 60,
  behaviorIncidentsAtLeast: 3,
  absenceCodes: [],
  tier2MinFlags: 1,
  tier3MinFlags: 2,
}

/** Plain-language rule descriptions shown in the UI. */
export function ruleDescriptions(t: Thresholds): Record<'attendance' | 'academics' | 'behavior' | 'tiers', string> {
  return {
    attendance: `Chronic absence: missed ${t.chronicAbsencePct}% or more of scheduled days.`,
    academics: `Academics: ${t.gpaSource === 'unweighted' ? 'unweighted' : 'cumulative'} GPA below ${t.gpaBelow.toFixed(2)}, or ${t.failingGradesAtLeast} or more failing course ${t.failingGradesAtLeast === 1 ? 'grade' : 'grades'} when course grades are in the file.`,
    behavior: `Behavior: ${t.behaviorIncidentsAtLeast} or more incidents.`,
    tiers: `Tier 1: ${t.tier2MinFlags === 1 ? 'no flags' : `fewer than ${t.tier2MinFlags} flags`}. Tier 2: ${t.tier2MinFlags} or more ${t.tier2MinFlags === 1 ? 'flag' : 'flags'}. Tier 3: ${t.tier3MinFlags} or more.`,
  }
}

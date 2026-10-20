// Every rule threshold and default lives in this file. The UI shows these
// values next to each signal so a counselor can see why it appeared, and
// lets the counselor adjust them. (In code, a signal is a "flag" and a
// support level is a "tier", so the MTSS tier equivalents stay exact.)

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
  /** "Worth a check-in" (Tier 2) starts at this many signals. */
  tier2MinFlags: number
  /** "Needs support now" (Tier 3) starts at this many signals. */
  tier3MinFlags: number
  /** Slipping or growing: absence moved by this many percentage points between snapshots. */
  moveAbsencePoints: number
  /** Slipping or growing: GPA moved by this much between snapshots. */
  moveGpa: number
  /**
   * Attendance changes count only when both snapshots cover at least this
   * many scheduled days, so early-year swings aren't read as slipping.
   */
  moveMinDays: number
  /** Close to a line: absence within this many points below the attendance line. */
  nearAbsencePoints: number
  /** Close to a line: GPA within this much above the academics line. */
  nearGpa: number
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
  moveAbsencePoints: 3,
  moveGpa: 0.3,
  moveMinDays: 20,
  nearAbsencePoints: 2,
  nearGpa: 0.25,
}

/** Plain-language rule descriptions shown in the UI. */
export function ruleDescriptions(t: Thresholds): Record<'attendance' | 'academics' | 'behavior' | 'tiers' | 'movement', string> {
  return {
    attendance: `Chronic absence: missed ${t.chronicAbsencePct}% or more of scheduled days.`,
    academics: `Academics: ${t.gpaSource === 'unweighted' ? 'unweighted' : 'cumulative'} GPA below ${t.gpaBelow.toFixed(2)}, or ${t.failingGradesAtLeast} or more failing course ${t.failingGradesAtLeast === 1 ? 'grade' : 'grades'} when course grades are in the file.`,
    behavior: `Behavior: ${t.behaviorIncidentsAtLeast} or more incidents.`,
    tiers: `Needs support now: ${t.tier3MinFlags} or more signals (Tier 3). Worth a check-in: ${t.tier2MinFlags} or more signals (Tier 2). Everyone else is Tier 1.`,
    movement: `Slipping or growing: absence moved ${t.moveAbsencePoints} or more points, GPA moved ${t.moveGpa.toFixed(2)} or more, or behavior incidents changed, since the last snapshot. Attendance changes count once both snapshots cover ${t.moveMinDays} or more school days. Finding footing: fewer signals than last time. Close to a line: within ${t.nearAbsencePoints} points of the attendance line, within ${t.nearGpa.toFixed(2)} of the GPA line, or one incident short of the behavior line.`,
  }
}

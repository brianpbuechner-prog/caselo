// The rules engine. Deterministic: the same record and thresholds always
// give the same flags. Each flag carries a plain-language reason.
//
// There are three rule categories. A student gets at most one flag per
// category, so tiers reflect how many areas of concern a student has.

import type { Thresholds } from '../../config/rules'
import type { CourseMark, StudentRow } from '../model'
import type { Category } from '../sis/types'

export type RuleCategory = 'attendance' | 'academics' | 'behavior'

export const RULE_CATEGORIES: RuleCategory[] = ['attendance', 'academics', 'behavior']

export const RULE_LABELS: Record<RuleCategory, string> = {
  attendance: 'Attendance',
  academics: 'Academics',
  behavior: 'Behavior',
}

export type AttendanceMethod = 'district' | 'days' | 'marks'

export const ATTENDANCE_METHOD_LABELS: Record<AttendanceMethod, string> = {
  district: "District's absence percentage",
  days: 'Days absent / scheduled days',
  marks: 'Counted attendance detail rows / scheduled days',
}

export interface Flag {
  category: RuleCategory
  reason: string
}

export type Tier = 1 | 2 | 3

export interface Evaluation {
  row: StudentRow
  flags: Flag[]
  tier: Tier
  absencePct: number | null
  attendanceMethod: AttendanceMethod | null
  /** Absences counted from attendance detail rows, when used. */
  absenceCount: number | null
  gpa: number | null
  failingCourses: CourseMark[]
  incidents: number | null
}

/** Which rule categories can run, given the categories found in the files. */
export function availableRules(categories: Category[]): Record<RuleCategory, boolean> {
  return {
    attendance: categories.includes('attendanceSummary') || categories.includes('attendanceDetail'),
    academics: categories.includes('gpa') || categories.includes('courseGrades'),
    behavior: categories.includes('behavior'),
  }
}

export function isFailing(grade: string | null, t: Thresholds): boolean {
  if (grade == null) return false
  const g = grade.trim()
  if (!g) return false
  const n = Number(g.replace('%', ''))
  if (!Number.isNaN(n) && /^[\d.]+%?$/.test(g)) return n < t.failingNumericBelow
  const marks = t.failingMarks.map((m) => m.trim().toUpperCase())
  // "F+" and "F-" count as F.
  return marks.includes(g.toUpperCase()) || marks.includes(g.toUpperCase().replace(/[+-]$/, ''))
}

function countAbsenceMarks(row: StudentRow, t: Thresholds): number {
  const codes = t.absenceCodes.map((c) => c.trim().toUpperCase())
  const days = new Set<string>()
  row.attendanceMarks.forEach((m, i) => {
    if (codes.length > 0 && !codes.includes((m.code ?? '').toUpperCase())) return
    days.add(m.date ?? `row-${i}`)
  })
  return days.size
}

export function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`
}

export function tierFor(flagCount: number, t: Thresholds): Tier {
  if (flagCount >= t.tier3MinFlags) return 3
  if (flagCount >= t.tier2MinFlags) return 2
  return 1
}

export function evaluate(row: StudentRow, categories: Category[], t: Thresholds): Evaluation {
  const rules = availableRules(categories)
  const flags: Flag[] = []

  // Attendance
  let absencePct: number | null = null
  let attendanceMethod: AttendanceMethod | null = null
  let absenceCount: number | null = null
  if (rules.attendance) {
    if (row.absencePct != null) {
      absencePct = row.absencePct
      attendanceMethod = 'district'
    } else if (row.daysAbsent != null && row.scheduledDays != null && row.scheduledDays > 0) {
      absencePct = (row.daysAbsent / row.scheduledDays) * 100
      attendanceMethod = 'days'
    } else if (categories.includes('attendanceDetail')) {
      absenceCount = countAbsenceMarks(row, t)
      if (row.scheduledDays != null && row.scheduledDays > 0) {
        absencePct = (absenceCount / row.scheduledDays) * 100
        attendanceMethod = 'marks'
      }
    }
    if (absencePct != null && absencePct >= t.chronicAbsencePct) {
      const detail =
        attendanceMethod === 'district'
          ? "district's calculation"
          : attendanceMethod === 'days'
            ? `${row.daysAbsent} of ${row.scheduledDays} days`
            : `${absenceCount} absences of ${row.scheduledDays} days`
      flags.push({
        category: 'attendance',
        reason: `Absent ${fmtPct(absencePct)} of scheduled days (${detail}); threshold ${t.chronicAbsencePct}%`,
      })
    }
  }

  // Academics
  let gpa: number | null = null
  let failingCourses: CourseMark[] = []
  if (rules.academics) {
    const first = t.gpaSource === 'unweighted' ? row.unweightedGPA : row.cumGPA
    const second = t.gpaSource === 'unweighted' ? row.cumGPA : row.unweightedGPA
    const usedFirst = first != null
    gpa = first ?? second
    failingCourses = row.courses.filter((c) => isFailing(c.grade, t))
    const reasons: string[] = []
    if (gpa != null && gpa < t.gpaBelow) {
      const which =
        (usedFirst ? t.gpaSource : t.gpaSource === 'unweighted' ? 'cumulative' : 'unweighted') === 'unweighted'
          ? 'Unweighted GPA'
          : 'Cumulative GPA'
      reasons.push(`${which} ${gpa.toFixed(2)}, below ${t.gpaBelow.toFixed(2)}`)
    }
    if (categories.includes('courseGrades') && failingCourses.length >= t.failingGradesAtLeast) {
      const names = failingCourses.map((c) => c.course ?? 'course').join(', ')
      reasons.push(`${failingCourses.length} failing ${failingCourses.length === 1 ? 'grade' : 'grades'} (${names})`)
    }
    if (reasons.length) flags.push({ category: 'academics', reason: reasons.join('; ') })
  }

  // Behavior
  let incidents: number | null = null
  if (rules.behavior) {
    incidents = row.incidents ?? 0
    if (incidents >= t.behaviorIncidentsAtLeast) {
      flags.push({
        category: 'behavior',
        reason: `${incidents} behavior ${incidents === 1 ? 'incident' : 'incidents'}; threshold ${t.behaviorIncidentsAtLeast}`,
      })
    }
  }

  return {
    row,
    flags,
    tier: tierFor(flags.length, t),
    absencePct,
    attendanceMethod,
    absenceCount,
    gpa,
    failingCourses,
    incidents,
  }
}

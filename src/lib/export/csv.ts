// Build a results CSV in the browser and hand it to the user as a download.
// Nothing is uploaded. The file goes straight to the user's Downloads folder.

import type { StudentResult } from '../compare/analyze'
import { DIRECTION_LABELS, TIER_NAMES } from '../language'
import { ATTENDANCE_METHOD_LABELS, RULE_LABELS } from '../rules/engine'

function cell(v: unknown): string {
  if (v == null) return ''
  const s = String(v)
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

export function resultsToCsv(students: StudentResult[], labels: string[]): string {
  const multi = labels.length > 1
  const header = [
    'Support',
    'Tier',
    'Last name',
    'First name',
    'Student number',
    'State ID',
    'Grade',
    'Absence %',
    'Attendance method',
    'GPA',
    'Failing courses',
    'Behavior incidents',
    'Signals',
    'Reasons',
    'Close to a line',
  ]
  if (multi) {
    for (const l of labels) header.push(`Tier ${l}`, `Absence % ${l}`)
    header.push('Direction', 'Direction reasons')
  }
  const lines = [header.map(cell).join(',')]
  for (const s of students) {
    const e = s.latest
    const r = e.row
    const line: unknown[] = [
      TIER_NAMES[e.tier],
      e.tier,
      r.lastName,
      r.firstName,
      r.studentNumber,
      r.stateId,
      r.grade,
      e.absencePct == null ? '' : e.absencePct.toFixed(1),
      e.attendanceMethod ? ATTENDANCE_METHOD_LABELS[e.attendanceMethod] : '',
      e.gpa == null ? '' : e.gpa.toFixed(2),
      e.failingCourses.map((c) => `${c.course ?? 'course'} (${c.grade})`).join('; '),
      e.incidents ?? '',
      e.flags.map((f) => RULE_LABELS[f.category]).join('; '),
      e.flags.map((f) => f.reason).join(' | '),
      s.near.join(' | '),
    ]
    if (multi) {
      for (const h of s.history) line.push(h?.tier ?? '', h?.absencePct == null ? '' : h.absencePct.toFixed(1))
      line.push(s.change === 'new' ? 'New' : s.movement ? DIRECTION_LABELS[s.movement.direction] : '', s.movement?.reasons.join(' | ') ?? '')
    }
    lines.push(line.map(cell).join(','))
  }
  return lines.join('\r\n') + '\r\n'
}

export function downloadText(fileName: string, text: string, type = 'text/csv'): void {
  const blob = new Blob([text], { type: `${type};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

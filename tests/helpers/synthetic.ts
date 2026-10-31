// Synthetic students for tests. Every value is invented: names are made-up
// syllable pairs, student numbers start at 9100000 and state IDs at
// 9900000000, ranges no real export uses. The same seed always gives the
// same caseload, so failures can be reproduced.

import { buildUpload } from '../../src/lib/files/read'
import type { Delimiter } from '../../src/lib/files/delimiter'
import type { StudentRow } from '../../src/lib/model'
import { infiniteCampus } from '../../src/lib/sis/infinite-campus/fields'

/** Small seeded PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const FIRST = ['Ar', 'Bel', 'Cor', 'Dax', 'Esk', 'Fen', 'Gry', 'Hal', 'Iv', 'Jor', 'Kel', 'Lun', 'Mav', 'Nor', 'Ost', 'Pel']
const SECOND = ['quin', 'dros', 'velt', 'marn', 'tisk', 'broo', 'zell', 'kast', 'wynd', 'lorp', 'frix', 'gant']

/** An invented name, unique per index up to 192 x 192 students. */
export function fakeName(i: number): { last: string; first: string } {
  const a = FIRST[i % FIRST.length] + SECOND[Math.floor(i / FIRST.length) % SECOND.length]
  const b = SECOND[i % SECOND.length] + FIRST[Math.floor(i / SECOND.length) % FIRST.length]
  const tag = String.fromCharCode(97 + (Math.floor(i / 192) % 26))
  return { last: `Zz${a}${tag}`, first: `Qq${b[0].toUpperCase()}${b.slice(1)}${tag}` }
}

export interface SynthStudent {
  studentNumber: string
  stateID: string
  lastName: string
  firstName: string
  grade: string
  absenteeismPercentage: number
  daysAbsent: number
  scheduledDays: number
  cumGPA: number
  unweightedGPA: number
  incidents: number
}

export interface CaseloadOptions {
  count: number
  seed?: number
  grades?: string[]
  scheduledDays?: number
  /** First index, so two caseloads can share or avoid students. */
  start?: number
}

export function caseload(o: CaseloadOptions): SynthStudent[] {
  const r = rng(o.seed ?? 1)
  const grades = o.grades ?? ['6', '7', '8', '9', '10', '11', '12']
  const days = o.scheduledDays ?? 44
  return Array.from({ length: o.count }, (_, k) => {
    const i = (o.start ?? 0) + k
    const { last, first } = fakeName(i)
    const daysAbsent = Math.floor(r() ** 2.2 * days * 0.4)
    const unweighted = Math.round((0.6 + r() * 3.4) * 100) / 100
    return {
      studentNumber: String(9100000 + i),
      stateID: String(9900000000 + i * 7),
      lastName: last,
      firstName: first,
      grade: grades[Math.floor(r() * grades.length)],
      absenteeismPercentage: Math.round((daysAbsent / days) * 1000) / 10,
      daysAbsent,
      scheduledDays: days,
      cumGPA: Math.min(4.5, Math.round((unweighted + r() * 0.4) * 100) / 100),
      unweightedGPA: unweighted,
      incidents: Math.floor(r() ** 3 * 6),
    }
  })
}

/** Field key to header text, for one way a SIS might name its columns. */
export type HeaderSet = Partial<Record<keyof SynthStudent | 'incidentID' | 'incidentDate' | 'resolutionCode' | 'courseName' | 'courseGrade' | 'attendanceDate' | 'attendanceCode', string>>

export const STUDENT_HEADER_SETS: Record<string, HeaderSet> = {
  'Infinite Campus defaults': {
    studentNumber: 'student.studentNumber',
    stateID: 'student.stateID',
    lastName: 'student.lastName',
    firstName: 'student.firstName',
    grade: 'student.grade',
    absenteeismPercentage: 'attChronicAbsenteeism.absenteeismPercentage',
    daysAbsent: 'attChronicAbsenteeism.daysAbsent',
    scheduledDays: 'attChronicAbsenteeism.scheduledDays',
    cumGPA: 'cumGPA.cumGPA',
    unweightedGPA: 'unweightedGPA.cumGPA',
  },
  'Infinite Campus, underscores and gpa.* fields': {
    studentNumber: 'student_studentNumber',
    stateID: 'student_stateID',
    lastName: 'student_lastName',
    firstName: 'student_firstName',
    grade: 'student_grade',
    absenteeismPercentage: 'attChronicAbsenteeism_absenteeismPercentage',
    daysAbsent: 'attChronicAbsenteeism_daysAbsent',
    scheduledDays: 'attChronicAbsenteeism_scheduledDays',
    cumGPA: 'gpa.cumGpaBasic',
    unweightedGPA: 'gpa.cumGPAUnweighted',
  },
  'Filter Designer labels': {
    studentNumber: 'Student Number',
    stateID: 'State ID',
    lastName: 'Last Name',
    firstName: 'First Name',
    grade: 'Grade',
    absenteeismPercentage: 'Absenteeism Percentage',
    daysAbsent: 'Days Absent',
    scheduledDays: 'Scheduled Days',
    cumGPA: 'Cumulative GPA',
    unweightedGPA: 'Unweighted GPA',
  },
  'PowerSchool style': {
    studentNumber: 'Student_Number',
    stateID: 'State_StudentNumber',
    lastName: 'Last_Name',
    firstName: 'First_Name',
    grade: 'Grade_Level',
    absenteeismPercentage: 'Pct_Absent',
    daysAbsent: 'Days_Absent',
    scheduledDays: 'Days_Enrolled',
    cumGPA: 'GPA_Cumulative',
    unweightedGPA: 'GPA_Unweighted',
  },
  'Synergy style': {
    studentNumber: 'Perm ID',
    stateID: 'SSID',
    lastName: 'Last Name',
    firstName: 'First Name',
    grade: 'Grade',
    absenteeismPercentage: 'Absence Rate',
    daysAbsent: 'Total Days Absent',
    scheduledDays: 'Days Possible',
    cumGPA: 'Cum GPA',
    unweightedGPA: 'Unweighted Cum GPA',
  },
  'District plain language': {
    studentNumber: 'Local ID',
    stateID: 'State Number',
    lastName: 'Surname',
    firstName: 'Given Name',
    grade: 'Current Grade',
    absenteeismPercentage: '% Absent',
    daysAbsent: 'Absences YTD',
    scheduledDays: 'Days in Membership',
    cumGPA: 'Overall GPA',
    unweightedGPA: 'Unweighted GPA',
  },
  'lower snake case': {
    studentNumber: 'student_number',
    stateID: 'state_id',
    lastName: 'last_name',
    firstName: 'first_name',
    grade: 'grade_level',
    absenteeismPercentage: 'pct_absent',
    daysAbsent: 'days_absent',
    scheduledDays: 'days_enrolled',
    cumGPA: 'cum_gpa',
    unweightedGPA: 'unweighted_gpa',
  },
}

export const BEHAVIOR_HEADER_SETS: Record<string, HeaderSet> = {
  'Infinite Campus defaults': {
    studentNumber: 'student.studentNumber',
    incidentID: 'behaviorDetail.incidentID',
    incidentDate: 'behaviorDetail.incidentDate',
    resolutionCode: 'behaviorDetail.resolutionCode',
  },
  'Filter Designer labels': {
    studentNumber: 'Student Number',
    incidentID: 'Incident ID',
    incidentDate: 'Incident Date',
    resolutionCode: 'Resolution Code',
  },
  'lower snake case': {
    studentNumber: 'student_number',
    incidentID: 'incident_number',
    incidentDate: 'incident_date',
    resolutionCode: 'action_taken',
  },
}

export interface TextOptions {
  delimiter?: Delimiter
  /** Column order, as header-set keys. Default: the header set's order. */
  order?: string[]
  crlf?: boolean
  /** Lines written above the header row, such as a report title. */
  preamble?: string[]
  /** Write the absence percentage with a % sign. */
  percentSign?: boolean
  /** Quote every value. */
  quoteAll?: boolean
}

function quote(v: string, delimiter: string, all: boolean): string {
  return all || v.includes(delimiter) || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v
}

function write(header: string[], rows: string[][], o: TextOptions): string {
  const d = o.delimiter ?? ','
  const nl = o.crlf ? '\r\n' : '\n'
  const line = (cells: string[]) => cells.map((c) => quote(c, d, Boolean(o.quoteAll))).join(d)
  return [...(o.preamble ?? []), line(header), ...rows.map(line)].join(nl) + nl
}

/** One row per student, using the given header names. */
export function studentText(students: SynthStudent[], headers: HeaderSet, o: TextOptions = {}): string {
  const keys = (o.order ?? Object.keys(headers)) as (keyof SynthStudent)[]
  const value = (s: SynthStudent, k: keyof SynthStudent): string => {
    const v = s[k]
    if (k === 'absenteeismPercentage') return `${(v as number).toFixed(1)}${o.percentSign ? '%' : ''}`
    if (k === 'cumGPA' || k === 'unweightedGPA') return (v as number).toFixed(2)
    return String(v)
  }
  return write(
    keys.map((k) => headers[k]!),
    students.map((s) => keys.map((k) => value(s, k))),
    o,
  )
}

/** One row per incident. Each student gets `incidents` distinct incident IDs. */
export function behaviorText(students: SynthStudent[], headers: HeaderSet, o: TextOptions & { idPrefix?: string } = {}): string {
  const keys = o.order ?? Object.keys(headers)
  const rows: string[][] = []
  for (const s of students) {
    for (let n = 0; n < s.incidents; n++) {
      const cells: Record<string, string> = {
        studentNumber: s.studentNumber,
        incidentID: `${o.idPrefix ?? 'BX'}${s.studentNumber}-${n}`,
        incidentDate: `10/${String(1 + n).padStart(2, '0')}/2026`,
        resolutionCode: n % 2 ? 'DET' : 'CONF',
      }
      rows.push(keys.map((k) => cells[k]))
    }
  }
  return write(
    keys.map((k) => headers[k as keyof HeaderSet]!),
    rows,
    o,
  )
}

export function upload(name: string, text: string, label: string) {
  return buildUpload(name, text, infiniteCampus, label)
}

/** A StudentRow with everything empty except what is given. */
export function studentRow(p: Partial<StudentRow> & { key: string }): StudentRow {
  return {
    studentNumber: p.key,
    stateId: null,
    lastName: null,
    firstName: null,
    grade: '9',
    absencePct: null,
    daysAbsent: null,
    scheduledDays: 44,
    districtChronic: null,
    cumGPA: null,
    unweightedGPA: null,
    incidents: null,
    resolutionCodes: [],
    attendanceMarks: [],
    courses: [],
    ...p,
  }
}

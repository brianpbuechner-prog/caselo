// Generates synthetic Infinite Campus Ad Hoc exports for testing and demos.
// Every name, ID, and number is invented. No real student data is used.
// A fixed seed makes the output identical on every run.
//
// Usage: npm run sample-data
//
// Output (public/sample-data/):
//   ic-students-q1.csv       one row per student: identity, chronic absenteeism, GPA
//   ic-students-q2.csv       same students later in the year, with changed values
//   ic-behavior-q2.csv       many rows per student: behavior incidents through Q2
//   ic-students-renamed.tsv  Q1 data with district-style renamed headers, tab delimited

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sample-data')
const STUDENT_COUNT = 300

// mulberry32 seeded random numbers, 0 to 1.
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = rng(20261011)
const pick = (list) => list[Math.floor(rand() * list.length)]
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))
const normal = () => {
  // Box-Muller
  const u = Math.max(rand(), 1e-9)
  const v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

const FIRST = [
  'Avery', 'Jordan', 'Riley', 'Morgan', 'Quinn', 'Rowan', 'Emery', 'Hayden', 'Sawyer', 'Reese',
  'Ava', 'Liam', 'Noah', 'Emma', 'Olivia', 'Mateo', 'Sofia', 'Amara', 'Ethan', 'Isla',
  'Mason', 'Leila', 'Owen', 'Nora', 'Elijah', 'Zara', 'Lucas', 'Maya', 'Henry', 'Aaliyah',
  'Samir', 'Grace', 'Diego', 'Hana', 'Caleb', 'Ines', 'Isaac', 'Kira', 'Theo', 'Lena',
  'Jonah', 'Mila', 'Felix', 'Yara', 'Gabriel', 'Esme', 'Adrian', 'Ruby', 'Malik', 'Clara',
]
const LAST = [
  'Anders', 'Bergstrom', 'Calloway', 'Dahl', 'Ellison', 'Fairbanks', 'Gundersen', 'Halvorsen',
  'Iverson', 'Jaramillo', 'Kowalski', 'Lindqvist', 'Moreno', 'Nakamura', 'Okafor', 'Pellerin',
  'Quist', 'Rasmussen', 'Solberg', 'Thao', 'Underwood', 'Vang', 'Whitcomb', 'Xiong', 'Yusuf',
  'Zimmerman', 'Abdi', 'Brandvold', 'Castellano', 'Duarte', 'Engstrom', 'Farah', 'Greer',
  'Hollis', 'Ibarra', 'Jensen', 'Karlsson', 'Lor', 'Mattson', 'Nyberg', 'Ostrander', 'Pham',
]
const RESOLUTIONS = ['CONF', 'PCON', 'DET', 'ISS', 'OSS']

// Year-to-date scheduled days at each snapshot.
const SCHEDULED = { q1: 44, q2: 88 }

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

const students = []
const usedNumbers = new Set()
for (let i = 0; i < STUDENT_COUNT + 6; i++) {
  let studentNumber
  do studentNumber = String(100000 + Math.floor(rand() * 900000))
  while (usedNumbers.has(studentNumber))
  usedNumbers.add(studentNumber)

  // Absence rate for Q1: most students low, with a long tail.
  const r = rand()
  let q1Rate
  if (r < 0.55) q1Rate = rand() * 0.05
  else if (r < 0.8) q1Rate = 0.04 + rand() * 0.06
  else if (r < 0.94) q1Rate = 0.09 + rand() * 0.11
  else q1Rate = 0.2 + rand() * 0.2

  // Q2 rate: some improve, some get worse, most hold steady.
  const d = rand()
  const q2Rate = clamp(
    d < 0.15 ? q1Rate - 0.03 - rand() * 0.04 : d < 0.3 ? q1Rate + 0.03 + rand() * 0.08 : q1Rate + (rand() - 0.5) * 0.02,
    0,
    0.6,
  )

  // GPA, mildly lower for students who miss more school.
  const unweighted = clamp(3.25 - q1Rate * 5 + normal() * 0.6, 0.4, 4.0)
  const gpaDrift = d >= 0.15 && d < 0.3 ? -0.1 - rand() * 0.35 : (rand() - 0.5) * 0.2

  // Behavior incidents for the year so far, related to attendance.
  const b = rand() + q1Rate * 0.8
  const incidents = b < 0.8 ? 0 : b < 0.89 ? 1 : b < 0.95 ? 2 : b < 1.02 ? 3 + Math.floor(rand() * 2) : 4 + Math.floor(rand() * 3)

  students.push({
    studentNumber,
    stateID: '0' + String(Math.floor(1e10 + rand() * 9e10)) + String(Math.floor(rand() * 10)),
    lastName: pick(LAST),
    firstName: pick(FIRST),
    grade: String(9 + Math.floor(rand() * 4)),
    q1Rate,
    q2Rate,
    unweighted,
    weightedBump: rand() * 0.35,
    gpaDrift,
    incidents,
    // First 300 are enrolled in Q1. The last 6 enroll in Q2. 5 withdraw before Q2.
    inQ1: i < STUDENT_COUNT,
    inQ2: i >= STUDENT_COUNT || rand() > 5 / STUDENT_COUNT,
    gpaMissingQ1: rand() < 0.02,
  })
}

// ---------------------------------------------------------------------------
// Writers
// ---------------------------------------------------------------------------

function cell(value, delimiter) {
  const s = value == null ? '' : String(value)
  return s.includes(delimiter) || /["\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

function write(fileName, headers, rows, delimiter = ',') {
  const lines = [headers.map((h) => cell(h, delimiter)).join(delimiter)]
  for (const row of rows) lines.push(row.map((v) => cell(v, delimiter)).join(delimiter))
  writeFileSync(join(OUT_DIR, fileName), lines.join('\r\n') + '\r\n')
  console.log(`${fileName}: ${rows.length} rows`)
}

const STUDENT_HEADERS = [
  'student.studentNumber',
  'student.stateID',
  'student.lastName',
  'student.firstName',
  'student.grade',
  'attChronicAbsenteeism.absenteeismPercentage',
  'attChronicAbsenteeism.daysAbsent',
  'attChronicAbsenteeism.scheduledDays',
  'attChronicAbsenteeism.chronicallyAbsent',
  'cumGPA.cumGPA',
  'unweightedGPA.cumGPA',
]

function studentRow(s, snapshot) {
  const lateEnroll = !s.inQ1
  const scheduled = snapshot === 'q1' ? SCHEDULED.q1 : lateEnroll ? SCHEDULED.q2 - SCHEDULED.q1 : SCHEDULED.q2
  // Year-to-date rate: Q2 averages both quarters for students enrolled all year.
  const rate = snapshot === 'q1' ? s.q1Rate : lateEnroll ? s.q2Rate : (s.q1Rate + s.q2Rate) / 2
  const daysAbsent = Math.round(clamp(rate + (rand() - 0.5) * 0.006, 0, 0.6) * scheduled * 2) / 2
  const pct = (daysAbsent / scheduled) * 100
  const unweighted = snapshot === 'q1' ? s.unweighted : clamp(s.unweighted + s.gpaDrift, 0.3, 4.0)
  const gpaMissing = snapshot === 'q1' && s.gpaMissingQ1
  return [
    s.studentNumber,
    s.stateID,
    s.lastName,
    s.firstName,
    s.grade,
    pct.toFixed(2),
    daysAbsent.toFixed(1),
    scheduled,
    pct >= 10 ? 1 : 0,
    gpaMissing ? '' : (unweighted + s.weightedBump).toFixed(3),
    gpaMissing ? '' : unweighted.toFixed(3),
  ]
}

mkdirSync(OUT_DIR, { recursive: true })

const q1Rows = students.filter((s) => s.inQ1).map((s) => studentRow(s, 'q1'))
const q2Rows = students.filter((s) => s.inQ2).map((s) => studentRow(s, 'q2'))
write('ic-students-q1.csv', STUDENT_HEADERS, q1Rows)
write('ic-students-q2.csv', STUDENT_HEADERS, q2Rows)

// Behavior incidents, many rows per student. About 15% of incidents have a
// second row for a second resolution, so counting must use distinct IDs.
const behaviorRows = []
let incidentSeq = 40000
const start = Date.UTC(2025, 8, 2) // Sept 2, 2025
const end = Date.UTC(2026, 0, 23) // Jan 23, 2026
for (const s of students.filter((x) => x.inQ2)) {
  for (let k = 0; k < s.incidents; k++) {
    incidentSeq += 1 + Math.floor(rand() * 7)
    const date = new Date(start + rand() * (end - start))
    const ds = `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}/${date.getUTCFullYear()}`
    const first = pick(RESOLUTIONS)
    const base = [s.studentNumber, s.lastName, s.firstName, s.grade, String(incidentSeq), ds]
    behaviorRows.push([...base, first])
    if (rand() < 0.15) behaviorRows.push([...base, pick(RESOLUTIONS.filter((r) => r !== first))])
  }
}
write(
  'ic-behavior-q2.csv',
  [
    'student.studentNumber',
    'student.lastName',
    'student.firstName',
    'student.grade',
    'behaviorDetail.incidentID',
    'behaviorDetail.incidentDate',
    'behaviorDetail.resolutionCode',
  ],
  behaviorRows,
)

// Q1 again with renamed headers, Y/N flags, extra columns, tab delimited.
const RENAMED = [
  'Student Number',
  'State ID',
  'Last Name',
  'First Name',
  'Grade Level',
  'Homeroom',
  'Absence %',
  'Days Absent',
  'Days Scheduled',
  'Chronic Absentee (Y/N)',
  'Cumulative GPA',
  'Unweighted GPA',
]
const rooms = ['101', '104', '210', '215', '302']
const renamedRows = q1Rows.map((r) => [
  r[0], r[1], r[2], r[3], r[4], pick(rooms), r[5], r[6], r[7], r[8] === 1 ? 'Y' : 'N', r[9], r[10],
])
write('ic-students-renamed.tsv', RENAMED, renamedRows, '\t')

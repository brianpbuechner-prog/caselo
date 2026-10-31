// File parsing, end to end: bytes or text in, one row per student out.
// Every file here is generated from synthetic students.

import { beforeAll, describe, expect, test } from 'vitest'
import * as XLSX from 'xlsx'
import type { SqlRunner } from '../src/lib/db/types'
import { DELIMITERS } from '../src/lib/files/delimiter'
import { guessLabel, readFile, readPasted } from '../src/lib/files/read'
import { processFile } from '../src/lib/grouping/rollup'
import type { UploadedFile } from '../src/lib/model'
import { infiniteCampus } from '../src/lib/sis/infinite-campus/fields'
import { createNodeRunner } from './helpers/node-db'
import { caseload, STUDENT_HEADER_SETS, studentText, upload, type SynthStudent } from './helpers/synthetic'

let db: SqlRunner
beforeAll(async () => {
  db = await createNodeRunner()
})

const IC = STUDENT_HEADER_SETS['Infinite Campus defaults']
const students = caseload({ count: 40, seed: 11 })
// Values that need quoting in any delimiter.
students[0] = { ...students[0], lastName: 'Zzarquin, Jr' }
students[1] = { ...students[1], lastName: 'Zz"Kel"dros' }
students[2] = { ...students[2], lastName: 'Zzpipe|caret^tab\tname' }

async function rows(file: UploadedFile) {
  return (await processFile(db, file, 0, infiniteCampus)).rows
}

function expectStudents(got: Awaited<ReturnType<typeof rows>>, want: SynthStudent[]) {
  expect(got).toHaveLength(want.length)
  const byKey = new Map(got.map((r) => [r.key, r]))
  for (const s of want) {
    const r = byKey.get(s.studentNumber)
    expect(r, s.studentNumber).toBeDefined()
    expect(r!.lastName).toBe(s.lastName)
    expect(r!.firstName).toBe(s.firstName)
    expect(r!.grade).toBe(s.grade)
    expect(r!.absencePct).toBeCloseTo(s.absenteeismPercentage, 5)
    expect(r!.unweightedGPA).toBeCloseTo(s.unweightedGPA, 5)
  }
}

describe('delimiters and quoting', () => {
  test.each(DELIMITERS.map((d) => [d.label, d.value] as const))('%s delimited, with quoted values that hold delimiters and quotes', async (_label, delimiter) => {
    const file = upload('q1.txt', studentText(students, IC, { delimiter }), 'Q1')
    expect(file.delimiter).toBe(delimiter)
    expect(file.headerLine).toBe(0)
    expectStudents(await rows(file), students)
  })

  test('every value quoted', async () => {
    const file = upload('q1.csv', studentText(students, IC, { quoteAll: true }), 'Q1')
    expectStudents(await rows(file), students)
  })

  test('Windows line endings', async () => {
    const file = upload('q1.csv', studentText(students, IC, { crlf: true }), 'Q1')
    expect(file.headers.at(-1)).toBe(Object.values(IC).at(-1))
    expectStudents(await rows(file), students)
  })

  test('percent signs on the absence percentage', async () => {
    const file = upload('q1.csv', studentText(students, IC, { percentSign: true }), 'Q1')
    expectStudents(await rows(file), students)
  })
})

describe('layout around the data', () => {
  test('a report title, a generated-on line, and blank lines above the header', async () => {
    const preamble = ['Student Attendance Report', 'Generated 10/30/2026 8:01 AM', '', '']
    const file = upload('q1.csv', studentText(students, IC, { preamble }), 'Q1')
    expect(file.headerLine).toBe(4)
    expect(file.headers[0]).toBe('student.studentNumber')
    expectStudents(await rows(file), students)
  })

  test('a quoted title that spans two lines above the header', async () => {
    const preamble = ['"Caseload export,', 'second line of the title"']
    const file = upload('q1.csv', studentText(students, IC, { preamble }), 'Q1')
    expect(file.headers[0]).toBe('student.studentNumber')
    expectStudents(await rows(file), students)
  })

  test('a value with a line break inside quotes stays one row', async () => {
    const odd = students.map((s, i) => (i === 3 ? { ...s, lastName: 'Zzline\nbreak' } : s))
    const file = upload('q1.csv', studentText(odd, IC), 'Q1')
    expectStudents(await rows(file), odd)
  })

  test('blank lines between rows are skipped', async () => {
    const text = studentText(students, IC).replace(/\n(?=9100005)/, '\n\n\n')
    expectStudents(await rows(upload('q1.csv', text, 'Q1')), students)
  })

  test('short rows read as empty values, not shifted ones', async () => {
    const lines = studentText(students.slice(0, 5), IC).trimEnd().split('\n')
    lines[2] = lines[2].split(',').slice(0, 3).join(',')
    const got = await rows(upload('q1.csv', lines.join('\n') + '\n', 'Q1'))
    const short = got.find((r) => r.key === students[1].studentNumber)!
    expect(short.stateId).toBe(students[1].stateID)
    expect(short.grade).toBeNull()
    expect(short.absencePct).toBeNull()
    expect(got.find((r) => r.key === students[2].studentNumber)!.absencePct).toBeCloseTo(students[2].absenteeismPercentage, 5)
  })

  test('surrounding spaces are trimmed and empty cells are missing values', async () => {
    const text = ['student.studentNumber,student.grade,unweightedGPA.cumGPA', ' 9100001 , 09 ,  3.10 ', '9100002,,', '9100003,10,2.50'].join('\n')
    const got = await rows(upload('q1.csv', text, 'Q1'))
    expect(got.map((r) => [r.key, r.grade, r.unweightedGPA])).toEqual([
      ['9100001', '9', 3.1],
      ['9100002', null, null],
      ['9100003', '10', 2.5],
    ])
  })
})

describe('encodings', () => {
  const text = studentText(students, IC)

  test('UTF-8 with a byte order mark', async () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(text)])
    const file = await readFile(new File([bytes], 'q1.csv'), infiniteCampus, 'Snapshot 1')
    expect(file.headers[0]).toBe('student.studentNumber')
    expectStudents(await rows(file), students)
  })

  test.each([
    ['little', true],
    ['big', false],
  ] as const)('UTF-16 %s endian', async (_name, little) => {
    const buf = new Uint8Array(2 + text.length * 2)
    const view = new DataView(buf.buffer)
    view.setUint16(0, 0xfeff, little)
    for (let i = 0; i < text.length; i++) view.setUint16(2 + i * 2, text.charCodeAt(i), little)
    const file = await readFile(new File([buf], 'q1.csv'), infiniteCampus, 'Snapshot 1')
    expect(file.headers[0]).toBe('student.studentNumber')
    expectStudents(await rows(file), students)
  })
})

describe('spreadsheets', () => {
  function workbook(sheets: Record<string, (string | number)[][]>, percentColumn?: number): ArrayBuffer {
    const wb = XLSX.utils.book_new()
    for (const [name, aoa] of Object.entries(sheets)) {
      const ws = XLSX.utils.aoa_to_sheet(aoa)
      if (percentColumn != null) {
        for (let r = 1; r < aoa.length; r++) {
          const cell = ws[XLSX.utils.encode_cell({ r, c: percentColumn })]
          if (cell) cell.z = '0.0%'
        }
      }
      XLSX.utils.book_append_sheet(wb, ws, name)
    }
    return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  }

  const header = ['student.studentNumber', 'student.lastName', 'student.firstName', 'student.grade', 'attChronicAbsenteeism.absenteeismPercentage', 'unweightedGPA.cumGPA']
  const body = students.map((s) => [s.studentNumber, s.lastName, s.firstName, Number(s.grade), s.absenteeismPercentage / 100, s.unweightedGPA])

  test('percent-formatted cells read as percents, and the label comes from the name', async () => {
    const bytes = workbook({ Students: [header, ...body] }, 4)
    const file = await readFile(new File([bytes], 'caseload-spring.xlsx'), infiniteCampus, 'Snapshot 1')
    expect(file.label).toBe('Spring')
    expect(file.labelSource).toBe('name')
    expectStudents(await rows(file), students)
  })

  test('the first sheet with data is used, after an empty one and a title row', async () => {
    const bytes = workbook({ Cover: [[]], Data: [['Caseload export'], [], header, ...body] }, 4)
    const file = await readFile(new File([bytes], 'q2.xlsx'), infiniteCampus, 'Snapshot 1')
    expect(file.sheet).toBe('Data')
    expect(file.headers[0]).toBe('student.studentNumber')
    expectStudents(await rows(file), students)
  })
})

describe('labels and rejects', () => {
  test.each([
    ['attendance_q2.csv', 'Q2'],
    ['Q3 behavior.xlsx', 'Q3'],
    ['caseload-S1.csv', 'S1'],
    ['sem2_export.txt', 'SEM2'],
    ['Winter 2026.csv', 'Winter'],
    ['export.csv', null],
    ['q12.csv', null],
    ['eq2.csv', null],
  ])('%s gives %s', (name, label) => {
    expect(guessLabel(name)).toBe(label)
  })

  // Known bug (listed in the PR): any match of 4 letters or fewer is upper
  // cased, so "fall" becomes "FALL" while "winter" becomes "Winter".
  // Ordering is unaffected (labelRank ignores case).
  test.fails('a file named for fall is labeled "Fall"', () => {
    expect(guessLabel('caseload-fall.csv')).toBe('Fall')
  })

  test('pasted text keeps a typed label and is read like a file', async () => {
    const file = readPasted(studentText(students, IC, { delimiter: '\t' }), infiniteCampus, ' Q1 ')
    expect(file.label).toBe('Q1')
    expect(file.labelSource).toBe('user')
    expectStudents(await rows(file), students)
  })

  test('HTML saved with a .csv name, binary data, and an empty file are refused', async () => {
    await expect(readFile(new File(['<html><body>x</body></html>'], 'q1.csv'), infiniteCampus, 'S')).rejects.toThrow(/HTML/)
    await expect(readFile(new File([new Uint8Array([1, 0, 2, 0, 3])], 'q1.csv'), infiniteCampus, 'S')).rejects.toThrow(/not look like text/)
    await expect(readFile(new File(['  \n '], 'q1.csv'), infiniteCampus, 'S')).rejects.toThrow(/empty/)
  })
})

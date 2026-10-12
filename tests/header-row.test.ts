import { beforeAll, describe, expect, test } from 'vitest'
import type { SqlRunner } from '../src/lib/db/types'
import { dataLines, detectDelimiter, detectHeaderRow, readRecords } from '../src/lib/files/delimiter'
import { buildUpload, withDelimiter } from '../src/lib/files/read'
import { processFile } from '../src/lib/grouping/rollup'
import { infiniteCampus } from '../src/lib/sis/infinite-campus/fields'
import { createNodeRunner } from './helpers/node-db'
import { sampleText } from './helpers/samples'

let db: SqlRunner
beforeAll(async () => {
  db = await createNodeRunner()
})

const csv = sampleText('ic-students-q1.csv')
const tsv = sampleText('ic-students-renamed.tsv')
const upload = (text: string) => buildUpload('test.csv', text, infiniteCampus, 'Q1')
const plain = upload(csv)

async function rowsOf(text: string) {
  return (await processFile(db, upload(text), 0, infiniteCampus)).rows
}

describe('header row not on line 1', () => {
  test('a plain export uses line 1', () => {
    expect(plain.headerLine).toBe(0)
  })

  test('skips a report title line', async () => {
    const f = upload('Chronic Absenteeism Report\r\n' + csv)
    expect(f.headerLine).toBe(1)
    expect(f.delimiter).toBe(',')
    expect(f.headers).toEqual(plain.headers)
    expect(f.mapping).toEqual(plain.mapping)
    const rows = await rowsOf('Chronic Absenteeism Report\r\n' + csv)
    expect(rows).toHaveLength(300)
    expect(rows.some((r) => r.key === 'student.studentNumber')).toBe(false)
  })

  test('skips two blank lines', async () => {
    const text = '\r\n\r\n' + csv
    const f = upload(text)
    expect(f.headerLine).toBe(2)
    expect(f.mapping).toEqual(plain.mapping)
    const rows = await rowsOf(text)
    expect(rows).toHaveLength(300)
    expect(rows.some((r) => r.key === 'student.studentNumber')).toBe(false)
  })

  test('skips a title, a "generated on" line, and blank lines in a tab-delimited file', async () => {
    const text = 'Student Attendance and GPA\n"Generated on 10/12/2026, 8:04 AM by Ad Hoc"\n\n' + tsv
    expect(detectDelimiter(text)).toBe('\t')
    const f = buildUpload('renamed.tsv', text, infiniteCampus, 'Q1')
    const base = buildUpload('renamed.tsv', tsv, infiniteCampus, 'Q1')
    expect(f.delimiter).toBe('\t')
    expect(f.headerLine).toBe(3)
    expect(f.headers[0]).toBe('Student Number')
    expect(f.mapping).toEqual(base.mapping)
    const { rows } = await processFile(db, f, 0, infiniteCampus)
    expect(rows).toHaveLength(300)
  })

  test('a title padded with delimiters loses to the row with catalog matches', () => {
    const cols = plain.headers.length
    const text = 'Student Report' + ','.repeat(cols - 1) + '\n' + 'Run date: 10/12/2026' + ','.repeat(cols - 1) + '\n' + csv
    expect(upload(text).headerLine).toBe(2)
  })

  test('changing the delimiter re-detects the header row', () => {
    const text = 'Report\n\n' + tsv
    const wrong = buildUpload('x.txt', text, infiniteCampus, 'Q1', ',')
    const fixed = withDelimiter(wrong, '\t', infiniteCampus)
    expect(fixed.headerLine).toBe(2)
    expect(fixed.headers[0]).toBe('Student Number')
  })

  test('without catalog matches, picks the earliest consistent line', () => {
    const text = 'Title\nalpha,beta,gamma\n1,2,3\n4,5,6\n7,8,9\n'
    expect(detectHeaderRow(text, ',')).toBe(1)
  })

  test('records count blank lines and keep quoted line breaks in one record', () => {
    const recs = readRecords('a\n\n"x\ny",z\r\nb', 10)
    expect(recs.map((r) => r.text)).toEqual(['a', '', '"x\ny",z', 'b'])
    expect(dataLines('t\n\nh1,h2\n1,2\n\n3,4\n', 2, 5)).toEqual(['1,2', '3,4'])
  })
})

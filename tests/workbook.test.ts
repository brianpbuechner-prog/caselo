import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, test } from 'vitest'
import * as XLSX from 'xlsx'
import type { SqlRunner } from '../src/lib/db/types'
import { buildWorkbookUpload, withSheet } from '../src/lib/files/read'
import { isSpreadsheet, readWorkbook } from '../src/lib/files/workbook'
import { processFile } from '../src/lib/grouping/rollup'
import { infiniteCampus } from '../src/lib/sis/infinite-campus/fields'
import { createNodeRunner } from './helpers/node-db'
import { SAMPLE_DIR, sampleUpload } from './helpers/samples'

const workbookBytes = () => new Uint8Array(readFileSync(join(SAMPLE_DIR, 'ic-workbook-q1.xlsx')))

let db: SqlRunner
beforeAll(async () => {
  db = await createNodeRunner()
})

describe('spreadsheet input', () => {
  test('recognizes spreadsheet file names', () => {
    for (const n of ['a.xlsx', 'a.XLS', 'a.xlsm', 'a.ods']) expect(isSpreadsheet(n), n).toBe(true)
    for (const n of ['a.csv', 'a.tsv', 'a.txt', 'xlsx.csv']) expect(isSpreadsheet(n), n).toBe(false)
  })

  test('reads non-empty sheets in order and skips the empty one', async () => {
    const sheets = await readWorkbook(workbookBytes())
    expect(sheets.map((s) => s.name)).toEqual(['Q1 students', 'Q2 behavior'])
  })

  test('defaults to the first non-empty sheet and maps it like the CSV', async () => {
    const sheets = await readWorkbook(workbookBytes())
    const fromXlsx = buildWorkbookUpload('ic-workbook-q1.xlsx', sheets, infiniteCampus, 'Q1')
    const fromCsv = sampleUpload('ic-students-q1.csv', 'Q1')
    expect(fromXlsx.sheet).toBe('Q1 students')
    expect(fromXlsx.delimiter).toBe(',')
    expect(fromXlsx.headers).toEqual(fromCsv.headers)
    expect(fromXlsx.mapping).toEqual(fromCsv.mapping)
  })

  test('switching sheets re-maps and keeps the id and label', async () => {
    const sheets = await readWorkbook(workbookBytes())
    const first = buildWorkbookUpload('ic-workbook-q1.xlsx', sheets, infiniteCampus, 'Q2')
    const behavior = withSheet(first, 'Q2 behavior', infiniteCampus)
    expect(behavior.id).toBe(first.id)
    expect(behavior.label).toBe('Q2')
    expect(behavior.sheet).toBe('Q2 behavior')
    expect(behavior.mapping).toEqual(sampleUpload('ic-behavior-q2.csv', 'Q2').mapping)
  })

  test('the workbook produces the same student values as the CSV', async () => {
    const sheets = await readWorkbook(workbookBytes())
    const x = await processFile(db, buildWorkbookUpload('ic-workbook-q1.xlsx', sheets, infiniteCampus, 'Q1'), 0, infiniteCampus)
    const c = await processFile(db, sampleUpload('ic-students-q1.csv', 'Q1'), 1, infiniteCampus)
    expect(x.rows).toHaveLength(c.rows.length)
    const byKey = new Map(c.rows.map((r) => [r.key, r]))
    for (const r of x.rows) {
      const o = byKey.get(r.key)!
      expect(o, r.key).toBeDefined()
      expect(r.stateId).toBe(o.stateId)
      expect(r.grade).toBe(o.grade)
      expect(r.absencePct).toBeCloseTo(o.absencePct!, 6)
      expect(r.cumGPA ?? null).toBeCloseTo(o.cumGPA ?? 0, 6)
      expect(r.districtChronic).toBe(o.districtChronic)
    }
  })

  test.each(['xls', 'ods'] as const)('reads a .%s workbook', async (bookType) => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['student.studentNumber', 'cumGPA.cumGPA'], ['1001', 2.5]]), 'Sheet1')
    const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType }))
    const sheets = await readWorkbook(bytes)
    expect(sheets).toHaveLength(1)
    expect(sheets[0].text.trim()).toBe('student.studentNumber,cumGPA.cumGPA\n1001,2.5')
  })

  test('a workbook with no data gives a plain error', async () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), 'Sheet1')
    const sheets = await readWorkbook(new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })))
    expect(sheets).toEqual([])
    expect(() => buildWorkbookUpload('empty.xlsx', sheets, infiniteCampus, 'Q1')).toThrow(/no data/)
  })

  test('a damaged workbook gives a plain error', async () => {
    const zipHeader = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6, 7, 8])
    await expect(readWorkbook(zipHeader)).rejects.toThrow(/could not be opened/)
  })
})

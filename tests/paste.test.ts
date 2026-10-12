import { beforeAll, describe, expect, test } from 'vitest'
import type { SqlRunner } from '../src/lib/db/types'
import { readPasted } from '../src/lib/files/read'
import { processFile } from '../src/lib/grouping/rollup'
import { infiniteCampus } from '../src/lib/sis/infinite-campus/fields'
import { createNodeRunner } from './helpers/node-db'
import { sampleText, sampleUpload } from './helpers/samples'

let db: SqlRunner
beforeAll(async () => {
  db = await createNodeRunner()
})

describe('pasted text', () => {
  test('uses the label and the same detection as a file', () => {
    const p = readPasted(sampleText('ic-students-q1.csv'), infiniteCampus, ' Q1 ')
    const f = sampleUpload('ic-students-q1.csv', 'Q1')
    expect(p.fileName).toBe('Pasted text')
    expect(p.label).toBe('Q1')
    expect(p.delimiter).toBe(',')
    expect(p.mapping).toEqual(f.mapping)
  })

  test('cells copied from a spreadsheet are tab delimited', async () => {
    const tsv = sampleText('ic-students-q1.csv').replace(/,/g, '\t')
    const p = readPasted(tsv, infiniteCampus, 'Q1')
    expect(p.delimiter).toBe('\t')
    expect(p.mapping).toEqual(sampleUpload('ic-students-q1.csv', 'Q1').mapping)
    const { rows } = await processFile(db, p, 0, infiniteCampus)
    expect(rows).toHaveLength(300)
  })

  test('a title line above the header is skipped', () => {
    const p = readPasted('Student report\n' + sampleText('ic-behavior-q2.csv'), infiniteCampus, 'Q2', 'Pasted text 2')
    expect(p.fileName).toBe('Pasted text 2')
    expect(p.headerLine).toBe(1)
    expect(p.mapping).toEqual(sampleUpload('ic-behavior-q2.csv', 'Q2').mapping)
  })

  test('empty or HTML text gives a plain error', () => {
    expect(() => readPasted('   \n ', infiniteCampus, 'Q1')).toThrow(/pasted text is empty/)
    expect(() => readPasted('<table><tr><td>1</td></tr></table>', infiniteCampus, 'Q1')).toThrow(/HTML/)
  })
})

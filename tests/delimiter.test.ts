import { describe, expect, test } from 'vitest'
import { decodeText, rejectReason } from '../src/lib/files/decode'
import { detectDelimiter, readHeaders, splitLine } from '../src/lib/files/delimiter'
import { sampleText } from './helpers/samples'

const rows = (d: string) => [['student.studentNumber', 'student.lastName', 'student.grade'], ['1001', 'Dahl', '9'], ['1002', 'Vang', '10']].map((r) => r.join(d)).join('\n')

describe('delimiter detection', () => {
  test.each([
    [',', 'comma'],
    ['\t', 'tab'],
    ['|', 'pipe'],
    ['^', 'caret'],
  ])('detects %s (%s)', (d) => {
    expect(detectDelimiter(rows(d))).toBe(d)
  })

  test('ignores commas inside quoted values in a tab file', () => {
    const text = 'id\tname\tnote\n1\t"Dahl, Ava"\t"a, b, c"\n2\t"Vang, Leo"\t"x, y"\n'
    expect(detectDelimiter(text)).toBe('\t')
  })

  test('falls back to comma for a single-column file', () => {
    expect(detectDelimiter('studentNumber\n1001\n1002\n')).toBe(',')
  })

  test('detects the synthetic sample files', () => {
    expect(detectDelimiter(sampleText('ic-students-q1.csv'))).toBe(',')
    expect(detectDelimiter(sampleText('ic-behavior-q2.csv'))).toBe(',')
    expect(detectDelimiter(sampleText('ic-students-renamed.tsv'))).toBe('\t')
  })
})

describe('reading headers and lines', () => {
  test('splitLine handles quotes and escaped quotes', () => {
    expect(splitLine('1,"Dahl, Ava","She said ""hi""",', ',')).toEqual(['1', 'Dahl, Ava', 'She said "hi"', ''])
  })

  test('readHeaders skips blank leading lines and trims', () => {
    expect(readHeaders('\n\n a ^ b ^c\n1^2^3', '^')).toEqual(['a', 'b', 'c'])
  })
})

describe('decoding', () => {
  test('strips a UTF-8 byte order mark', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('a,b\n1,2')])
    expect(decodeText(bytes.buffer)).toBe('a,b\n1,2')
  })

  test('decodes UTF-16 little endian', () => {
    const text = 'a\tb\n1\t2'
    const bytes = new Uint8Array(2 + text.length * 2)
    bytes[0] = 0xff
    bytes[1] = 0xfe
    for (let i = 0; i < text.length; i++) bytes[2 + i * 2] = text.charCodeAt(i)
    expect(decodeText(bytes.buffer)).toBe(text)
  })

  test('rejects spreadsheets and HTML with a plain reason', () => {
    expect(rejectReason('export.xlsx')).toMatch(/Excel/)
    expect(rejectReason('export.csv', '<html><body>')).toMatch(/HTML/)
    expect(rejectReason('export.csv', 'a,b\n1,2')).toBeNull()
  })
})

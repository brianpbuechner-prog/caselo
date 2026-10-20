import { describe, expect, test } from 'vitest'
import { labelRank, planSnapshots } from '../src/lib/grouping/plan'
import type { UploadedFile } from '../src/lib/model'
import { infiniteCampus } from '../src/lib/sis/infinite-campus/fields'
import { sampleUpload } from './helpers/samples'

const file = (name: string, label: string, labelSource: UploadedFile['labelSource'], fileName = name): UploadedFile => ({
  ...sampleUpload(name, label),
  fileName,
  labelSource,
})
const plan = (files: UploadedFile[]) => planSnapshots(files, infiniteCampus)
const labels = (p: ReturnType<typeof plan>) => p.files.map((f) => `${f.fileName}=${f.label}`)

describe('snapshot plan', () => {
  test('a student file and a behavior file with no labels are one snapshot', () => {
    const p = plan([file('ic-students-q2.csv', 'Snapshot 1', 'auto', 'students.csv'), file('ic-behavior-q2.csv', 'Snapshot 2', 'auto', 'behavior.csv')])
    expect(p.ready).toBe(true)
    expect(labels(p)).toEqual(['students.csv=Snapshot 1', 'behavior.csv=Snapshot 1'])
  })

  test('two student files with no labels need the person to order them', () => {
    const p = plan([file('ic-students-q1.csv', 'Snapshot 1', 'auto', 'a.csv'), file('ic-students-q2.csv', 'Snapshot 2', 'auto', 'b.csv')])
    expect(p.ready).toBe(false)
    expect(p.reasons.join(' ')).toMatch(/more than one point in time/)
    expect(new Set(p.files.map((f) => f.label)).size).toBe(2)
  })

  test('labels from file names are put in school-year order', () => {
    const p = plan([
      file('ic-behavior-q2.csv', 'Q2', 'name', 'behavior_q2.csv'),
      file('ic-students-q1.csv', 'Q1', 'name', 'students_q1.csv'),
      file('ic-students-q2.csv', 'Q2', 'name', 'students_q2.csv'),
    ])
    expect(p.ready).toBe(true)
    expect(labels(p)).toEqual(['students_q1.csv=Q1', 'behavior_q2.csv=Q2', 'students_q2.csv=Q2'])
  })

  test('an unlabeled file joins the one snapshot missing its data', () => {
    const p = plan([file('ic-students-q2.csv', 'Q2', 'name', 'students_q2.csv'), file('ic-behavior-q2.csv', 'Snapshot 2', 'auto', 'behavior.csv')])
    expect(p.ready).toBe(true)
    expect(labels(p)).toEqual(['students_q2.csv=Q2', 'behavior.csv=Q2'])
  })

  test('an unlabeled file that could join two snapshots is asked about', () => {
    const p = plan([
      file('ic-students-q1.csv', 'Q1', 'name'),
      file('ic-students-q2.csv', 'Q2', 'name'),
      file('ic-behavior-q2.csv', 'Snapshot 3', 'auto'),
    ])
    expect(p.ready).toBe(false)
  })

  test('uncertain columns send the file to review', () => {
    const f = file('ic-students-q1.csv', 'Snapshot 1', 'auto')
    const mapping = { ...f.mapping, studentNumber: { ...f.mapping.studentNumber, method: 'values' as const, confident: false } }
    const p = plan([{ ...f, mapping }])
    expect(p.ready).toBe(false)
    expect(p.focus).toBe(f.id)
    expect(p.reasons[0]).toMatch(/student number/)
  })

  test('ranks known labels', () => {
    expect(labelRank('Q3')).toEqual({ family: 'q', rank: 3 })
    expect(labelRank('Sem2')).toEqual({ family: 's', rank: 2 })
    expect(labelRank('Spring')!.rank).toBeGreaterThan(labelRank('Fall')!.rank)
    expect(labelRank('Snapshot 1')).toBeNull()
  })
})

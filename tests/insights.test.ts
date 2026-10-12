import { beforeAll, describe, expect, test } from 'vitest'
import { DEFAULT_THRESHOLDS as T } from '../src/config/rules'
import { analyze, type Results } from '../src/lib/compare/analyze'
import { absenceDistribution, distribution, gpaDistribution, hotspots, overlap, startHere } from '../src/lib/compare/insights'
import { buildSnapshots } from '../src/lib/grouping/snapshots'
import { infiniteCampus } from '../src/lib/sis/infinite-campus/fields'
import { createNodeRunner } from './helpers/node-db'
import { sampleUpload } from './helpers/samples'

describe('distribution', () => {
  test('the threshold lands on a bin edge and splits flagged from not', () => {
    const d = distribution([0, 9.99, 10, 12.4, 55], 10, { targetWidth: 2.5, max: 30, flagWhen: 'atOrAbove', openEnded: true })
    const edge = d.bins.findIndex((b) => b.flagged)
    expect(d.bins[edge].from).toBe(10)
    expect(d.bins.filter((b) => !b.flagged).reduce((n, b) => n + b.count, 0)).toBe(2)
    expect(d.bins.filter((b) => b.flagged).reduce((n, b) => n + b.count, 0)).toBe(3)
    expect(d.bins.at(-1)).toMatchObject({ to: null, count: 1 })
    expect(d.near).toBe(1)
  })

  test('works for a rule that flags below the threshold', () => {
    const d = distribution([1.99, 2.0, 2.2, 4.0], 2, { targetWidth: 0.25, max: 4, flagWhen: 'below', openEnded: false })
    expect(d.bins.filter((b) => b.flagged).reduce((n, b) => n + b.count, 0)).toBe(1)
    expect(d.bins.reduce((n, b) => n + b.count, 0)).toBe(4)
    expect(d.near).toBe(2)
  })

  test('an odd threshold still lands on an edge', () => {
    const d = distribution([7, 8], 7.5, { targetWidth: 2.5, max: 30, flagWhen: 'atOrAbove', openEnded: true })
    expect(d.bins.find((b) => b.flagged)!.from).toBeCloseTo(7.5)
    expect(d.bins.filter((b) => b.flagged).reduce((n, b) => n + b.count, 0)).toBe(1)
  })
})

describe('insights on the sample data', () => {
  let results: Results
  beforeAll(async () => {
    const runner = await createNodeRunner()
    const files = [
      sampleUpload('ic-students-q1.csv', 'Q1'),
      sampleUpload('ic-students-q2.csv', 'Q2'),
      sampleUpload('ic-behavior-q2.csv', 'Q2'),
    ]
    results = analyze((await buildSnapshots(runner, files, infiniteCampus)).snapshots, T)
  })

  test('distributions agree with the flag counts', () => {
    const latest = results.summaries.at(-1)!
    const abs = absenceDistribution(results, T)!
    expect(abs.bins.filter((b) => b.flagged).reduce((n, b) => n + b.count, 0)).toBe(latest.flagged.attendance)
    const gpa = gpaDistribution(results, T)!
    // No course grades in the sample, so the academics flag is the GPA rule alone.
    expect(gpa.bins.filter((b) => b.flagged).reduce((n, b) => n + b.count, 0)).toBe(latest.flagged.academics)
  })

  test('overlap groups add up to the flagged students', () => {
    const latest = results.summaries.at(-1)!
    const o = overlap(results)
    expect(o.groups.reduce((n, g) => n + g.count, 0)).toBe(latest.tiers[2] + latest.tiers[3])
    expect(o.flagged).toBe(latest.tiers[2] + latest.tiers[3])
    const multi = o.groups.filter((g) => g.categories.length >= 2).reduce((n, g) => n + g.count, 0)
    expect(multi).toBe(latest.tiers[3])
    expect(o.strongest!.both).toBeLessThanOrEqual(o.strongest!.total)
  })

  test('start here is short, highest tier first', () => {
    const list = startHere(results, 5)
    expect(list).toHaveLength(5)
    expect(list.every((s) => s.latest.tier === 3)).toBe(true)
    const ups = list.map((s) => s.change === 'up')
    expect(ups.indexOf(false) === -1 || !ups.slice(ups.indexOf(false)).includes(true)).toBe(true)
  })

  test('hotspots are above the caseload rate', () => {
    const h = hotspots(results)
    expect(h.length).toBeGreaterThan(0)
    for (const x of h) expect(x.rate).toBeGreaterThan(x.caseloadRate)
  })
})

// Slipping detection, through the same analyze() the results page uses.
// Each case is two (or four) synthetic snapshots of a few students.

import { describe, expect, test } from 'vitest'
import { DEFAULT_THRESHOLDS as T, type Thresholds } from '../src/config/rules'
import { analyze, type StudentResult } from '../src/lib/compare/analyze'
import { closeToLine, slippingQuietly, withDirection } from '../src/lib/compare/insights'
import type { Direction } from '../src/lib/language'
import type { Snapshot, StudentRow } from '../src/lib/model'
import type { Category } from '../src/lib/sis/types'
import { studentRow } from './helpers/synthetic'

const ALL: Category[] = ['identity', 'attendanceSummary', 'gpa', 'behavior']

type Values = Partial<StudentRow>
const BASE: Values = { absencePct: 4, unweightedGPA: 3.2, incidents: 0 }

function snap(label: string, students: Record<string, Values>, categories = ALL): Snapshot {
  const map = new Map<string, StudentRow>()
  for (const [key, v] of Object.entries(students)) map.set(key, studentRow({ key, ...BASE, ...v }))
  return { label, categories, files: [], students: map }
}

/** One student across two snapshots, with default thresholds unless given. */
function one(before: Values, after: Values, t: Thresholds = T): StudentResult {
  return analyze([snap('Q1', { '9100001': before }), snap('Q2', { '9100001': after })], t).students[0]
}

const dir = (before: Values, after: Values, t?: Thresholds): Direction => one(before, after, t).movement!.direction

describe('absence', () => {
  test.each([
    [4, 7, 'slipping'],
    [4, 6.9, 'steady'],
    [4, 1, 'gaining'],
    [4, 1.1, 'steady'],
  ] as const)('%s%% to %s%% is %s', (a, b, want) => {
    expect(dir({ absencePct: a }, { absencePct: b })).toBe(want)
  })

  test('crossing the line is a new signal, and the reason says so', () => {
    const s = one({ absencePct: 8 }, { absencePct: 12 })
    expect(s.movement).toEqual({ direction: 'slipping', reasons: ['New attendance signal', 'Absent 8.0% in Q1, 12.0% in Q2'] })
  })

  test('fewer than 20 school days in either snapshot: attendance changes are ignored', () => {
    expect(dir({ absencePct: 0, scheduledDays: 19 }, { absencePct: 9, scheduledDays: 40 })).toBe('steady')
    expect(dir({ absencePct: 0, scheduledDays: 20 }, { absencePct: 9, scheduledDays: 40 })).toBe('slipping')
  })

  test('unknown day counts (district percentage only) are trusted', () => {
    expect(dir({ absencePct: 0, scheduledDays: null }, { absencePct: 9, scheduledDays: null })).toBe('slipping')
  })

  test('the day minimum is a setting', () => {
    expect(dir({ absencePct: 0, scheduledDays: 19 }, { absencePct: 9, scheduledDays: 40 }, { ...T, moveMinDays: 10 })).toBe('slipping')
  })
})

describe('GPA', () => {
  test.each([
    [3.1, 2.8, 'slipping'],
    [3.1, 2.81, 'steady'],
    [2.8, 3.1, 'gaining'],
    [3.33, 3.03, 'slipping'],
  ] as const)('%s to %s is %s', (a, b, want) => {
    expect(dir({ unweightedGPA: a }, { unweightedGPA: b })).toBe(want)
  })

  test('the amount is a setting', () => {
    expect(dir({ unweightedGPA: 3.1 }, { unweightedGPA: 2.8 }, { ...T, moveGpa: 0.5 })).toBe('steady')
  })

  test('falls back to cumulative GPA when unweighted is missing', () => {
    expect(dir({ unweightedGPA: null, cumGPA: 3.4 }, { unweightedGPA: null, cumGPA: 3.0 })).toBe('slipping')
  })
})

describe('behavior', () => {
  test('any new incident is slipping, and fewer is gaining ground', () => {
    expect(dir({ incidents: 0 }, { incidents: 1 })).toBe('slipping')
    expect(dir({ incidents: 2 }, { incidents: 1 })).toBe('gaining')
  })
})

describe('more than one change', () => {
  test('one area better and one worse is slipping', () => {
    expect(dir({ absencePct: 2, unweightedGPA: 2.6 }, { absencePct: 8, unweightedGPA: 3.4 })).toBe('slipping')
  })

  test('fewer signals than last time is finding footing', () => {
    expect(dir({ absencePct: 15, unweightedGPA: 1.5 }, { absencePct: 4, unweightedGPA: 1.5 })).toBe('finding')
  })

  test('one signal cleared and another gained is slipping', () => {
    const s = one({ absencePct: 15, unweightedGPA: 3 }, { absencePct: 4, unweightedGPA: 1.5 })
    expect(s.movement!.direction).toBe('slipping')
    expect(s.movement!.reasons).toContain('New academics signal')
  })

  // Current behavior, not asserted as right or wrong: finding footing is
  // checked first, so it wins over a large drop elsewhere. Listed in the PR
  // as a question for the support model.
  test('a cleared signal outranks a large GPA drop (current behavior)', () => {
    expect(dir({ absencePct: 15, unweightedGPA: 3.6 }, { absencePct: 4, unweightedGPA: 2.4 })).toBe('finding')
  })

  // Current behavior: "gaining ground" is any improvement of the set size,
  // even far from a line (the README says "moved away from a line").
  test('improving far from any line is gaining ground (current behavior)', () => {
    expect(dir({ unweightedGPA: 3.5 }, { unweightedGPA: 3.9 })).toBe('gaining')
  })
})

describe('what can be compared', () => {
  test('an area missing from the earlier snapshot is not compared', () => {
    const results = analyze(
      [snap('Q1', { a: { incidents: null } }, ['identity', 'attendanceSummary', 'gpa']), snap('Q2', { a: { incidents: 5 } })],
      T,
    )
    const s = results.students[0]
    expect(s.latest.flags.map((f) => f.category)).toEqual(['behavior'])
    expect(s.movement!.direction).toBe('steady')
    expect(results.transitions!.comparable).toEqual(['attendance', 'academics'])
  })

  test('a student new in the latest snapshot has no direction', () => {
    const results = analyze([snap('Q1', { a: {} }), snap('Q2', { a: {}, b: { absencePct: 9 } })], T)
    const b = results.students.find((s) => s.key === 'b')!
    expect(b.change).toBe('new')
    expect(b.movement).toBeNull()
    expect(slippingQuietly(results)).toEqual([])
  })

  test('with four snapshots, direction compares the last two only', () => {
    const results = analyze(
      [
        snap('Q1', { a: { absencePct: 0 } }),
        snap('Q2', { a: { absencePct: 6 } }),
        snap('Q3', { a: { absencePct: 7 } }),
        snap('Q4', { a: { absencePct: 7.5 } }),
      ],
      T,
    )
    expect(results.students[0].movement!.direction).toBe('steady')
    expect(results.students[0].history.map((h) => h!.absencePct)).toEqual([0, 6, 7, 7.5])
  })
})

describe('"Slipping, no signals yet"', () => {
  const results = analyze(
    [
      snap('Q1', {
        quiet1: { absencePct: 2 },
        quiet2: { absencePct: 2, unweightedGPA: 3.4 },
        flagged: { absencePct: 12 },
        newSignal: { absencePct: 8 },
        steady: {},
        better: { absencePct: 7 },
      }),
      snap('Q2', {
        quiet1: { absencePct: 6 },
        quiet2: { absencePct: 7, unweightedGPA: 3.0 },
        flagged: { absencePct: 18 },
        newSignal: { absencePct: 12 },
        steady: {},
        better: { absencePct: 3 },
      }),
    ],
    T,
  )

  test('lists slipping students with no signals, most reasons first', () => {
    expect(slippingQuietly(results).map((s) => s.key)).toEqual(['quiet2', 'quiet1'])
  })

  test('a student who slipped into a signal is slipping but not listed here', () => {
    expect(withDirection(results, 'slipping').map((s) => s.key).sort()).toEqual(['flagged', 'newSignal', 'quiet1', 'quiet2'])
    expect(slippingQuietly(results).some((s) => s.key === 'newSignal')).toBe(false)
  })

  test('every student in both snapshots has exactly one direction', () => {
    const dirs: Direction[] = ['slipping', 'finding', 'gaining', 'steady']
    const counts = dirs.map((d) => withDirection(results, d).length)
    expect(counts.reduce((a, b) => a + b, 0)).toBe(results.transitions!.inBoth)
  })
})

describe('"Close to a line", one snapshot', () => {
  const close = (v: Values, t: Thresholds = T) => analyze([snap('Q1', { a: v })], t).students[0].near

  test.each([
    [{ absencePct: 8 }, ['Absent 8.0%; the line is 10%']],
    [{ absencePct: 7.9 }, []],
    [{ absencePct: 10 }, []],
    [{ unweightedGPA: 2 }, ['GPA 2.00; the line is 2.00']],
    [{ unweightedGPA: 2.25 }, []],
    [{ incidents: 2 }, ['2 incidents; the line is 3']],
    [{ absencePct: 9, scheduledDays: 10 }, []],
  ] as [Values, string[]][])('%j', (v, want) => {
    expect(close(v)).toEqual(want)
  })

  test('a student with a signal is never close to a line', () => {
    expect(close({ absencePct: 9, unweightedGPA: 1.5 })).toEqual([])
  })

  test('with the behavior line at 1, nobody is one incident short', () => {
    expect(close({ incidents: 0 }, { ...T, behaviorIncidentsAtLeast: 1 })).toEqual([])
  })

  test('only one snapshot: no directions, and the list is students close to a line', () => {
    const results = analyze([snap('Q1', { a: { absencePct: 9 }, b: {} })], T)
    expect(results.transitions).toBeNull()
    expect(results.students.every((s) => s.movement === null)).toBe(true)
    expect(closeToLine(results).map((s) => s.key)).toEqual(['a'])
  })
})

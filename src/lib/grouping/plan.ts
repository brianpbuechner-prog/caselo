// Decide, without asking, how uploaded files become snapshots, and whether
// Caselo can go straight to results.
//
// Files labeled by their name (attendance_q2.csv) or by the person keep
// their label. Files without one are grouped by what they hold: a student
// file and a behavior file cover different data, so they are the same
// point in time and share a snapshot. Two files with the same kind of data
// are two points in time. When Caselo cannot tell which of those came
// first, it asks.

import { presentCategories, uncertainFields } from '../mapping/detect'
import type { UploadedFile } from '../model'
import type { Category, SisCatalog } from '../sis/types'

export interface SnapshotPlan {
  /** The files, relabeled and in snapshot order. */
  files: UploadedFile[]
  /** True when every column is certain and the order of snapshots is known. */
  ready: boolean
  /** Why Caselo needs the person, in plain words. Empty when ready. */
  reasons: string[]
  /** The first file to open on the review page, if any. */
  focus: string | null
}

const SEASONS = ['fall', 'winter', 'spring', 'summer']

/**
 * Where a label falls in a school year, for ordering, or null if unknown.
 * Q1 < Q2, S1 < S2, T1 < T2, Fall < Winter < Spring < Summer.
 */
export function labelRank(label: string): { family: string; rank: number } | null {
  const l = label.trim().toLowerCase()
  const m = l.match(/^(q|s|sem|t|tri)([1-4])$/)
  if (m) return { family: m[1] === 'sem' ? 's' : m[1] === 'tri' ? 't' : m[1], rank: Number(m[2]) }
  const season = SEASONS.indexOf(l)
  return season >= 0 ? { family: 'season', rank: season } : null
}

/** Sort labeled files into school-year order when every label has a known place. */
function sortByLabel(files: UploadedFile[]): UploadedFile[] {
  const ranks = files.map((f) => labelRank(f.label))
  if (ranks.some((r) => r == null)) return files
  if (new Set(ranks.map((r) => r!.family)).size > 1) return files
  return files
    .map((f, i) => ({ f, i, r: ranks[i]!.rank }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.f)
}

function dataCategories(f: UploadedFile, catalog: SisCatalog): Set<Category> {
  return new Set(presentCategories(f.mapping, catalog).filter((c) => c !== 'identity'))
}

function overlaps(a: Set<Category>, b: Set<Category>): boolean {
  return [...a].some((c) => b.has(c))
}

export function planSnapshots(input: UploadedFile[], catalog: SisCatalog): SnapshotPlan {
  const reasons: string[] = []
  let focus: string | null = null

  // Columns first: any file Caselo is unsure about goes to review.
  for (const f of input) {
    const unsure = uncertainFields(f.mapping)
    if (unsure.length) {
      const labels = unsure.map((k) => catalog.fields.find((x) => x.key === k)?.label ?? k)
      reasons.push(`${f.fileName}: not sure which column is ${labels.join(', ').toLowerCase()}.`)
      focus ??= f.id
    }
  }

  // Groups in order. Labeled files form their groups first.
  const named = sortByLabel(input.filter((f) => f.labelSource !== 'auto'))
  const groups: { label: string; named: boolean; cats: Set<Category>; files: UploadedFile[] }[] = []
  for (const f of named) {
    const label = f.label.trim()
    let g = groups.find((x) => x.label === label)
    if (!g) groups.push((g = { label, named: true, cats: new Set(), files: [] }))
    g.files.push(f)
    dataCategories(f, catalog).forEach((c) => g.cats.add(c))
  }

  // Unlabeled files join a group that doesn't already have their kind of
  // data. If more than one group could take a file, Caselo can't tell which.
  let ambiguous = false
  for (const f of input.filter((x) => x.labelSource === 'auto')) {
    const cats = dataCategories(f, catalog)
    const open = groups.filter((g) => !overlaps(g.cats, cats))
    let g = open.length === 1 ? open[0] : undefined
    if (open.length > 1) ambiguous = true
    if (!g) {
      g = open.at(-1)
      if (!g) groups.push((g = { label: '', named: false, cats: new Set(), files: [] }))
    }
    g.files.push(f)
    cats.forEach((c) => g.cats.add(c))
  }

  // Name the unlabeled groups.
  let n = 0
  for (const g of groups) {
    if (!g.label) {
      do n++
      while (groups.some((x) => x.label === `Snapshot ${n}`))
      g.label = `Snapshot ${n}`
    }
  }

  // More than one point in time, and one of them has no name: the order is a guess.
  if (groups.length > 1 && (ambiguous || groups.some((g) => !g.named))) {
    reasons.push('These files look like more than one point in time. Label each one and put them in order.')
  }

  const files = groups.flatMap((g) => g.files.map((f) => (f.label === g.label ? f : { ...f, label: g.label })))
  return { files, ready: reasons.length === 0, reasons, focus }
}

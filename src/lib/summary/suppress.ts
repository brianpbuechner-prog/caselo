// Small-cell suppression for the de-identified summary.
//
// Two rules:
//   1. Primary: any count under MIN_CELL (including 0) is shown as "<10".
//   2. Complementary: when a set of counts adds up to a total that is shown,
//      and exactly one of them is hidden, the hidden count could be worked
//      out by subtraction. The smallest count still shown in that set is
//      hidden too (shown as "*"). This repeats until nothing changes, since
//      hiding a cell in a row can expose one in a column.

export const MIN_CELL = 10

export type CellKind = 'shown' | 'small' | 'hidden'

/**
 * One published number. A cell can sit in more than one group (a row and a
 * column), so suppression changes the cell object itself. `count` and `rate`
 * are null unless the cell is shown.
 */
export interface Cell {
  kind: CellKind
  count: number | null
  /** 0 to 1, or null when there is no denominator or it is too small. */
  rate: number | null
}

export function primary(count: number, of: number | null = null): Cell {
  if (count < MIN_CELL) return { kind: 'small', count: null, rate: null }
  return { kind: 'shown', count, rate: of != null && of >= MIN_CELL ? count / of : null }
}

function hide(c: Cell): void {
  c.kind = 'hidden'
  c.count = null
  c.rate = null
}

/**
 * Apply complementary suppression. Each group lists cells whose counts add
 * up to a total the reader can see. Leave out groups whose total is not shown.
 */
export function complementary(groups: Cell[][]): void {
  let changed = true
  while (changed) {
    changed = false
    for (const cells of groups) {
      if (cells.filter((c) => c.kind !== 'shown').length !== 1) continue
      const shown = cells.filter((c) => c.kind === 'shown')
      if (!shown.length) continue
      hide(shown.reduce((a, b) => (b.count! < a.count! ? b : a)))
      changed = true
    }
  }
}

/** Plain text for a cell: "42", "<10", or "*". */
export function cellText(c: Cell): string {
  if (c.kind === 'small') return `<${MIN_CELL}`
  if (c.kind === 'hidden') return '*'
  return String(c.count)
}

export function rateText(c: Cell): string {
  return c.kind === 'shown' && c.rate != null ? `${Math.round(c.rate * 100)}%` : ''
}

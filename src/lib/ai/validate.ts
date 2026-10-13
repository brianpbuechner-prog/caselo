// Checks shared by the browser and the draft function (api/draft.ts).
//
// This file has no imports on purpose: the Vercel function loads it at
// runtime, so it must stand alone. tests/ai.test.ts checks that the
// constants below match the rest of the app.

/** Same as RULE_CATEGORIES in src/lib/rules/engine.ts. */
export const CATEGORIES = ['attendance', 'academics', 'behavior'] as const
/** Same as MIN_CELL in src/lib/summary/suppress.ts. */
export const MIN_SHOWN = 10
/** Largest request body the function accepts, in bytes. */
export const MAX_BODY_BYTES = 64 * 1024

const TIER_KEYS = ['1', '2', '3']
const CELL_KINDS = ['shown', 'small', 'hidden']

// Free-text fields are held to the shapes Caselo produces, so the function
// cannot be used to send anything but a summary.
const LABEL = /^[A-Za-z0-9 ._\-/()]{1,40}$/
const GRADE = /^[A-Za-z0-9 ._-]{1,12}$/
const NUM = String.raw`\d{1,3}(?:\.\d{1,2})?`
const RULE_TEXT: Record<string, RegExp> = {
  attendance: new RegExp(`^Chronic absence: missed ${NUM}% or more of scheduled days\\.$`),
  academics: new RegExp(
    `^Academics: (?:unweighted|cumulative) GPA below ${NUM}, or \\d{1,2} or more failing course grades? when course grades are in the file\\.$`,
  ),
  behavior: /^Behavior: \d{1,3} or more incidents\.$/,
}
const TIER_TEXT = /^Tier 1: (?:no flags|fewer than \d flags)\. Tier 2: \d or more flags?\. Tier 3: \d or more\.$/

export type Check = { ok: true } | { ok: false; error: string }

class Invalid extends Error {}

function fail(path: string, what: string): never {
  throw new Invalid(`${path}: ${what}`)
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function keys(v: unknown, path: string, required: string[], optional: string[] = []): Record<string, unknown> {
  if (!isObject(v)) fail(path, 'expected an object')
  for (const k of required) if (!(k in v)) fail(path, `missing "${k}"`)
  for (const k of Object.keys(v)) if (!required.includes(k) && !optional.includes(k)) fail(path, `unexpected "${k}"`)
  return v
}

function array(v: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(v)) fail(path, 'expected a list')
  if (v.length > max) fail(path, `more than ${max} items`)
  return v
}

function category(v: unknown, path: string): string {
  if (typeof v !== 'string' || !(CATEGORIES as readonly string[]).includes(v)) fail(path, 'unknown category')
  return v
}

function categoryList(v: unknown, path: string): string[] {
  const list = array(v, path, CATEGORIES.length).map((c, i) => category(c, `${path}[${i}]`))
  if (new Set(list).size !== list.length) fail(path, 'repeated category')
  return list
}

function cell(v: unknown, path: string): void {
  const c = keys(v, path, ['kind', 'count', 'rate'])
  if (typeof c.kind !== 'string' || !CELL_KINDS.includes(c.kind)) fail(path, 'unknown kind')
  if (c.kind === 'shown') {
    if (typeof c.count !== 'number' || !Number.isInteger(c.count) || c.count < MIN_SHOWN || c.count > 1_000_000) {
      fail(path, `a shown count must be a whole number of at least ${MIN_SHOWN}`)
    }
    if (c.rate !== null && (typeof c.rate !== 'number' || !Number.isFinite(c.rate) || c.rate < 0 || c.rate > 1)) {
      fail(path, 'rate must be between 0 and 1, or null')
    }
  } else if (c.count !== null || c.rate !== null) {
    fail(path, 'a small or hidden cell must have no count and no rate')
  }
}

function categoryCells(v: unknown, path: string, allowed: string[]): void {
  const o = keys(v, path, [], allowed)
  for (const [k, c] of Object.entries(o)) cell(c, `${path}.${k}`)
}

function tiers(v: unknown, path: string): void {
  const o = keys(v, path, TIER_KEYS)
  for (const k of TIER_KEYS) cell(o[k], `${path}.${k}`)
}

/**
 * Accept only a Caselo de-identified summary (format "caselo-summary",
 * version 1) with exactly the fields buildSummary writes. Anything else,
 * including extra fields or counts under 10, is rejected.
 */
export function checkSummary(value: unknown): Check {
  try {
    const s = keys(value, 'summary', [
      'format', 'version', 'label', 'students', 'rules', 'missingRules', 'ruleText', 'tierText',
      'tiers', 'flagged', 'pairs', 'change', 'byGrade',
    ])
    if (s.format !== 'caselo-summary') fail('summary.format', 'must be "caselo-summary"')
    if (s.version !== 1) fail('summary.version', 'must be 1')
    if (typeof s.label !== 'string' || !LABEL.test(s.label)) fail('summary.label', 'must be a short snapshot label')
    cell(s.students, 'summary.students')

    const rules = categoryList(s.rules, 'summary.rules')
    const missing = categoryList(s.missingRules, 'summary.missingRules')
    if (missing.some((c) => rules.includes(c))) fail('summary.missingRules', 'overlaps rules')

    const ruleText = array(s.ruleText, 'summary.ruleText', CATEGORIES.length)
    if (ruleText.length !== rules.length) fail('summary.ruleText', 'must have one line per rule')
    ruleText.forEach((t, i) => {
      if (typeof t !== 'string' || !RULE_TEXT[rules[i]].test(t)) fail(`summary.ruleText[${i}]`, 'not a Caselo rule description')
    })
    if (typeof s.tierText !== 'string' || !TIER_TEXT.test(s.tierText)) fail('summary.tierText', 'not a Caselo tier description')

    tiers(s.tiers, 'summary.tiers')
    categoryCells(s.flagged, 'summary.flagged', rules)

    array(s.pairs, 'summary.pairs', 3).forEach((p, i) => {
      const path = `summary.pairs[${i}]`
      const o = keys(p, path, ['categories', 'cell'])
      const cats = array(o.categories, `${path}.categories`, 2)
      if (cats.length !== 2) fail(`${path}.categories`, 'must have two categories')
      cats.forEach((c, j) => {
        if (!rules.includes(category(c, `${path}.categories[${j}]`))) fail(`${path}.categories[${j}]`, 'not a rule that ran')
      })
      cell(o.cell, `${path}.cell`)
    })

    if (s.change !== null) {
      const path = 'summary.change'
      const c = keys(s.change, path, [
        'from', 'inBoth', 'compared', 'notCompared', 'previous', 'latest', 'newlyFlagged', 'noLongerFlagged', 'tierUp', 'tierDown',
      ])
      if (typeof c.from !== 'string' || !LABEL.test(c.from)) fail(`${path}.from`, 'must be a short snapshot label')
      cell(c.inBoth, `${path}.inBoth`)
      const compared = categoryList(c.compared, `${path}.compared`)
      categoryList(c.notCompared, `${path}.notCompared`)
      for (const k of ['previous', 'latest', 'newlyFlagged', 'noLongerFlagged']) categoryCells(c[k], `${path}.${k}`, compared)
      cell(c.tierUp, `${path}.tierUp`)
      cell(c.tierDown, `${path}.tierDown`)
    }

    array(s.byGrade, 'summary.byGrade', 20).forEach((g, i) => {
      const path = `summary.byGrade[${i}]`
      const o = keys(g, path, ['grade', 'students', 'tiers', 'flagged'])
      if (typeof o.grade !== 'string' || !GRADE.test(o.grade)) fail(`${path}.grade`, 'must be a short grade label')
      cell(o.students, `${path}.students`)
      tiers(o.tiers, `${path}.tiers`)
      categoryCells(o.flagged, `${path}.flagged`, rules)
    })
    return { ok: true }
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, error: e.message }
    throw e
  }
}

// ---------------------------------------------------------------------------
// The draft the model returns.

export interface DraftGoal {
  /** One of the rule categories, or "overall" for a tier goal. */
  area: string
  /** The goal in ASCA annual student outcome goal form. */
  statement: string
  /** Where the baseline comes from in the summary, in plain words. */
  baseline: string
}

export interface DraftContent {
  narrative: string
  goals: DraftGoal[]
  caveats: string[]
}

/** JSON schema sent to the Messages API as the required output format. */
export const DRAFT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    narrative: { type: 'string', description: '150 to 250 words.' },
    goals: {
      type: 'array',
      description: '2 or 3 goals.',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          area: { type: 'string', enum: [...CATEGORIES, 'overall'] },
          statement: { type: 'string' },
          baseline: { type: 'string' },
        },
        required: ['area', 'statement', 'baseline'],
        additionalProperties: false,
      },
    },
    caveats: { type: 'array', items: { type: 'string' } },
  },
  required: ['narrative', 'goals', 'caveats'],
  additionalProperties: false,
} as const

const MAX_TEXT = 4000

function text(v: unknown, path: string): string {
  if (typeof v !== 'string' || !v.trim()) fail(path, 'expected text')
  if (v.length > MAX_TEXT) fail(path, 'too long')
  return v
}

/** Check the shape of a draft (from the model, or from the function's reply). */
export function parseDraftContent(value: unknown): { ok: true; draft: DraftContent } | { ok: false; error: string } {
  try {
    const d = keys(value, 'draft', ['narrative', 'goals', 'caveats'])
    const goals = array(d.goals, 'draft.goals', 3).map((g, i) => {
      const o = keys(g, `draft.goals[${i}]`, ['area', 'statement', 'baseline'])
      return { area: text(o.area, `draft.goals[${i}].area`), statement: text(o.statement, `draft.goals[${i}].statement`), baseline: text(o.baseline, `draft.goals[${i}].baseline`) }
    })
    if (goals.length < 2) fail('draft.goals', 'expected 2 or 3 goals')
    const caveats = array(d.caveats, 'draft.caveats', 8).map((c, i) => text(c, `draft.caveats[${i}]`))
    return { ok: true, draft: { narrative: text(d.narrative, 'draft.narrative'), goals, caveats } }
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, error: e.message }
    throw e
  }
}

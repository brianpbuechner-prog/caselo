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
 * including extra fields or counts under 10, is rejected. Returns null when
 * the summary passes, or a short reason when it does not.
 */
export function checkSummary(value: unknown): string | null {
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
    return null
  } catch (e) {
    if (e instanceof Invalid) return e.message
    throw e
  }
}

// ---------------------------------------------------------------------------
// The draft the model returns: short insight cards by role.

export const ROLE_KEYS = ['counselor', 'administrator', 'teachers', 'supportTeam'] as const
export type RoleKey = (typeof ROLE_KEYS)[number]
export const READ_KINDS = ['question', 'likely', 'none'] as const
export type ReadKind = (typeof READ_KINDS)[number]

export interface KeyNumber {
  /** A number from the summary, as written ("23%", "31"). */
  value: string
  /** What it counts, a few words ("chronically absent, up from 21%"). */
  label: string
}

export interface Insight {
  /** The one number the card is about, as written in the summary. */
  number: string
  /** What the number counts, a few words. */
  label: string
  /** Why it matters, one short sentence. */
  point: string
  /** "question": worth asking. "likely": what the pattern shows. "none": no read. */
  readKind: ReadKind
  /** The read itself, or "" when readKind is "none". */
  read: string
  /** One specific action. */
  do: string
  /** One thing to ease off, or "". */
  doLess: string
}

export interface Connection {
  /** The roles that share this number. */
  roles: RoleKey[]
  number: string
  label: string
  /** What the shared number means for them together. */
  point: string
  /** Who does what, one line per role. */
  steps: { role: RoleKey; step: string }[]
}

export interface DraftGoal {
  /** One of the rule categories, or "overall" for a tier goal. */
  area: string
  /** The goal in ASCA annual student outcome goal form. */
  statement: string
  /** Where the baseline comes from in the summary, in plain words. */
  baseline: string
}

export interface DraftContent {
  headline: string
  keyNumbers: KeyNumber[]
  bigPicture: Insight[]
  roles: Record<RoleKey, Insight[]>
  connections: Connection[]
  goals: DraftGoal[]
  /** One or two sentences on what the summary cannot show. */
  limits: string
}

const str = { type: 'string' } as const
const INSIGHT_SCHEMA = {
  type: 'object',
  properties: {
    number: str,
    label: str,
    point: str,
    readKind: { type: 'string', enum: [...READ_KINDS] },
    read: str,
    do: str,
    doLess: str,
  },
  required: ['number', 'label', 'point', 'readKind', 'read', 'do', 'doLess'],
  additionalProperties: false,
} as const
const insights = (description: string) => ({ type: 'array', description, minItems: 1, items: INSIGHT_SCHEMA }) as const
const roleEnum = { type: 'string', enum: [...ROLE_KEYS] } as const

/** JSON schema sent to the Messages API as the required output format. */
export const DRAFT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    headline: str,
    keyNumbers: {
      type: 'array',
      description: '3 or 4 key numbers.',
      minItems: 1,
      items: { type: 'object', properties: { value: str, label: str }, required: ['value', 'label'], additionalProperties: false },
    },
    bigPicture: insights('2 or 3 cards.'),
    roles: {
      type: 'object',
      properties: {
        counselor: insights('2 cards.'),
        administrator: insights('2 cards.'),
        teachers: insights('2 cards.'),
        supportTeam: insights('2 cards.'),
      },
      required: [...ROLE_KEYS],
      additionalProperties: false,
    },
    connections: {
      type: 'array',
      description: '2 or 3 cards.',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          roles: { type: 'array', minItems: 1, items: roleEnum },
          number: str,
          label: str,
          point: str,
          steps: {
            type: 'array',
            minItems: 1,
            items: { type: 'object', properties: { role: roleEnum, step: str }, required: ['role', 'step'], additionalProperties: false },
          },
        },
        required: ['roles', 'number', 'label', 'point', 'steps'],
        additionalProperties: false,
      },
    },
    goals: {
      type: 'array',
      description: '2 or 3 goals.',
      minItems: 1,
      items: {
        type: 'object',
        properties: { area: { type: 'string', enum: [...CATEGORIES, 'overall'] }, statement: str, baseline: str },
        required: ['area', 'statement', 'baseline'],
        additionalProperties: false,
      },
    },
    limits: str,
  },
  required: ['headline', 'keyNumbers', 'bigPicture', 'roles', 'connections', 'goals', 'limits'],
  additionalProperties: false,
} as const

const MAX_TEXT = 600

function text(v: unknown, path: string, allowEmpty = false): string {
  if (typeof v !== 'string' || (!allowEmpty && !v.trim())) fail(path, 'expected text')
  if (v.length > MAX_TEXT) fail(path, 'too long')
  return v
}

function oneOf<T extends string>(v: unknown, path: string, options: readonly T[]): T {
  if (typeof v !== 'string' || !(options as readonly string[]).includes(v)) fail(path, 'unexpected value')
  return v as T
}

function count(list: unknown[], path: string, min: number, max: number): void {
  if (list.length < min || list.length > max) fail(path, `expected ${min} to ${max} items`)
}

function insight(v: unknown, path: string): Insight {
  const o = keys(v, path, ['number', 'label', 'point', 'readKind', 'read', 'do', 'doLess'])
  const readKind = oneOf(o.readKind, `${path}.readKind`, READ_KINDS)
  const read = text(o.read, `${path}.read`, true)
  if (readKind !== 'none' && !read.trim()) fail(`${path}.read`, 'missing read')
  return {
    number: text(o.number, `${path}.number`),
    label: text(o.label, `${path}.label`),
    point: text(o.point, `${path}.point`),
    readKind,
    read: readKind === 'none' ? '' : read,
    do: text(o.do, `${path}.do`),
    doLess: text(o.doLess, `${path}.doLess`, true),
  }
}

function insightList(v: unknown, path: string, min: number, max: number): Insight[] {
  const list = array(v, path, max)
  count(list, path, min, max)
  return list.map((x, i) => insight(x, `${path}[${i}]`))
}

/**
 * Check the shape of a draft (from the model, or from the function's reply).
 * Returns the draft, or a short reason as a string when the shape is wrong.
 */
export function parseDraftContent(value: unknown): DraftContent | string {
  try {
    const d = keys(value, 'draft', ['headline', 'keyNumbers', 'bigPicture', 'roles', 'connections', 'goals', 'limits'])
    const keyNumbers = array(d.keyNumbers, 'draft.keyNumbers', 4)
    count(keyNumbers, 'draft.keyNumbers', 2, 4)
    const r = keys(d.roles, 'draft.roles', [...ROLE_KEYS])
    const roles = Object.fromEntries(ROLE_KEYS.map((k) => [k, insightList(r[k], `draft.roles.${k}`, 1, 3)])) as Record<RoleKey, Insight[]>
    const connections = array(d.connections, 'draft.connections', 3)
    count(connections, 'draft.connections', 1, 3)
    const goals = array(d.goals, 'draft.goals', 3)
    count(goals, 'draft.goals', 2, 3)
    return {
      headline: text(d.headline, 'draft.headline'),
      keyNumbers: keyNumbers.map((k, i) => {
        const o = keys(k, `draft.keyNumbers[${i}]`, ['value', 'label'])
        return { value: text(o.value, `draft.keyNumbers[${i}].value`), label: text(o.label, `draft.keyNumbers[${i}].label`) }
      }),
      bigPicture: insightList(d.bigPicture, 'draft.bigPicture', 1, 3),
      roles,
      connections: connections.map((c, i) => {
        const path = `draft.connections[${i}]`
        const o = keys(c, path, ['roles', 'number', 'label', 'point', 'steps'])
        const steps = array(o.steps, `${path}.steps`, 4)
        count(steps, `${path}.steps`, 1, 4)
        return {
          roles: array(o.roles, `${path}.roles`, 4).map((x, j) => oneOf(x, `${path}.roles[${j}]`, ROLE_KEYS)),
          number: text(o.number, `${path}.number`),
          label: text(o.label, `${path}.label`),
          point: text(o.point, `${path}.point`),
          steps: steps.map((st, j) => {
            const so = keys(st, `${path}.steps[${j}]`, ['role', 'step'])
            return { role: oneOf(so.role, `${path}.steps[${j}].role`, ROLE_KEYS), step: text(so.step, `${path}.steps[${j}].step`) }
          }),
        }
      }),
      goals: goals.map((g, i) => {
        const o = keys(g, `draft.goals[${i}]`, ['area', 'statement', 'baseline'])
        return { area: text(o.area, `draft.goals[${i}].area`), statement: text(o.statement, `draft.goals[${i}].statement`), baseline: text(o.baseline, `draft.goals[${i}].baseline`) }
      }),
      limits: text(d.limits, 'draft.limits'),
    }
  } catch (e) {
    if (e instanceof Invalid) return e.message
    throw e
  }
}

// Records real model drafts on the sample data, through the same function
// the site uses. Skipped unless RECORD_DRAFT=1. Calls the API (costs a few
// cents, an estimate) and needs a key:
//
//   RECORD_DRAFT=1 ANTHROPIC_API_KEY=... npx vitest run tests/ai-record.test.ts
//   RECORD_DRAFT=1 ANTHROPIC_API_KEY=... DRAFT_MODEL=claude-haiku-5-5 npx vitest run tests/ai-record.test.ts
//
// Each draft is saved to tests/fixtures/draft-<sample>-<model>.json, and
// tests/ai-draft.test.ts then checks it against the prompt rules.

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { DEFAULT_MODEL, handleDraft } from '../api/draft'
import { FIXTURES, promptRuleProblems, summaryFixture, type SampleName } from './helpers/draft'

describe.skipIf(!process.env.RECORD_DRAFT)('record model drafts', () => {
  test.each(['q2', 'q1'] as SampleName[])('%s', async (name) => {
    const payload = readFileSync(summaryFixture(name), 'utf8')
    const request = new Request('https://caselo.org/api/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload })
    const res = await handleDraft(request, { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, DRAFT_MODEL: process.env.DRAFT_MODEL })
    const body = await res.json()
    expect(res.status, JSON.stringify(body)).toBe(200)
    const model = process.env.DRAFT_MODEL || DEFAULT_MODEL
    writeFileSync(join(FIXTURES, `draft-${name}-${model}.json`), JSON.stringify(body, null, 2) + '\n')
    console.log(`${name} (${body.model}) problems:`, promptRuleProblems(body.draft, payload))
  }, 120_000)
})

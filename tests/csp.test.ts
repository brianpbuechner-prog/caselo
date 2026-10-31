// The Content Security Policy stops the page from connecting to any other
// site. It is set twice: as a header in vercel.json, and as a meta tag the
// build adds to the page (vite.config.ts), so it holds wherever Caselo is
// hosted. Both must keep connect-src 'self' and agree with each other.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { HtmlTagDescriptor, Plugin } from 'vite'
import { describe, expect, test } from 'vitest'
import viteConfig from '../vite.config'

const ROOT = join(__dirname, '..')

type Policy = Map<string, string[]>

function parse(csp: string): Policy {
  const out: Policy = new Map()
  for (const part of csp.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/)
    if (!name) continue
    expect(out.has(name), `directive ${name} appears twice`).toBe(false)
    out.set(name.toLowerCase(), values)
  }
  return out
}

function headerPolicy(): Policy {
  const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')) as {
    headers: { source: string; headers: { key: string; value: string }[] }[]
    rewrites?: unknown
    redirects?: unknown
  }
  const rules = vercel.headers.filter((h) => h.headers.some((x) => x.key.toLowerCase() === 'content-security-policy'))
  expect(rules).toHaveLength(1)
  expect(rules[0].source).toBe('/(.*)')
  return parse(rules[0].headers.find((x) => x.key.toLowerCase() === 'content-security-policy')!.value)
}

function metaPolicy(): Policy {
  const plugins = (viteConfig.plugins ?? []).flat(2) as unknown as Plugin[]
  const csp = plugins.find((p) => p && p.name === 'caselo-csp')
  expect(csp, 'the caselo-csp plugin is in vite.config.ts').toBeDefined()
  expect(csp!.apply).toBe('build')
  const hook = csp!.transformIndexHtml as unknown as () => HtmlTagDescriptor[]
  const tags = hook()
  const meta = tags.find((t) => t.tag === 'meta' && t.attrs?.['http-equiv'] === 'Content-Security-Policy')
  expect(meta).toBeDefined()
  expect(meta!.injectTo).toBe('head-prepend')
  return parse(String(meta!.attrs!.content))
}

describe.each([
  ['vercel.json header', headerPolicy],
  ['meta tag in the built page', metaPolicy],
])('%s', (_name, policy) => {
  test("connect-src is exactly 'self'", () => {
    expect(policy().get('connect-src')).toEqual(["'self'"])
  })

  test("default-src is 'self' and no directive allows another site", () => {
    const p = policy()
    expect(p.get('default-src')).toEqual(["'self'"])
    // Only keywords, plus data: images and blob: workers, which stay in the page.
    const allowed = new Set(["'self'", "'none'", "'unsafe-inline'", "'wasm-unsafe-eval'", 'data:', 'blob:'])
    for (const [name, values] of p) {
      for (const v of values) expect(allowed.has(v), `${name} ${v}`).toBe(true)
    }
    expect(p.get('img-src')).toEqual(["'self'", 'data:'])
    expect(p.get('worker-src')).toEqual(["'self'", 'blob:'])
  })

  test('scripts run only from this site, and forms cannot post anywhere', () => {
    const p = policy()
    expect(p.get('script-src')).toEqual(["'self'", "'wasm-unsafe-eval'"])
    expect(p.get('form-action')).toEqual(["'none'"])
    expect(p.get('object-src')).toEqual(["'none'"])
    expect(p.get('base-uri')).toEqual(["'self'"])
  })
})

test('the header and the meta tag agree (frame-ancestors only works as a header)', () => {
  const header = headerPolicy()
  const meta = metaPolicy()
  expect(header.get('frame-ancestors')).toEqual(["'none'"])
  header.delete('frame-ancestors')
  expect(Object.fromEntries(meta)).toEqual(Object.fromEntries(header))
})

test('vercel.json sends no requests elsewhere', () => {
  const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'))
  expect(vercel.rewrites ?? []).toEqual([])
  expect(vercel.redirects ?? []).toEqual([])
  const headers = Object.fromEntries((vercel.headers[0].headers as { key: string; value: string }[]).map((h) => [h.key, h.value]))
  expect(headers['Referrer-Policy']).toBe('no-referrer')
})

test('index.html loads nothing from another site and sets no other policy', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
  expect(html).not.toMatch(/(src|href)="(https?:)?\/\//)
  expect(html).not.toMatch(/http-equiv="Content-Security-Policy"/i)
})

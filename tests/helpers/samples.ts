import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildUpload } from '../../src/lib/files/read'
import { infiniteCampus } from '../../src/lib/sis/infinite-campus/fields'

export const SAMPLE_DIR = join(__dirname, '..', '..', 'public', 'sample-data')

export function sampleText(name: string): string {
  return readFileSync(join(SAMPLE_DIR, name), 'utf8')
}

export function sampleUpload(name: string, label: string) {
  return buildUpload(name, sampleText(name), infiniteCampus, label)
}

/** Simple independent parser for the synthetic files (no quoted values). */
export function parseSimple(name: string, delimiter = ','): Record<string, string>[] {
  const [head, ...lines] = sampleText(name).split(/\r?\n/).filter((l) => l.trim())
  const headers = head.split(delimiter)
  return lines.map((l) => {
    const cells = l.split(delimiter)
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']))
  })
}

import { Fragment, useRef, useState } from 'react'
import { downloadText } from '../lib/export/csv'
import { splitLine } from '../lib/files/delimiter'
import type { ColumnMapping, MatchMethod } from '../lib/mapping/detect'
import { applyMappingJson, mappingToJson } from '../lib/mapping/json'
import type { UploadedFile } from '../lib/model'
import { CATEGORY_LABELS, type Category, type SisCatalog } from '../lib/sis/types'

const METHOD_TEXT: Record<MatchMethod, string> = {
  default: 'Default name',
  fuzzy: 'Close match, check',
  manual: 'Set by you',
  none: 'Not found',
}

/** First non-empty value in each column, to help confirm a match. */
function examples(file: UploadedFile): string[] {
  const lines = file.text.split('\n').slice(1, 30)
  const out: string[] = new Array(file.headers.length).fill('')
  for (const line of lines) {
    if (!line.trim()) continue
    const cells = splitLine(line.replace(/\r$/, ''), file.delimiter)
    cells.forEach((c, i) => {
      if (i < out.length && !out[i] && c.trim()) out[i] = c.trim()
    })
  }
  return out
}

export function MappingEditor({
  file,
  catalog,
  onChange,
}: {
  file: UploadedFile
  catalog: SisCatalog
  onChange: (mapping: ColumnMapping) => void
}) {
  const jsonInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string | null>(null)
  const ex = examples(file)
  const [showAll, setShowAll] = useState(false)
  const allCategories = Object.keys(CATEGORY_LABELS) as Category[]
  // Only show categories with at least one matched column, plus identity.
  const found = allCategories.filter(
    (c) => c === 'identity' || catalog.fields.some((f) => f.category === c && file.mapping[f.key]?.index != null),
  )
  const hidden = allCategories.length - found.length
  const categories = showAll ? allCategories : found

  function setField(key: string, value: string) {
    const index = value === '' ? null : Number(value)
    const next: ColumnMapping = { ...file.mapping }
    if (index != null) {
      // A column can only fill one field.
      for (const k of Object.keys(next)) {
        if (next[k].index === index) next[k] = { index: null, method: 'none', score: 0 }
      }
    }
    next[key] = index == null ? { index: null, method: 'none', score: 0 } : { index, method: 'manual', score: 1 }
    onChange(next)
  }

  async function loadJson(f: File) {
    try {
      const json = JSON.parse(await f.text())
      const { mapping, applied, missing } = applyMappingJson(json, file.headers, file.mapping, catalog)
      onChange(mapping)
      setMessage(
        `Applied ${applied} ${applied === 1 ? 'match' : 'matches'}.` +
          (missing.length ? ` Not in this file: ${missing.join(', ')}.` : ''),
      )
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not read that file.')
    }
  }

  return (
    <div className="mapping">
      <div className="file-row" style={{ marginBottom: 8 }}>
        <span className="small muted">Check that each field points to the right column. Changes apply right away.</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button
            className="btn sm"
            onClick={() =>
              downloadText(
                'caselo-column-mapping.json',
                JSON.stringify(mappingToJson(file.mapping, file.headers, catalog), null, 2),
                'application/json',
              )
            }
          >
            Download mapping
          </button>
          <button className="btn sm" onClick={() => jsonInput.current?.click()}>
            Load mapping
          </button>
          <input
            ref={jsonInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) loadJson(f)
              e.target.value = ''
            }}
          />
        </span>
      </div>
      {message && <p className="small muted" role="status" style={{ marginBottom: 8 }}>{message}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Column in file</th>
              <th>Example</th>
              <th>Match</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => renderCategory(cat))}
          </tbody>
        </table>
      </div>
      {hidden > 0 && (
        <button className="link" style={{ marginTop: 8 }} onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Hide categories not in this file' : `Show ${hidden} more ${hidden === 1 ? 'category' : 'categories'} not found in this file`}
        </button>
      )}
    </div>
  )

  function renderCategory(cat: Category) {
    const fields = catalog.fields.filter((f) => f.category === cat)
    return (
      <Fragment key={cat}>
        <tr className="cat-head">
          <td colSpan={4}>{CATEGORY_LABELS[cat]}</td>
        </tr>
        {fields.map((f) => {
          const m = file.mapping[f.key]
          return (
            <tr key={f.key}>
              <td>
                {f.label}{' '}
                {f.unverified && (
                  <span className="tag look" title="This default column name has not been checked against a real export.">
                    Name unverified
                  </span>
                )}
                <div className="small muted">{f.defaultHeaders[0]}</div>
              </td>
              <td>
                <select
                  aria-label={`Column for ${f.label}`}
                  value={m.index == null ? '' : String(m.index)}
                  onChange={(e) => setField(f.key, e.target.value)}
                >
                  <option value="">Not in this file</option>
                  {file.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </select>
              </td>
              <td className="small muted">{m.index == null ? '' : ex[m.index]}</td>
              <td>
                <span className={`tag${m.method === 'fuzzy' ? ' look' : ''}`}>
                  {METHOD_TEXT[m.method]}
                </span>
              </td>
            </tr>
          )
        })}
      </Fragment>
    )
  }
}

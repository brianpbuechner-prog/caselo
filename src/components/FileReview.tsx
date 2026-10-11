import { useState } from 'react'
import { DELIMITERS, delimiterLabel, type Delimiter } from '../lib/files/delimiter'
import { withDelimiter } from '../lib/files/read'
import { labelOrder } from '../lib/grouping/snapshots'
import { presentCategories, studentKeyField } from '../lib/mapping/detect'
import type { UploadedFile } from '../lib/model'
import { CATEGORY_LABELS, type Category, type SisCatalog } from '../lib/sis/types'
import { DropZone, MAX_FILES, PrivacyStatement, Spinner } from './common'
import { MappingEditor } from './MappingEditor'

const RULE_DATA: Category[] = ['attendanceSummary', 'gpa', 'behavior', 'attendanceDetail', 'courseGrades']

export function fileProblems(f: UploadedFile, catalog: SisCatalog): string[] {
  const problems: string[] = []
  const cats = presentCategories(f.mapping, catalog)
  if (!f.label.trim()) problems.push('Add a label.')
  if (f.headers.length < 2) problems.push('Only one column was found. Check the delimiter.')
  else if (!studentKeyField(f.mapping, catalog)) problems.push('No student number or state ID column is matched.')
  if (f.headers.length >= 2 && !cats.some((c) => RULE_DATA.includes(c))) {
    problems.push('No attendance, GPA, behavior, or course grade columns are matched.')
  }
  return problems
}

export function FileReview({
  files,
  catalog,
  onChange,
  onAddFiles,
  onAnalyze,
  onCancel,
  busy,
  error,
}: {
  files: UploadedFile[]
  catalog: SisCatalog
  onChange: (files: UploadedFile[]) => void
  onAddFiles: (files: File[]) => void
  onAnalyze: () => void
  onCancel: () => void
  busy: string | null
  error: string | null
}) {
  const [open, setOpen] = useState<string | null>(null)
  const labels = labelOrder(files)
  const allOk = files.length > 0 && files.every((f) => fileProblems(f, catalog).length === 0)

  const update = (id: string, patch: Partial<UploadedFile>) => onChange(files.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  const move = (i: number, dir: -1 | 1) => {
    const next = [...files]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <div className="section">
        <div className="section-head">
          <h2>Check your files</h2>
          <span className="small muted">
            Give each file a label. Files with the same label are combined into one snapshot. Snapshots are compared in
            the order shown{labels.length > 1 ? `: ${labels.join(', then ')}` : ''}.
          </span>
        </div>
        <div className="files">
          {files.map((f, i) => {
            const cats = presentCategories(f.mapping, catalog).filter((c) => c !== 'identity')
            const problems = fileProblems(f, catalog)
            const isOpen = open === f.id
            return (
              <div key={f.id} className="card file-card">
                <div className="file-row">
                  <span className="file-name">{f.fileName}</span>
                  <span className="small muted">
                    {f.headers.length} columns, {delimiterLabel(f.delimiter).toLowerCase()} delimited
                  </span>
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                    <button className="btn ghost sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" title="Move up">
                      ↑
                    </button>
                    <button className="btn ghost sm" onClick={() => move(i, 1)} disabled={i === files.length - 1} aria-label="Move down" title="Move down">
                      ↓
                    </button>
                    <button className="btn ghost sm" onClick={() => onChange(files.filter((x) => x.id !== f.id))}>
                      Remove
                    </button>
                  </span>
                </div>
                <div className="file-row">
                  <label className="field">
                    Label
                    <input
                      type="text"
                      value={f.label}
                      placeholder="For example, Q1"
                      maxLength={24}
                      onChange={(e) => update(f.id, { label: e.target.value })}
                      style={{ width: 140 }}
                    />
                  </label>
                  <label className="field">
                    Delimiter
                    <select
                      value={f.delimiter}
                      onChange={(e) => onChange(files.map((x) => (x.id === f.id ? withDelimiter(x, e.target.value as Delimiter, catalog) : x)))}
                    >
                      {DELIMITERS.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="field">
                    Data found
                    <div className="chips" style={{ minHeight: 36, alignItems: 'center' }}>
                      {cats.length ? cats.map((c) => <span key={c} className="tag">{CATEGORY_LABELS[c]}</span>) : <span className="tag">None yet</span>}
                    </div>
                  </div>
                  <button className="btn sm" style={{ marginLeft: 'auto', alignSelf: 'end' }} onClick={() => setOpen(isOpen ? null : f.id)} aria-expanded={isOpen}>
                    {isOpen ? 'Hide columns' : 'Check columns'}
                  </button>
                </div>
                {problems.length > 0 && (
                  <ul className="reasons error">
                    {problems.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                )}
                {isOpen && <MappingEditor file={f} catalog={catalog} onChange={(mapping) => update(f.id, { mapping })} />}
              </div>
            )
          })}
        </div>
      </div>

      {files.length < MAX_FILES && (
        <div className="section">
          <DropZone
            compact
            onFiles={onAddFiles}
            disabled={Boolean(busy)}
            label={
              <span className="small">
                <strong style={{ display: 'inline', fontSize: 14 }}>Add another file</strong>{' '}
                <span className="muted">({MAX_FILES - files.length} more allowed)</span>
              </span>
            }
          />
        </div>
      )}

      <div className="section file-row">
        {busy ? (
          <Spinner text={busy} />
        ) : (
          <>
            <button className="btn primary" disabled={!allOk} onClick={onAnalyze}>
              Show results
            </button>
            <button className="btn ghost" onClick={onCancel}>
              Start over
            </button>
          </>
        )}
      </div>
      {error && (
        <p className="error section" role="alert">
          {error}
        </p>
      )}
      <div className="section">
        <PrivacyStatement />
      </div>
    </div>
  )
}

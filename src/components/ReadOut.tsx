// "How Caselo read your files": a read-only page showing which column
// became which field, so a counselor can check Caselo's work without
// having been asked to do anything first.

import { isConfident, presentCategories, type FieldMatch } from '../lib/mapping/detect'
import { labelOrder } from '../lib/grouping/snapshots'
import type { UploadedFile } from '../lib/model'
import { CATEGORY_LABELS, type SisCatalog } from '../lib/sis/types'
import { PrivacyStatement } from './common'

function how(m: FieldMatch): string {
  if (m.method === 'manual') return 'Set by you'
  if (m.method === 'default') return 'Standard column name'
  if (m.method === 'values') return isConfident(m) ? 'Similar name, and the values fit' : 'Guessed from the values'
  return 'Similar name'
}

export function ReadOut({
  files,
  catalog,
  onBack,
  onChange,
}: {
  files: UploadedFile[]
  catalog: SisCatalog
  onBack: () => void
  onChange: () => void
}) {
  const labels = labelOrder(files)
  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <div className="section">
        <div className="section-head">
          <h2>How Caselo read your files</h2>
          <span className="small muted">
            {labels.length > 1
              ? `${labels.length} snapshots, compared in this order: ${labels.join(', then ')}.`
              : `One snapshot${files.length > 1 ? `, from ${files.length} files combined by student ID` : ''}.`}
          </span>
        </div>
        <div className="file-row" style={{ gap: 8 }}>
          <button className="btn sm" onClick={onBack}>
            Back to results
          </button>
          <button className="btn ghost sm" onClick={onChange}>
            Change
          </button>
        </div>
      </div>

      {labels.map((label) => (
        <div key={label} className="section">
          {labels.length > 1 && <h3>{label}</h3>}
          <div className="files">
            {files
              .filter((f) => f.label.trim() === label)
              .map((f) => {
                const cats = presentCategories(f.mapping, catalog).filter((c) => c !== 'identity')
                const used = new Set(Object.values(f.mapping).map((m) => m.index))
                const unused = f.headers.filter((h, i) => !used.has(i) && h.trim())
                const matched = catalog.fields.filter((x) => f.mapping[x.key]?.index != null)
                return (
                  <div key={f.id} className="card file-card">
                    <div className="file-row">
                      <span className="file-name">{f.fileName}</span>
                      <div className="chips">
                        {cats.map((c) => (
                          <span key={c} className="tag">
                            {CATEGORY_LABELS[c]}
                          </span>
                        ))}
                      </div>
                    </div>
                    <table>
                      <thead>
                        <tr>
                          <th>Caselo field</th>
                          <th>Your column</th>
                          <th>How</th>
                        </tr>
                      </thead>
                      <tbody>
                        {matched.map((x) => {
                          const m = f.mapping[x.key]
                          return (
                            <tr key={x.key}>
                              <td>{x.label}</td>
                              <td>{f.headers[m.index!]}</td>
                              <td className="small muted">{how(m)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    {unused.length > 0 && <p className="small muted">Not used: {unused.join(', ')}</p>}
                  </div>
                )
              })}
          </div>
        </div>
      ))}

      <div className="section">
        <PrivacyStatement />
      </div>
    </div>
  )
}

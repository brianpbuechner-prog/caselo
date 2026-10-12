import { useState } from 'react'
import { DropZone, PrivacyStatement, Spinner } from './common'

export function Landing({
  onFiles,
  onPaste,
  onSample,
  busy,
  error,
}: {
  onFiles: (files: File[]) => void
  /** Returns true when the text was accepted, so the box can be cleared. */
  onPaste: (text: string, label: string) => boolean
  onSample: () => void
  busy: string | null
  error: string | null
}) {
  const [pasting, setPasting] = useState(false)
  const [text, setText] = useState('')
  const [label, setLabel] = useState('')

  const submit = () => {
    if (onPaste(text, label)) {
      setText('')
      setLabel('')
    }
  }

  return (
    <div className="landing-main">
      <h1 className="wordmark">Caselo</h1>
      <p className="tagline">Upload a student information system export to see which students may need support, and why.</p>
      {pasting ? (
        <div className="paste">
          <label className="field">
            Paste the export, including the header row
            {/* spellCheck off: some browsers send text to an online spelling service. */}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'student.studentNumber,student.lastName,student.grade,...\n123456,Dahl,9,...'}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              disabled={Boolean(busy)}
            />
          </label>
          <div className="paste-actions">
            <label className="field">
              Label
              <input
                type="text"
                value={label}
                placeholder="For example, Q1"
                maxLength={24}
                onChange={(e) => setLabel(e.target.value)}
                style={{ width: 140 }}
                disabled={Boolean(busy)}
              />
            </label>
            <button className="btn primary" onClick={submit} disabled={Boolean(busy) || !text.trim()}>
              Read pasted text
            </button>
            <button className="link" style={{ marginLeft: 'auto', alignSelf: 'center' }} onClick={() => setPasting(false)}>
              Choose a file instead
            </button>
          </div>
        </div>
      ) : (
        <>
          <DropZone onFiles={onFiles} disabled={Boolean(busy)} />
          <button className="link" onClick={() => setPasting(true)} disabled={Boolean(busy)}>
            Paste instead
          </button>
        </>
      )}
      <PrivacyStatement />
      {busy ? (
        <Spinner text={busy} />
      ) : (
        <button className="btn" onClick={onSample}>
          Try with sample data
        </button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

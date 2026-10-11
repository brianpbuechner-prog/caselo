import { DropZone, PrivacyStatement, Spinner } from './common'

export function Landing({
  onFiles,
  onSample,
  busy,
  error,
}: {
  onFiles: (files: File[]) => void
  onSample: () => void
  busy: string | null
  error: string | null
}) {
  return (
    <div className="landing-main">
      <h1 className="wordmark">Caselo</h1>
      <p className="tagline">Upload a student information system export to see which students may need support, and why.</p>
      <DropZone onFiles={onFiles} disabled={Boolean(busy)} />
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

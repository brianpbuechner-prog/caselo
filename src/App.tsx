// Caselo app shell. All student data lives in React state (memory) and in
// the in-memory DuckDB worker. Nothing is persisted. "Clear data" and
// refreshing the tab both discard it.

import { useCallback, useEffect, useState } from 'react'
import { About, Footer, MAX_FILES } from './components/common'
import { FileReview, fileProblems } from './components/FileReview'
import { Landing } from './components/Landing'
import { ResultsView } from './components/results/ResultsView'
import type { Thresholds } from './config/rules'
import { browserRunner, shutdown, warmUp } from './lib/db/browser'
import { loadSamples, readFile } from './lib/files/read'
import { buildSnapshots } from './lib/grouping/snapshots'
import type { Snapshot, UploadedFile } from './lib/model'
import { loadPreferences, savePreferences, type Preferences } from './lib/preferences'
import { DEFAULT_CATALOG } from './lib/sis/registry'

type Stage = 'landing' | 'review' | 'results'

const catalog = DEFAULT_CATALOG

export default function App() {
  const [stage, setStage] = useState<Stage>('landing')
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [analysis, setAnalysis] = useState<{ snapshots: Snapshot[]; warnings: string[] } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [about, setAbout] = useState(false)
  const [prefs, setPrefs] = useState<Preferences>(() => loadPreferences())

  useEffect(() => savePreferences(prefs), [prefs])

  const addFiles = useCallback(
    async (chosen: File[]) => {
      setError(null)
      const room = MAX_FILES - files.length
      if (chosen.length > room) {
        setError(`Caselo reads up to ${MAX_FILES} files at a time. ${room === 0 ? 'Remove a file first.' : `Choose ${room} or fewer.`}`)
        return
      }
      warmUp()
      setBusy('Reading files')
      const added: UploadedFile[] = []
      const problems: string[] = []
      for (const [i, f] of chosen.entries()) {
        try {
          added.push(await readFile(f, catalog, `Snapshot ${files.length + i + 1}`))
        } catch (e) {
          problems.push(e instanceof Error ? e.message : `${f.name}: could not be read.`)
        }
      }
      setBusy(null)
      if (problems.length) setError(problems.join(' '))
      if (added.length) {
        setFiles((cur) => [...cur, ...added])
        setStage('review')
      }
    },
    [files.length],
  )

  const run = useCallback(async (list: UploadedFile[]) => {
    setError(null)
    setBusy('Analyzing in your browser')
    try {
      const result = await buildSnapshots(browserRunner, list, catalog)
      setAnalysis(result)
      setStage('results')
      window.scrollTo(0, 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong reading these files.')
      setStage('review')
    } finally {
      setBusy(null)
    }
  }, [])

  const trySample = useCallback(async () => {
    setError(null)
    setBusy('Loading sample data')
    warmUp()
    try {
      const samples = await loadSamples(catalog)
      setFiles(samples)
      await run(samples)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the sample data.')
      setBusy(null)
    }
  }, [run])

  const clear = useCallback(() => {
    setFiles([])
    setAnalysis(null)
    setError(null)
    setStage('landing')
    void shutdown()
  }, [])

  const setThresholds = (t: Thresholds) => setPrefs((p) => ({ ...p, thresholds: t }))

  return (
    <div className={stage === 'landing' ? 'landing' : undefined}>
      {stage === 'landing' && <Landing onFiles={addFiles} onSample={trySample} busy={busy} error={error} />}
      {stage === 'review' && (
        <>
          <header className="topbar">
            <div className="topbar-inner">
              <button className="brand" onClick={() => setAbout(true)} title="About Caselo">
                Caselo
              </button>
            </div>
          </header>
          <FileReview
            files={files}
            catalog={catalog}
            onChange={(next) => {
              setFiles(next)
              if (next.length === 0) clear()
            }}
            onAddFiles={addFiles}
            onAnalyze={() => files.every((f) => fileProblems(f, catalog).length === 0) && run(files)}
            onCancel={clear}
            busy={busy}
            error={error}
          />
        </>
      )}
      {stage === 'results' && analysis && (
        <ResultsView
          snapshots={analysis.snapshots}
          warnings={analysis.warnings}
          thresholds={prefs.thresholds}
          onThresholds={setThresholds}
          role={prefs.role}
          onRole={(role) => setPrefs((p) => ({ ...p, role }))}
          compact={prefs.layout.density === 'compact'}
          onCompact={(v) => setPrefs((p) => ({ ...p, layout: { density: v ? 'compact' : 'comfortable' } }))}
          onFiles={() => setStage('review')}
          onClear={clear}
          onAbout={() => setAbout(true)}
        />
      )}
      <Footer onAbout={() => setAbout(true)} />
      {about && <About onClose={() => setAbout(false)} />}
    </div>
  )
}

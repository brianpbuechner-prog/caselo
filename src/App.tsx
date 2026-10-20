// Caselo app shell. All student data lives in React state (memory) and in
// the in-memory DuckDB worker. Nothing is persisted. "Clear data" and
// refreshing the tab both discard it.

import { useCallback, useEffect, useState } from 'react'
import { About, Footer, MAX_FILES } from './components/common'
import { FileReview, fileProblems } from './components/FileReview'
import { Landing } from './components/Landing'
import { ReadOut } from './components/ReadOut'
import { ResultsView } from './components/results/ResultsView'
import type { Thresholds } from './config/rules'
import type { DraftState } from './lib/ai/types'
import { browserRunner, shutdown, warmUp } from './lib/db/browser'
import { loadSamples, readFile, readPasted } from './lib/files/read'
import { planSnapshots } from './lib/grouping/plan'
import { buildSnapshots } from './lib/grouping/snapshots'
import type { Snapshot, UploadedFile } from './lib/model'
import { loadPreferences, savePreferences, type Preferences } from './lib/preferences'
import { DEFAULT_CATALOG } from './lib/sis/registry'

type Stage = 'landing' | 'review' | 'results' | 'readout'

const catalog = DEFAULT_CATALOG

export default function App() {
  const [stage, setStage] = useState<Stage>('landing')
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [analysis, setAnalysis] = useState<{ snapshots: Snapshot[]; warnings: string[] } | null>(null)
  // The AI draft, if one was requested. Memory only; Clear data discards it.
  const [draft, setDraft] = useState<DraftState | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [about, setAbout] = useState(false)
  // Why Caselo stopped to ask, and which file to open first.
  const [review, setReview] = useState<{ notice: string[]; focus: string | null }>({ notice: [], focus: null })
  const [prefs, setPrefs] = useState<Preferences>(() => loadPreferences())

  useEffect(() => savePreferences(prefs), [prefs])

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

  /**
   * First upload: go straight to results when Caselo is sure how to read
   * every file. Otherwise open the review page on what needs a look.
   */
  const start = useCallback(
    (list: UploadedFile[]) => {
      const plan = planSnapshots(list, catalog)
      const problems = plan.files.flatMap((f) => fileProblems(f, catalog).map((p) => `${f.fileName}: ${p}`))
      setFiles(plan.files)
      if (plan.ready && problems.length === 0) {
        setReview({ notice: [], focus: null })
        void run(plan.files)
      } else {
        setReview({ notice: [...plan.reasons, ...problems], focus: plan.focus ?? plan.files[0]?.id ?? null })
        setStage('review')
      }
    },
    [run],
  )

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
      if (!added.length) return
      if (files.length === 0 && !problems.length) start(added)
      else {
        setFiles((cur) => [...cur, ...added])
        setStage('review')
      }
    },
    [files.length, start],
  )

  const addPasted = useCallback(
    (text: string, label: string): boolean => {
      setError(null)
      if (files.length >= MAX_FILES) {
        setError(`Caselo reads up to ${MAX_FILES} files at a time. Remove a file first.`)
        return false
      }
      const pastes = files.filter((f) => f.fileName.startsWith('Pasted text')).length
      try {
        const name = pastes ? `Pasted text ${pastes + 1}` : 'Pasted text'
        const upload = readPasted(text, catalog, label, name, `Snapshot ${files.length + 1}`)
        warmUp()
        if (files.length === 0) start([upload])
        else {
          setFiles((cur) => [...cur, upload])
          setStage('review')
        }
        return true
      } catch (e) {
        setError(e instanceof Error ? e.message : 'The pasted text could not be read.')
        return false
      }
    },
    [files, start],
  )


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
    setDraft(null)
    setError(null)
    setStage('landing')
    void shutdown()
  }, [])

  const setThresholds = (t: Thresholds) => setPrefs((p) => ({ ...p, thresholds: t }))

  return (
    <div className={stage === 'landing' ? 'landing' : undefined}>
      {stage === 'landing' && <Landing onFiles={addFiles} onPaste={addPasted} onSample={trySample} busy={busy} error={error} />}
      {stage === 'review' && (
        <>
          <header className="topbar">
            <div className="topbar-inner" style={{ maxWidth: 900 }}>
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
            notice={review.notice}
            focus={review.focus}
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
          onFiles={() => {
            setReview({ notice: [], focus: null })
            setStage('review')
          }}
          onReadout={() => {
            setStage('readout')
            window.scrollTo(0, 0)
          }}
          fileCount={files.length}
          onClear={clear}
          onAbout={() => setAbout(true)}
          draft={draft}
          onDraft={setDraft}
        />
      )}
      {stage === 'readout' && (
        <>
          <header className="topbar">
            <div className="topbar-inner" style={{ maxWidth: 900 }}>
              <button className="brand" onClick={() => setAbout(true)} title="About Caselo">
                Caselo
              </button>
            </div>
          </header>
          <ReadOut
            files={files}
            catalog={catalog}
            onBack={() => setStage('results')}
            onChange={() => {
              setReview({ notice: [], focus: null })
              setStage('review')
            }}
          />
        </>
      )}
      <Footer onAbout={() => setAbout(true)} />
      {about && <About onClose={() => setAbout(false)} />}
    </div>
  )
}

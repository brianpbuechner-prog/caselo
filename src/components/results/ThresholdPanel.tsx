import { DEFAULT_THRESHOLDS, ruleDescriptions, type Thresholds } from '../../config/rules'
import { Modal } from '../common'

function NumberSetting({
  label,
  value,
  step,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string
  value: number
  step: number
  min: number
  max: number
  suffix?: string
  onChange: (n: number) => void
}) {
  return (
    <label className="setting">
      <span>{label}</span>
      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          type="number"
          value={value}
          step={step}
          min={min}
          max={max}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (e.target.value !== '' && Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)))
          }}
        />
        {suffix && <span className="muted small">{suffix}</span>}
      </span>
    </label>
  )
}

export function ThresholdPanel({
  thresholds,
  onChange,
  onClose,
  attendanceCodes,
  hasCourseGrades,
  compact,
  onCompact,
}: {
  thresholds: Thresholds
  onChange: (t: Thresholds) => void
  onClose: () => void
  /** Attendance detail codes found in the files, if any. */
  attendanceCodes: string[]
  hasCourseGrades: boolean
  compact: boolean
  onCompact: (v: boolean) => void
}) {
  const t = thresholds
  const set = (patch: Partial<Thresholds>) => onChange({ ...t, ...patch })
  const rules = ruleDescriptions(t)
  return (
    <Modal kind="drawer" onClose={onClose} title="Rules">
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <h2>Rules</h2>
        <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={onClose}>
          Close
        </button>
      </div>
      <p className="small muted">
        Results update as you change these. Settings are saved in this browser and contain no student data.
      </p>

      <fieldset>
        <legend>Attendance</legend>
        <p className="rule-text">{rules.attendance}</p>
        <NumberSetting label="Chronic absence at" value={t.chronicAbsencePct} step={0.5} min={1} max={100} suffix="% or more" onChange={(n) => set({ chronicAbsencePct: n })} />
        {attendanceCodes.length > 0 && (
          <div className="setting" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
            <span>Attendance detail codes that count as absent</span>
            <span className="small muted">None selected means every attendance detail row counts.</span>
            <div className="chips">
              {attendanceCodes.map((code) => {
                const on = t.absenceCodes.includes(code)
                return (
                  <button
                    key={code}
                    className={`chip${on ? ' on' : ''}`}
                    aria-pressed={on}
                    onClick={() => set({ absenceCodes: on ? t.absenceCodes.filter((c) => c !== code) : [...t.absenceCodes, code] })}
                  >
                    {code}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend>Academics</legend>
        <p className="rule-text">{rules.academics}</p>
        <NumberSetting label="GPA below" value={t.gpaBelow} step={0.1} min={0} max={5} onChange={(n) => set({ gpaBelow: n })} />
        <label className="setting">
          <span>GPA to check</span>
          <select value={t.gpaSource} onChange={(e) => set({ gpaSource: e.target.value as Thresholds['gpaSource'] })}>
            <option value="unweighted">Unweighted, then cumulative</option>
            <option value="cumulative">Cumulative, then unweighted</option>
          </select>
        </label>
        {hasCourseGrades && (
          <>
            <NumberSetting label="Failing grades" value={t.failingGradesAtLeast} step={1} min={1} max={20} suffix="or more" onChange={(n) => set({ failingGradesAtLeast: n })} />
            <label className="setting">
              <span>Grades that count as failing</span>
              <input
                type="text"
                value={t.failingMarks.join(', ')}
                onChange={(e) => set({ failingMarks: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                style={{ width: 150 }}
              />
            </label>
            <NumberSetting label="Numeric grades below" value={t.failingNumericBelow} step={1} min={0} max={100} onChange={(n) => set({ failingNumericBelow: n })} />
            <p className="small muted">Course grade column names are a best guess until checked against a real export.</p>
          </>
        )}
      </fieldset>

      <fieldset>
        <legend>Behavior</legend>
        <p className="rule-text">{rules.behavior}</p>
        <NumberSetting label="Incidents" value={t.behaviorIncidentsAtLeast} step={1} min={1} max={50} suffix="or more" onChange={(n) => set({ behaviorIncidentsAtLeast: n })} />
      </fieldset>

      <fieldset>
        <legend>Support levels</legend>
        <p className="rule-text">{rules.tiers} A student gets at most one signal per area. Tier numbers are the MTSS equivalents, and the CSV export includes them.</p>
        <NumberSetting label="Worth a check-in at" value={t.tier2MinFlags} step={1} min={1} max={3} suffix="signals or more" onChange={(n) => set({ tier2MinFlags: n, tier3MinFlags: Math.max(n, t.tier3MinFlags) })} />
        <NumberSetting label="Needs support now at" value={t.tier3MinFlags} step={1} min={1} max={3} suffix="signals or more" onChange={(n) => set({ tier3MinFlags: n, tier2MinFlags: Math.min(n, t.tier2MinFlags) })} />
      </fieldset>

      <fieldset>
        <legend>Direction</legend>
        <p className="rule-text">{rules.movement}</p>
        <NumberSetting label="Absence change" value={t.moveAbsencePoints} step={0.5} min={0.5} max={20} suffix="points or more" onChange={(n) => set({ moveAbsencePoints: n })} />
        <NumberSetting label="GPA change" value={t.moveGpa} step={0.05} min={0.05} max={2} suffix="or more" onChange={(n) => set({ moveGpa: n })} />
        <NumberSetting label="Count attendance after" value={t.moveMinDays} step={1} min={0} max={180} suffix="school days" onChange={(n) => set({ moveMinDays: n })} />
        <NumberSetting label="Close to attendance line" value={t.nearAbsencePoints} step={0.5} min={0} max={10} suffix="points" onChange={(n) => set({ nearAbsencePoints: n })} />
        <NumberSetting label="Close to GPA line" value={t.nearGpa} step={0.05} min={0} max={1} onChange={(n) => set({ nearGpa: n })} />
      </fieldset>

      <fieldset>
        <legend>Display</legend>
        <label className="setting">
          <span>Compact student list</span>
          <input type="checkbox" checked={compact} onChange={(e) => onCompact(e.target.checked)} />
        </label>
      </fieldset>

      <div>
        <button className="btn" onClick={() => onChange(DEFAULT_THRESHOLDS)}>
          Reset to defaults
        </button>
      </div>
    </Modal>
  )
}

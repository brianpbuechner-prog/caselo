// The AI draft as insight cards: a headline and key numbers, then tabs for
// the big picture, each school role, how the roles connect, and goals.
// Every card leads with its number. Numbers that are not in the summary that
// was sent are marked where they appear. Cards can be edited in place.

import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { ROLE_LABELS } from '../../lib/ai/describe'
import { checkNumbers, type AllowedNumbers } from '../../lib/ai/numbers'
import { ROLE_KEYS, type Connection, type DraftContent, type DraftGoal, type Insight, type RoleKey } from '../../lib/ai/validate'

export type DraftTab = 'big' | RoleKey | 'connect' | 'goals'

export const TABS: { id: DraftTab; label: string }[] = [
  { id: 'big', label: 'Big picture' },
  ...ROLE_KEYS.map((r) => ({ id: r, label: ROLE_LABELS[r] })),
  { id: 'connect', label: 'How it connects' },
  { id: 'goals', label: 'Goals' },
]

/** Text with any number that is not in the summary marked. */
function T({ text, allowed }: { text: string; allowed: AllowedNumbers }) {
  const misses = checkNumbers(text, allowed)
  if (!misses.length) return <>{text}</>
  const out: ReactNode[] = []
  let at = 0
  misses.forEach((m, i) => {
    out.push(text.slice(at, m.index))
    out.push(
      <mark key={i} className="num-miss" title="Not in the summary that was sent">
        {m.text}
      </mark>,
    )
    at = m.index + m.text.length
  })
  out.push(text.slice(at))
  return <>{out}</>
}

/** Placeholders like [date] shown as blanks to fill in. */
function Blanks({ text, allowed }: { text: string; allowed: AllowedNumbers }) {
  const parts = text.split(/(\[[^\]]+\])/)
  return (
    <>
      {parts.map((p, i) =>
        /^\[.+\]$/.test(p) ? (
          <span key={i} className="blank">
            {p.slice(1, -1)}
          </span>
        ) : (
          <Fragment key={i}>
            <T text={p} allowed={allowed} />
          </Fragment>
        ),
      )}
    </>
  )
}

function hasMiss(strings: string[], allowed: AllowedNumbers): boolean {
  return strings.some((s) => checkNumbers(s, allowed).length > 0)
}

function Field({ label, value, onChange, rows = 2 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <label className="edit-field">
      <span className="small muted">{label}</span>
      <textarea value={value} rows={rows} spellCheck={false} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

const READ_LABEL = { question: 'Worth asking', likely: 'Likely', none: '' } as const

function InsightCard({ card, allowed, editable, onChange }: { card: Insight; allowed: AllowedNumbers; editable: boolean; onChange: (c: Insight) => void }) {
  const [editing, setEditing] = useState(false)
  const miss = hasMiss([card.number, card.label, card.point, card.read, card.do, card.doLess], allowed)
  const set = (k: keyof Insight) => (v: string) => onChange({ ...card, [k]: v })
  return (
    <article className={`insight${miss ? ' has-miss' : ''}`}>
      <div className="insight-num num">
        <T text={card.number} allowed={allowed} />
      </div>
      <div className="insight-body">
        {editing ? (
          <div className="edit-grid">
            <Field label="Number" value={card.number} onChange={set('number')} rows={1} />
            <Field label="What it counts" value={card.label} onChange={set('label')} rows={1} />
            <Field label="Why it matters" value={card.point} onChange={set('point')} />
            {card.readKind !== 'none' && <Field label={READ_LABEL[card.readKind]} value={card.read} onChange={set('read')} />}
            <Field label="Do" value={card.do} onChange={set('do')} />
            <Field label="Do less" value={card.doLess} onChange={set('doLess')} />
          </div>
        ) : (
          <>
            <p className="insight-label">
              <T text={card.label} allowed={allowed} />
            </p>
            <p className="insight-point">
              <T text={card.point} allowed={allowed} />
            </p>
            {card.readKind !== 'none' && card.read && (
              <p className={`insight-read ${card.readKind}`}>
                <span className="read-kind">{READ_LABEL[card.readKind]}</span> <T text={card.read} allowed={allowed} />
              </p>
            )}
            <dl className="insight-actions">
              <div>
                <dt>Do</dt>
                <dd>
                  <T text={card.do} allowed={allowed} />
                </dd>
              </div>
              {card.doLess && (
                <div>
                  <dt>Do less</dt>
                  <dd>
                    <T text={card.doLess} allowed={allowed} />
                  </dd>
                </div>
              )}
            </dl>
          </>
        )}
        {editable && (
          <button className="link no-print" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Done' : 'Edit'}
          </button>
        )}
      </div>
    </article>
  )
}

function ConnectionCard({ c, allowed, editable, onChange }: { c: Connection; allowed: AllowedNumbers; editable: boolean; onChange: (c: Connection) => void }) {
  const [editing, setEditing] = useState(false)
  const miss = hasMiss([c.number, c.label, c.point, ...c.steps.map((s) => s.step)], allowed)
  return (
    <article className={`insight connection${miss ? ' has-miss' : ''}`}>
      <div className="insight-num num">
        <T text={c.number} allowed={allowed} />
      </div>
      <div className="insight-body">
        <p className="insight-label">
          <T text={c.label} allowed={allowed} />
        </p>
        {editing ? (
          <div className="edit-grid">
            <Field label="What it means together" value={c.point} onChange={(v) => onChange({ ...c, point: v })} />
            {c.steps.map((s, i) => (
              <Field
                key={i}
                label={ROLE_LABELS[s.role]}
                value={s.step}
                onChange={(v) => onChange({ ...c, steps: c.steps.map((x, j) => (j === i ? { ...x, step: v } : x)) })}
              />
            ))}
          </div>
        ) : (
          <>
            <p className="insight-point">
              <T text={c.point} allowed={allowed} />
            </p>
            <dl className="steps">
              {c.steps.map((s, i) => (
                <div key={i}>
                  <dt>{ROLE_LABELS[s.role]}</dt>
                  <dd>
                    <T text={s.step} allowed={allowed} />
                  </dd>
                </div>
              ))}
            </dl>
          </>
        )}
        {editable && (
          <button className="link no-print" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Done' : 'Edit'}
          </button>
        )}
      </div>
    </article>
  )
}

function GoalCard({ g, allowed, editable, onChange }: { g: DraftGoal; allowed: AllowedNumbers; editable: boolean; onChange: (g: DraftGoal) => void }) {
  const [editing, setEditing] = useState(false)
  return (
    <article className={`goal${hasMiss([g.statement, g.baseline], allowed) ? ' has-miss' : ''}`}>
      {editing ? (
        <div className="edit-grid">
          <Field label="Goal" value={g.statement} onChange={(v) => onChange({ ...g, statement: v })} rows={3} />
          <Field label="Baseline from" value={g.baseline} onChange={(v) => onChange({ ...g, baseline: v })} rows={1} />
        </div>
      ) : (
        <>
          <p className="goal-statement">
            <Blanks text={g.statement} allowed={allowed} />
          </p>
          <p className="small muted">
            Baseline: <T text={g.baseline} allowed={allowed} />
          </p>
        </>
      )}
      {editable && (
        <button className="link no-print" onClick={() => setEditing((v) => !v)}>
          {editing ? 'Done' : 'Edit'}
        </button>
      )}
    </article>
  )
}

export function Section({
  tab,
  content,
  allowed,
  editable,
  onChange,
}: {
  tab: DraftTab
  content: DraftContent
  allowed: AllowedNumbers
  editable: boolean
  onChange: (c: DraftContent) => void
}) {
  const cards = (list: Insight[], put: (next: Insight[]) => DraftContent) =>
    list.map((card, i) => (
      <InsightCard key={i} card={card} allowed={allowed} editable={editable} onChange={(c) => onChange(put(list.map((x, j) => (j === i ? c : x))))} />
    ))
  if (tab === 'big') return <div className="insights">{cards(content.bigPicture, (next) => ({ ...content, bigPicture: next }))}</div>
  if (tab === 'connect') {
    return (
      <div className="insights">
        {content.connections.map((c, i) => (
          <ConnectionCard
            key={i}
            c={c}
            allowed={allowed}
            editable={editable}
            onChange={(n) => onChange({ ...content, connections: content.connections.map((x, j) => (j === i ? n : x)) })}
          />
        ))}
      </div>
    )
  }
  if (tab === 'goals') {
    return (
      <div className="goals">
        {content.goals.map((g, i) => (
          <GoalCard key={i} g={g} allowed={allowed} editable={editable} onChange={(n) => onChange({ ...content, goals: content.goals.map((x, j) => (j === i ? n : x)) })} />
        ))}
        <p className="small muted">Dates and targets are left for you to set.</p>
      </div>
    )
  }
  const role = tab
  return <div className="insights">{cards(content.roles[role], (next) => ({ ...content, roles: { ...content.roles, [role]: next } }))}</div>
}

/** Headline and key numbers, shown above the tabs. */
export function DraftTop({ content, allowed }: { content: DraftContent; allowed: AllowedNumbers }) {
  return (
    <div className="draft-top">
      <p className="draft-headline">
        <T text={content.headline} allowed={allowed} />
      </p>
      <dl className="key-numbers num">
        {content.keyNumbers.map((k, i) => (
          <div key={i}>
            <dt>
              <T text={k.value} allowed={allowed} />
            </dt>
            <dd>
              <T text={k.label} allowed={allowed} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export function DraftTabs({
  content,
  allowed,
  onChange,
  initial = 'big',
}: {
  content: DraftContent
  allowed: AllowedNumbers
  onChange: (c: DraftContent) => void
  initial?: DraftTab
}) {
  const [tab, setTab] = useState<DraftTab>(initial)
  const missByTab = useMemo(() => {
    const out = new Set<DraftTab>()
    const ins = (l: Insight[]) => l.flatMap((c) => [c.number, c.label, c.point, c.read, c.do, c.doLess])
    if (hasMiss(ins(content.bigPicture), allowed)) out.add('big')
    for (const r of ROLE_KEYS) if (hasMiss(ins(content.roles[r]), allowed)) out.add(r)
    if (hasMiss(content.connections.flatMap((c) => [c.number, c.label, c.point, ...c.steps.map((s) => s.step)]), allowed)) out.add('connect')
    if (hasMiss(content.goals.flatMap((g) => [g.statement, g.baseline]), allowed)) out.add('goals')
    return out
  }, [content, allowed])
  return (
    <div className="draft-tabs">
      <div className="tablist" role="tablist" aria-label="AI draft sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="draft-panel"
            className={`tab${tab === t.id ? ' on' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {missByTab.has(t.id) && <span className="tab-miss" title="Has a number not in the summary" aria-label="has a number to check" />}
          </button>
        ))}
      </div>
      <div id="draft-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        <Section key={tab} tab={tab} content={content} allowed={allowed} editable onChange={onChange} />
      </div>
    </div>
  )
}

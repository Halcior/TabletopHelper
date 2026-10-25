import { useEffect, useRef, useState } from 'react'
import type { BattleSession } from '../../domain/battle/types'
import { CommandDialog } from '../../components/ui/CommandDialog'
import { useBattleStore } from '../../stores/battleStore'
import { useSharedSessionStore } from '../../multiplayer/sharedSessionStore'
import { clockCopy } from './copy'
import { clockWarning, formatClock, timeStatistics, type ClockCommand } from './model'
import { ClockStatistics } from './ClockStatistics'
import './battleClock.css'

const HELP_KEY = 'tabletophelper:battle-clock-help:v2'
const COLLAPSE_KEY = 'tabletophelper:battle-clock-collapsed'
function stored(key: string): boolean { try { return localStorage.getItem(key) === '1' } catch { return false } }
function remember(key: string, value: boolean) { try { localStorage.setItem(key, value ? '1' : '0') } catch { /* UI preferences are optional. */ } }

export function BattleClock({ session }: { session: BattleSession }) {
  const c = clockCopy()
  const shared = useSharedSessionStore()
  const isShared = shared.membership?.battleId === session.setup.gameId
  const clock = session.battleClock
  const enabled = session.setup.battleClock?.preset && session.setup.battleClock.preset !== 'off'
  const [collapsed, setCollapsed] = useState(() => stored(COLLAPSE_KEY))
  const [help, setHelp] = useState(false)
  const [targetId, setTargetId] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [now, setNow] = useState(Date.now())
  const enabledRef = Boolean(enabled || clock)
  useEffect(() => { if (enabledRef && !stored(HELP_KEY)) setHelp(true) }, [enabledRef])
  // Rendering only: elapsed time is always derived from a durable anchor. In
  // multiplayer use a server sample + monotonic elapsed time, never device wall time.
  useEffect(() => {
    if (!enabledRef) return
    const update = () => setNow(isShared && shared.clockAnchor
      ? shared.clockAnchor.serverNow + performance.now() - shared.clockAnchor.monotonicAt : Date.now())
    update()
    const timer = setInterval(update, 250)
    const wake = () => { update(); if (isShared) void useSharedSessionStore.getState().forceSync() }
    document.addEventListener('visibilitychange', wake)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', wake) }
  }, [isShared, enabledRef, shared.clockAnchor])

  const stale = isShared && (shared.connectionStatus !== 'connected' || !shared.clockAnchor || performance.now() - shared.clockAnchor.monotonicAt > 5000)
  const canControl = Boolean(clock && clock.endedAt === null && !stale && !busy && !help)
  const targets = clock?.budgets.filter(b => b.id !== clock.activeBudgetId) ?? []
  const target = targets.length === 1 ? targets[0]?.id : targetId
  async function send(command: ClockCommand) {
    if (!canControl || busyRef.current) return
    busyRef.current = true; setBusy(true); setError('')
    try {
      if (isShared) {
        const applied = await useSharedSessionStore.getState().clockCommand(command)
        if (!applied) setError(c.conflict)
      } else useBattleStore.getState().clockCommand(command)
    } catch (err) { setError(err instanceof Error ? err.message : c.error) }
    finally { busyRef.current = false; setBusy(false) }
  }
  function pass() {
    if (!target || !targets.some(b => b.id === target)) {
      document.getElementById('battle-clock-recipient')?.focus()
      return
    }
    void send({ type:'pass', targetId:target })
    setTargetId('')
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const element = event.target as HTMLElement | null
      if (event.code !== 'Space' || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || !canControl
        || document.querySelector('[role="dialog"], [role="menu"], .secondary-draw-reveal')
        || element?.closest('input,textarea,select,button,a,[role="button"],[contenteditable]:not([contenteditable="false"])')) return
      event.preventDefault(); pass()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  if (!enabled && !clock) return null
  const rows = timeStatistics(clock, now)
  const active = rows.find(row => row.id === clock?.activeBudgetId)
  function closeHelp() { remember(HELP_KEY, true); setHelp(false) }
  const warningText = { normal:'', quarter:c.warning15, five:c.warning5, one:c.warning1, expired:c.expired }
  return <aside className={`battle-clock${collapsed ? ' is-collapsed' : ''}`} aria-label="Battle Clock" lang="pl" data-testid="battle-clock">
    <header className="battle-clock__heading"><div><span className="eyebrow">{c.title} · {c.round} {clock?.round ?? session.state.round}</span><small>{clock?.endedAt ? c.finished : clock?.running ? c.running : c.paused}</small></div>
      {collapsed && active && <strong className={`battle-clock__mini clock-warning--${clockWarning(active.remainingMs)}`}>{active.name} <time>{formatClock(active.remainingMs)}</time></strong>}
      <button type="button" aria-expanded={!collapsed} aria-label={collapsed ? c.expand : c.collapse} onClick={() => { remember(COLLAPSE_KEY, !collapsed); setCollapsed(!collapsed) }}>{collapsed ? '＋' : '−'}</button>
    </header>
    {!clock ? <p role="status">{c.syncing}</p> : <>
      {!collapsed && <div className="battle-clock__budgets">{rows.map(row => <div key={row.id} data-budget-id={row.id} className={`battle-clock__budget clock-warning--${clockWarning(row.remainingMs)}${row.id === clock.activeBudgetId ? ' is-active' : ''}`} aria-current={row.id === clock.activeBudgetId ? 'true' : undefined}>
        <span>{row.name}</span><time>{formatClock(row.remainingMs)}</time><small>{row.overtimeMs > 0 ? `+${formatClock(row.overtimeMs)} · ${c.expired}` : warningText[clockWarning(row.remainingMs)] || (row.id === clock.activeBudgetId ? clock.running ? c.running : c.paused : c.left)}</small>
      </div>)}</div>}
      <div className="battle-clock__controls">
        {targets.length > 1 && <label className="battle-clock__target">{c.target}<select id="battle-clock-recipient" value={targets.some(b => b.id === targetId) ? targetId : ''} disabled={!canControl} onChange={e => setTargetId(e.target.value)}><option value="">—</option>{targets.map(b => <option value={b.id} key={b.id}>{b.name}</option>)}</select></label>}
        <button type="button" className="button button--gold battle-clock__pass" disabled={!canControl} onClick={pass} title={`${c.passTip} ${c.shortcut}`}>{c.pass}{targets.length === 1 ? ` → ${targets[0].name}` : ''}</button>
        <button type="button" disabled={!canControl} onClick={() => void send({ type:clock.running ? 'pause' : 'resume' })} title={c.pauseTip}>{clock.running ? c.pause : clock.startedAt === null ? c.start : c.resume}</button>
        <button type="button" onClick={() => setHelp(true)} aria-label={c.help} title={c.help}>?</button>
      </div>
      {stale && <p className="context-note" role="status">{c.offline}</p>}
      {error && <p className="alert alert--danger" role="status">{error}</p>}
      {!collapsed && <>
        {clock.config.preset === 'competitive' && rows.some(row => row.remainingMs <= 0) && <p className="clock-expiry" role="status">{c.competitiveExpiry}</p>}
        <details><summary>{c.statistics}</summary><ClockStatistics statistics={rows} /></details>
      </>}
    </>}
    {help && <CommandDialog label={c.help} onClose={closeHelp}><div className="battle-clock__help"><span className="eyebrow">{c.title} · Hybrid Clock</span><h2>{c.help}</h2><p>{c.initial}</p><ul>{[c.autoTip,c.passTip,c.saves,c.overwatch,c.fight,c.expiry].map(text => <li key={text}>{text}</li>)}</ul><button className="button button--gold" onClick={closeHelp}>{c.close}</button></div></CommandDialog>}
  </aside>
}

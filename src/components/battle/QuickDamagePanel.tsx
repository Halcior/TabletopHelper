import { t as tr } from '../../features/i18n/locale'
import { useState } from 'react'
import type { BattleEventInput, BattleSession, CombatAttribution } from '../../domain/battle/types'
import { doublesScorekeeperId, onSameDoublesForce } from '../../domain/battle/doubles'
import { selectRecentUnits } from '../../domain/battle/recentUnits'
import { buildBattleChronicle } from '../../domain/battle/chronicle'
import { useBattleStore } from '../../stores/battleStore'
import { CommandDialog } from '../ui/CommandDialog'
import { CombatControls } from './CombatControls'
import { CombatSourcePicker } from './CombatSourcePicker'
import { QuickUndoAction } from './QuickUndoAction'
import './battleExperience.css'

type Selection = { playerId: string; unitId: string; source: CombatAttribution }
function remembered(key: string): Partial<Selection> {
  try { return JSON.parse(sessionStorage.getItem(key) ?? '{}') } catch { return {} }
}

export function canQuickDamage(session: BattleSession, targetId: string, shared: boolean, viewerId?: string | null) {
  if (session.state.status !== 'active') return false
  if (!shared) return true
  if (!viewerId || !session.state.players[viewerId]) return false
  return targetId === viewerId || (doublesScorekeeperId(session.setup, viewerId) === session.state.activePlayerId
    && !onSameDoublesForce(session.setup, targetId, viewerId))
}

/** A single selected unit, using the same CombatControls and canonical events as Army. */
export function QuickDamagePanel({ session, dispatch, shared = false, viewerId, onClose }: {
  session: BattleSession; dispatch: (event: BattleEventInput) => void; shared?: boolean; viewerId?: string | null; onClose: () => void
}) {
  const key = `battle-quick-damage:v1:${session.setup.gameId}:${viewerId ?? 'local'}`
  const [selection, setSelection] = useState<Partial<Selection>>(() => remembered(key))
  const [notice, setNotice] = useState('')
  const error = useBattleStore(state => state.error)
  const [recentByPlayer] = useState(() => Object.fromEntries(session.setup.players.map(player => [player.id, selectRecentUnits(session, player.id, 3)])))
  const defaultId = shared ? viewerId : session.setup.players.find(player => player.id !== session.state.activePlayerId)?.id
  const targetId = session.state.players[selection.playerId ?? ''] ? selection.playerId! : defaultId ?? session.state.activePlayerId
  const target = session.state.players[targetId]
  const army = target.armyId ? session.setup.armies[target.armyId] : undefined
  // Keep all units in roster order, including a just-destroyed selection. Controls
  // disable in place instead of moving the next unit beneath the player's finger.
  const units = army?.units ?? []
  const unit = units.find(entry => entry.id === selection.unitId) ?? units[0]
  const canEdit = canQuickDamage(session, targetId, shared, viewerId)
  const lockedAttacker = shared && targetId !== viewerId ? viewerId ?? undefined : undefined
  const source = lockedAttacker ? { ...selection.source, destroyedByPlayerId: lockedAttacker } : selection.source ?? {}
  const recent = recentByPlayer[targetId] ?? []
  function update(patch: Partial<Selection>) {
    const next = { ...selection, ...patch }
    setSelection(next)
    try { sessionStorage.setItem(key, JSON.stringify(next)) } catch { /* optional UI preference */ }
  }
  function record(event: BattleEventInput) {
    if (!canEdit || !unit) return
    const before = session.state.players[targetId].units[unit.id]
    dispatch(event)
    const next = useBattleStore.getState().session
    if (next?.setup.gameId !== session.setup.gameId || next.state.events.length <= session.state.events.length) return
    const after = next.state.players[targetId].units[unit.id]
    const recorded = next.state.events.slice(session.state.events.length).find(entry => entry.type === 'UNIT_COMBAT_RESOLVED')
    const change = recorded && buildBattleChronicle(next).find(entry => entry.id === recorded.id)?.unitChange
    setNotice(`Recorded · ${unit.name} · ${before.modelsAlive} → ${after.modelsAlive} models${change?.effectiveWoundsLost ? ` · ${change.effectiveWoundsLost} effective Wounds lost` : ''}. ${after.destroyed ? 'Unit destroyed.' : 'Saved to Chronicle.'}`)
  }
  return <CommandDialog label={tr("Quick damage")} onClose={onClose}>
    <section className="quick-damage panel">
      <div className="section-heading"><div><span className="eyebrow">{tr("Combat Logging")}</span><h2>{tr("Quick damage")}</h2></div><button type="button" aria-label={tr("Close Quick damage")} onClick={onClose}>{tr("Close")}</button></div>
      <label><span>{tr("Receiving army")}</span><select aria-label={tr("Receiving army")} value={targetId} onChange={event => { update({ playerId: event.target.value, unitId: '', source: {} }); setNotice('') }}>{session.setup.players.map(player => <option key={player.id} value={player.id}>{player.name} · {player.faction}</option>)}</select></label>
      {recent.length > 0 && <div className="quick-damage__recent" aria-label={tr("Recently damaged units")}>{recent.map(entry => <button key={entry.unitId} type="button" onClick={() => update({ unitId: entry.unitId })}>{units.find(candidate => candidate.id === entry.unitId)?.name ?? entry.unitId}</button>)}</div>}
      <label><span>{tr("Receiving unit")}</span><select aria-label={tr("Receiving unit")} value={unit?.id ?? ''} onChange={event => { update({ unitId: event.target.value }); setNotice('') }}>{units.map(entry => <option key={entry.id} value={entry.id}>{entry.name}{entry.leaderOfUnitId ? tr(' · Leader') : ''}{session.state.players[targetId].units[entry.id]?.destroyed ? tr(' · destroyed') : ''}</option>)}</select></label>
      {!canEdit && <p className="shared-readonly-note">{tr("Read only · you can record your own army’s losses, or enemy losses inflicted by your army during your force’s turn.")}</p>}
      <CombatSourcePicker session={session} targetPlayerId={targetId} value={source} onChange={value => update({ source: value })} disabled={!canEdit} lockedAttackerPlayerId={lockedAttacker} />
      {unit && <CombatControls key={`${targetId}:${unit.id}`} unit={unit} state={session.state.players[targetId].units[unit.id]} playerId={targetId} source={source} dispatch={record} canEdit={canEdit} damageOnly compact quickBatch />}
      <div className="quick-damage__notice" role="status" aria-label={tr("Quick damage confirmation")}>{notice || tr('Select losses after saves and allocation. One press records one event.')}</div>
      {notice && <QuickUndoAction session={session} eventId={session.state.events.at(-1)?.id ?? ''} />}
      {error && <p role="alert">{tr(error)}</p>}
    </section>
  </CommandDialog>
}

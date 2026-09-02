import { useEffect, useState } from 'react'
import type { UnitDefinition, UnitState } from '../../../domain/army/types'
import type { BattleEventInput, BattleSession } from '../../../domain/battle/types'
import { selectRelevantEnemyUnits } from '../../../domain/context'
import type { SecondaryId } from '../../../rulesets/cauldronFFA3/secondaryTypes'

type QuickUnit = {
  playerId: string
  playerName: string
  unit: UnitDefinition
  state: UnitState
}

function explicitUnit(session: BattleSession, playerId?: string, unitId?: string): QuickUnit[] {
  if (!playerId || !unitId) return []
  const player = session.state.players[playerId]
  const army = player?.armyId ? session.setup.armies[player.armyId] : undefined
  const unit = army?.units.find((candidate) => candidate.id === unitId)
  const state = player?.units[unitId]
  return player && unit && state ? [{ playerId, playerName: player.name, unit, state }] : []
}

export function ArmyQuickPanel({
  session,
  playerId,
  unitId,
  secondaryId,
  dispatch,
  onClose,
  onDetails,
  sharedMode = false,
  viewerPlayerId = null,
}: {
  session: BattleSession
  playerId?: string
  unitId?: string
  secondaryId?: SecondaryId
  dispatch: (event: BattleEventInput) => void
  onClose: () => void
  onDetails: (playerId: string, unitId: string) => void
  sharedMode?: boolean
  viewerPlayerId?: string | null
}) {
  const units = unitId
    ? explicitUnit(session, playerId, unitId)
    : selectRelevantEnemyUnits(session, secondaryId)
  const activePlayerId = session.state.activePlayerId
  const panelOwnerId = units[0]?.playerId
  const inferredAttacker = panelOwnerId === activePlayerId ? 'other' : activePlayerId
  const [attacker, setAttacker] = useState(inferredAttacker)
  useEffect(() => setAttacker(inferredAttacker), [activePlayerId, panelOwnerId])
  const destroyedByPlayerId = attacker === 'other' ? null : attacker
  const players = session.state.turnOrder.map((id) => session.state.players[id])

  return <div className="quick-panel-layer" role="presentation" onMouseDown={(event) => {
    if (event.currentTarget === event.target) onClose()
  }}>
    <aside className="quick-panel quick-panel--army" role="dialog" aria-modal="true" aria-label="Army quick panel">
      <div className="quick-panel__heading">
        <div><span className="eyebrow">Army quick panel</span><h2>{unitId ? units[0]?.unit.name ?? 'Unit unavailable' : `${units[0]?.playerName ?? 'Rival'} targets`}</h2></div>
        <button onClick={onClose}>Close</button>
      </div>
      {units.length > 0 && <label className="casualty-attribution quick-panel__attribution">
        <span>Damage / casualty caused by</span>
        <select value={attacker} onChange={(event) => setAttacker(event.target.value)}>
          {players.map((player) => <option key={player.id} value={player.id}>{player.name}{player.id === activePlayerId ? ' · current' : ''}</option>)}
          <option value="other">Other / environment</option>
        </select>
        <small>Used for automatic elimination cards and Operational Plan progress.</small>
      </label>}
      {units.length === 0 && <p className="context-note">No relevant units are currently available.</p>}
      <div className="quick-unit-list">{units.map(({ playerId: ownerId, playerName, unit, state }) => {
        const multiModel = unit.startingModels > 1
        const maximumWounds = unit.stats?.wounds
        const wounds = state.woundsRemaining ?? maximumWounds ?? 0
        const canEdit = !sharedMode || ownerId === viewerPlayerId
        const readOnlyTitle = canEdit ? undefined : `${playerName} manages this unit state on their device.`
        return <article className={`quick-unit${state.destroyed ? ' is-destroyed' : ''}`} key={`${ownerId}-${unit.id}`}>
          <div className="quick-unit__heading"><div><strong>{unit.name}</strong><small>{unit.points} pts · {[...unit.categories, ...unit.keywords].join(', ') || 'Unit'}</small></div>{state.battleShocked && <span className="status-badge status-badge--danger">Battle-shocked</span>}</div>
          {!canEdit && <p className="shared-readonly-note">Read only · {playerName} owns this army state.</p>}
          {multiModel ? <>
            <div className="quick-unit__vital"><span>Models</span><strong>{state.modelsAlive} / {unit.startingModels}</strong></div>
            <div className="quick-unit__actions">
              <button disabled={!canEdit || state.modelsAlive === 0} title={readOnlyTitle} onClick={() => dispatch({ type: 'UNIT_MODEL_DESTROYED', payload: { playerId: ownerId, unitId: unit.id, amount: 1, destroyedByPlayerId } })}>− Model</button>
              <button disabled={!canEdit || state.modelsAlive >= unit.startingModels} title={readOnlyTitle} onClick={() => dispatch({ type: 'UNIT_MODEL_RESTORED', payload: { playerId: ownerId, unitId: unit.id, amount: 1 } })}>+ Model</button>
            </div>
          </> : maximumWounds ? <>
            <div className="quick-unit__vital"><span>Wounds</span><strong>{wounds} / {maximumWounds}</strong></div>
            <div className="quick-unit__actions quick-unit__actions--three">
              <button disabled={!canEdit || wounds <= 0} title={readOnlyTitle} onClick={() => dispatch({ type: 'UNIT_WOUNDS_CHANGED', payload: { playerId: ownerId, unitId: unit.id, woundsRemaining: wounds - 1, destroyedByPlayerId } })}>− W</button>
              <button disabled={!canEdit || wounds >= maximumWounds} title={readOnlyTitle} onClick={() => dispatch({ type: 'UNIT_WOUNDS_CHANGED', payload: { playerId: ownerId, unitId: unit.id, woundsRemaining: wounds + 1 } })}>+ W</button>
              <button className="button--danger" disabled={!canEdit || state.destroyed} title={readOnlyTitle} onClick={() => dispatch({ type: 'UNIT_DESTROYED', payload: { playerId: ownerId, unitId: unit.id, destroyedByPlayerId } })}>Destroyed</button>
            </div>
          </> : <button className="button--danger button--wide" disabled={!canEdit || state.destroyed} title={readOnlyTitle} onClick={() => dispatch({ type: 'UNIT_DESTROYED', payload: { playerId: ownerId, unitId: unit.id, destroyedByPlayerId } })}>Destroyed</button>}
          <button className="quick-unit__details" onClick={() => onDetails(ownerId, unit.id)}>Details</button>
        </article>
      })}</div>
    </aside>
  </div>
}

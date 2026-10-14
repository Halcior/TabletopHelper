import { CombatControls } from '../CombatControls'
import { CombatSourcePicker } from '../CombatSourcePicker'
import type { CombatAttribution } from '../../../domain/battle/types'
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
  const [source, setSource] = useState<CombatAttribution>({})
  useEffect(() => setSource({}), [activePlayerId, panelOwnerId])

  return <div className="quick-panel-layer" role="presentation" onMouseDown={(event) => {
    if (event.currentTarget === event.target) onClose()
  }}>
    <aside className="quick-panel quick-panel--army" role="dialog" aria-modal="true" aria-label="Army quick panel">
      <div className="quick-panel__heading">
        <div><span className="eyebrow">Army quick panel</span><h2>{unitId ? units[0]?.unit.name ?? 'Unit unavailable' : `${units[0]?.playerName ?? 'Rival'} targets`}</h2></div>
        <button onClick={onClose}>Close</button>
      </div>
      {panelOwnerId && <CombatSourcePicker session={session} targetPlayerId={panelOwnerId} value={{ destroyedByPlayerId, ...source }} onChange={setSource} disabled={sharedMode && panelOwnerId !== viewerPlayerId} />}
      {units.length === 0 && <p className="context-note">No relevant units are currently available.</p>}
      <div className="quick-unit-list">{units.map(({ playerId: ownerId, playerName, unit, state }) => {
        const canEdit = !sharedMode || ownerId === viewerPlayerId
        const readOnlyTitle = canEdit ? undefined : `${playerName} manages this unit state on their device.`
        const recordBattleShock = (passed: boolean) => dispatch({
          type: 'BATTLESHOCK_TEST_RESOLVED',
          payload: { playerId: ownerId, unitId: unit.id, passed },
        })
        return <article className={`quick-unit${state.destroyed ? ' is-destroyed' : ''}`} key={`${ownerId}-${unit.id}`}>
          <div className="quick-unit__heading"><div><strong>{unit.name}</strong><small>{unit.points} pts · {[...unit.categories, ...unit.keywords].join(', ') || 'Unit'}</small></div>{state.battleShocked && <span className="status-badge status-badge--danger">Battle-shocked</span>}</div>
          {!canEdit && <p className="shared-readonly-note">Read only · {playerName} owns this army state.</p>}
          <CombatControls unit={unit} state={state} playerId={ownerId} source={{ destroyedByPlayerId, ...source }} dispatch={dispatch} canEdit={canEdit} compact />
          <div className="quick-unit__battleshock">
            <span>Battle-shock</span>
            <div>
              <button disabled={!canEdit || state.destroyed} title={readOnlyTitle} onClick={() => recordBattleShock(true)}>Pass</button>
              <button className="button--danger" disabled={!canEdit || state.destroyed} title={readOnlyTitle} onClick={() => recordBattleShock(false)}>Fail</button>
              {state.battleShocked && <button disabled={!canEdit} title={readOnlyTitle} onClick={() => dispatch({
                type: 'UNIT_BATTLESHOCK_CHANGED', payload: { playerId: ownerId, unitId: unit.id, battleShocked: false },
              })}>Clear</button>}
            </div>
          </div>
          <button className="quick-unit__details" onClick={() => onDetails(ownerId, unit.id)}>Details</button>
        </article>
      })}</div>
    </aside>
  </div>
}

import type { BattleSession } from '../../domain/battle/types'
import {
  getOfficialPrimaryId, getOfficialPrimaryMarkers, getOfficialPrimaryRival, officialPrimaryActionTargets,
} from '../../rulesets/cauldronFFA3/officialPrimary'
import type { OfficialPrimaryConfirmation } from '../../rulesets/cauldronFFA3/types'

export function OfficialPrimaryInputs({ session, playerId, value, onChange }: {
  session: BattleSession
  playerId: string
  value: OfficialPrimaryConfirmation
  onChange: (value: OfficialPrimaryConfirmation) => void
}) {
  const missionId = getOfficialPrimaryId(session, playerId)
  const rival = getOfficialPrimaryRival(session, playerId)
  function confirm(patch: Partial<OfficialPrimaryConfirmation>) {
    onChange({ ...value, ...patch, rivalPlayerId: rival.playerId })
  }
  if (missionId === 'meatgrinder') return <div className="official-primary-inputs">
    <p>Current Rival: {rival.name}. Count that Rival's units destroyed this turn and your units destroyed by that same Rival since your previous turn. Confirm both counts at the table.</p>
    <label>Current Rival units destroyed this turn<input type="number" min="0" step="1" value={value.enemyUnitsDestroyedThisTurn ?? 0}
      onChange={(event) => confirm({ enemyUnitsDestroyedThisTurn: Number(event.target.value) })} /></label>
    {session.state.round >= 2 && <label>Own units destroyed by current Rival since your previous turn<input type="number" min="0" step="1" value={value.friendlyUnitsDestroyedSinceLastTurn ?? 0}
      onChange={(event) => confirm({ friendlyUnitsDestroyedSinceLastTurn: Number(event.target.value) })} /></label>}
  </div>
  if (missionId !== 'gather-intel' && missionId !== 'sabotage') return null
  if (missionId === 'gather-intel' && session.state.round === 1) return null
  const targets = officialPrimaryActionTargets(session, playerId)
  const markers = getOfficialPrimaryMarkers(session, playerId)
  const actions = value.actions ?? []
  return <div className="official-primary-inputs">
    <p>Confirm actions started in your Shooting phase and completed while the acting unit controlled its objective at turn end. Use a different unit and objective for each action.</p>
    {markers.length > 0 && missionId === 'gather-intel' && <small>Already marked: {markers.join(', ')}</small>}
    {targets.length === 0 && <small>No eligible controlled objectives. Update control on the Objectives tab if needed.</small>}
    {targets.map((objective) => {
      const action = actions.find((entry) => entry.objectiveId === objective.id)
      const replace = (patch: Partial<NonNullable<typeof action>>) => confirm({ actions: actions.map((entry) => entry.objectiveId === objective.id ? { ...entry, ...patch } : entry) })
      return <div className="official-primary-action" key={objective.id}>
        <label className="review-check-row"><input type="checkbox" checked={Boolean(action)} onChange={(event) => confirm({ actions: event.target.checked
          ? [...actions, { objectiveId: objective.id, unitName: '', enemyTerritory: false }]
          : actions.filter((entry) => entry.objectiveId !== objective.id) })} /><span>Completed at {objective.name}</span></label>
        {action && <label>Acting unit<input value={action.unitName} onChange={(event) => replace({ unitName: event.target.value })} placeholder="Unit name" /></label>}
        {action && missionId === 'sabotage' && (objective.type !== 'home'
          ? <label className="review-check-row"><input type="checkbox" checked={Boolean(action.enemyTerritory)} onChange={(event) => replace({ enemyTerritory: event.target.checked })} /><span>This objective is in current Rival territory ({rival.name}) (+2 VP)</span></label>
          : <small>{objective.id === rival.homeObjectiveId ? 'Current Rival HOME · +2 VP territory bonus.' : 'No Rival territory bonus at this HOME.'}</small>)}
      </div>
    })}
  </div>
}

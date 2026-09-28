import type { BattleSession } from '../../domain/battle/types'
import {
  getOfficialPrimaryId, getOfficialPrimaryMarkers, officialPrimaryActionTargets,
} from '../../rulesets/cauldronFFA3/officialPrimary'
import type { OfficialPrimaryConfirmation } from '../../rulesets/cauldronFFA3/types'

export function OfficialPrimaryInputs({ session, playerId, value, onChange }: {
  session: BattleSession
  playerId: string
  value: OfficialPrimaryConfirmation
  onChange: (value: OfficialPrimaryConfirmation) => void
}) {
  const missionId = getOfficialPrimaryId(session, playerId)
  if (missionId === 'meatgrinder') return <div className="official-primary-inputs">
    <p>Count units from both enemy armies. For your losses, include both opposing turns since your previous turn.</p>
    <label>Enemy units destroyed this turn<input type="number" min="0" step="1" value={value.enemyUnitsDestroyedThisTurn ?? 0}
      onChange={(event) => onChange({ ...value, enemyUnitsDestroyedThisTurn: Number(event.target.value) })} /></label>
    {session.state.round >= 2 && <label>Own units destroyed since your previous turn<input type="number" min="0" step="1" value={value.friendlyUnitsDestroyedSinceLastTurn ?? 0}
      onChange={(event) => onChange({ ...value, friendlyUnitsDestroyedSinceLastTurn: Number(event.target.value) })} /></label>}
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
      const replace = (patch: Partial<NonNullable<typeof action>>) => onChange({ ...value, actions: actions.map((entry) => entry.objectiveId === objective.id ? { ...entry, ...patch } : entry) })
      return <div className="official-primary-action" key={objective.id}>
        <label className="review-check-row"><input type="checkbox" checked={Boolean(action)} onChange={(event) => onChange({ ...value, actions: event.target.checked
          ? [...actions, { objectiveId: objective.id, unitName: '', enemyTerritory: false }]
          : actions.filter((entry) => entry.objectiveId !== objective.id) })} /><span>Completed at {objective.name}</span></label>
        {action && <label>Acting unit<input value={action.unitName} onChange={(event) => replace({ unitName: event.target.value })} placeholder="Unit name" /></label>}
        {action && missionId === 'sabotage' && <label className="review-check-row"><input type="checkbox" checked={Boolean(action.enemyTerritory)} onChange={(event) => replace({ enemyTerritory: event.target.checked })} /><span>This objective is in either enemy territory (+2 VP)</span></label>}
      </div>
    })}
  </div>
}

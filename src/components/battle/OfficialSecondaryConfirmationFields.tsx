import type { BattleSession } from '../../domain/battle/types'
import { getCauldronEventData } from '../../rulesets/cauldronFFA3/events'
import { officialTurnKey } from '../../rulesets/cauldronFFA3/officialSecondary'
import { getOfficialSecondaryRival, officialPlayerUnits, officialRivalKills } from '../../rulesets/cauldronFFA3/officialSecondaryFFA'
import { getSecondaryState } from '../../rulesets/cauldronFFA3/secondary'
import type { OfficialSecondaryConfirmation, OfficialSecondaryId } from '../../rulesets/cauldronFFA3/secondaryTypes'

export function OfficialSecondaryConfirmationFields({ session, playerId, cardId, value, onChange }: {
  session: BattleSession
  playerId: string
  cardId: OfficialSecondaryId
  value: OfficialSecondaryConfirmation
  onChange: (value: OfficialSecondaryConfirmation) => void
}) {
  const enemies = session.setup.players.filter((player) => player.id !== playerId)
  const units = officialPlayerUnits(session, playerId)
  const card = getSecondaryState(session)[playerId]?.active.find((entry) => entry.cardId === cardId)
  const update = (patch: Partial<OfficialSecondaryConfirmation>) => onChange({ ...value, ...patch })
  const check = (key: 'ownUnitWithin3OfCenter' | 'beaconOutsideOwnDeployment' | 'unitWhollyOutsideOwnTerritory' | 'outflankUnitNearEdge' | 'outflankOppositeEdges', label: string) => (
    <label className="review-check-row"><input type="checkbox" checked={value[key] === true} onChange={(event) => update({ [key]: event.target.checked })} /><span>{label}</span></label>
  )
  const toggleId = (key: 'guardingObjectiveIdsInRange' | 'overwhelmingForceUnitIds' | 'completedCleanseObjectiveIds', id: string, checked: boolean) => update({
    [key]: checked ? [...new Set([...(value[key] ?? []), id])] : (value[key] ?? []).filter((entry) => entry !== id),
  })
  switch (cardId) {
    case 'OFFICIAL_CENTRE_GROUND': return <>
      {check('ownUnitWithin3OfCenter', 'Own qualifying unit within 3″ of CENTER')}
      {enemies.map((enemy) => <label key={enemy.id}>{enemy.name} · closest enemy unit to CENTER<select value={value.enemyCenterDistanceByPlayer?.[enemy.id] ?? ''} onChange={(event) => update({ enemyCenterDistanceByPlayer: { ...value.enemyCenterDistanceByPlayer, [enemy.id]: event.target.value as 'within-3' | 'within-6' | 'outside-6' } })}>
        <option value="">Check this army</option><option value="within-3">Within 3″ · blocks scoring</option><option value="within-6">More than 3″, within 6″</option><option value="outside-6">No units within 6″</option>
      </select></label>)}
    </>
    case 'OFFICIAL_DEFEND_STRONGHOLD': return <>{enemies.map((enemy) => <label key={enemy.id}>{enemy.name} · enemy units in your deployment zone<select value={value.enemyInOwnDeploymentByPlayer?.[enemy.id] === undefined ? '' : String(value.enemyInOwnDeploymentByPlayer[enemy.id])} onChange={(event) => update({ enemyInOwnDeploymentByPlayer: { ...value.enemyInOwnDeploymentByPlayer, [enemy.id]: event.target.value === 'true' } })}>
      <option value="" disabled>Check this army</option><option value="true">Yes · no bonus</option><option value="false">None</option>
    </select></label>)}</>
    case 'OFFICIAL_DISPLAY_OF_MIGHT': return <><small>Qualifying units wholly within NML, counted separately for each army.</small>{session.setup.players.map((player) => <label key={player.id}>{player.name} · qualifying NML units<input type="number" min="0" step="1" value={value.qualifyingNmlUnitsByPlayer?.[player.id] ?? ''} placeholder="Enter count" onChange={(event) => update({ qualifyingNmlUnitsByPlayer: { ...value.qualifyingNmlUnitsByPlayer, [player.id]: event.target.value === '' ? Number.NaN : Number(event.target.value) } })} /></label>)}</>
    case 'OFFICIAL_BEACON': return <>
      <small>Check the locked unit: {card?.cardSpecificState?.lastConfirmation ?? 'Choose a unit when drawn first'}.</small>
      {check('beaconOutsideOwnDeployment', 'Selected unit outside own deployment zone')}
      {check('unitWhollyOutsideOwnTerritory', 'Selected unit wholly outside own Territory; boundary counts as inside')}
    </>
    case 'OFFICIAL_BEHIND_ENEMY_LINES': return <label>Qualifying units wholly within {session.state.players[getOfficialSecondaryRival(session, playerId, cardId)]?.name}’s deployment zone<input type="number" min="0" step="1" value={value.behindEnemyLinesUnitCount ?? ''} onChange={(event) => update({ behindEnemyLinesUnitCount: Number(event.target.value) })} /></label>
    case 'OFFICIAL_ENGAGE_ON_ALL_FRONTS': return <label>Qualifying battlefield quarters<select value={value.qualifyingQuarterCount ?? 0} onChange={(event) => update({ qualifyingQuarterCount: Number(event.target.value) })}><option value={0}>Condition not met</option><option value={3}>Three quarters</option><option value={4}>Four quarters</option></select></label>
    case 'OFFICIAL_OUTFLANK': return <>
      {check('outflankUnitNearEdge', 'Qualifying own unit within 6″ of a battlefield edge')}
      {check('unitWhollyOutsideOwnTerritory', 'At least one qualifying unit wholly outside own Territory; boundary counts as inside')}
      {check('outflankOppositeEdges', 'Two qualifying units within 6″ of opposite parallel edges')}
    </>
    case 'OFFICIAL_BURDEN_OF_TRUST': return <>{Object.entries(card?.cardSpecificState?.officialGuardAssignments ?? {}).map(([objectiveId, unitId]) => <label className="review-check-row" key={objectiveId}>
      <input type="checkbox" checked={value.guardingObjectiveIdsInRange?.includes(objectiveId) ?? false} onChange={(event) => toggleId('guardingObjectiveIdsInRange', objectiveId, event.target.checked)} />
      <span>{objectiveId} · {units.find((unit) => unit.id === unitId)?.name} still in objective range</span>
    </label>)}</>
    case 'OFFICIAL_OVERWHELMING_FORCE': return <>{[...new Set(officialRivalKills(session, playerId, cardId).filter((kill) => kill.unitDestroyed).map((kill) => kill.unitId))].map((unitId) => <label className="review-check-row" key={unitId}>
      <input type="checkbox" checked={value.overwhelmingForceUnitIds?.includes(unitId) ?? false} onChange={(event) => toggleId('overwhelmingForceUnitIds', unitId, event.target.checked)} />
      <span>{officialPlayerUnits(session, getOfficialSecondaryRival(session, playerId, cardId)).find((unit) => unit.id === unitId)?.name} began this turn in range of an objective</span>
    </label>)}</>
    case 'OFFICIAL_CLEANSE': return <>{getCauldronEventData<{ playerId: string; cardId: string; turnKey: string; target: string; unit: string }>(session, 'SECONDARY_OFFICIAL_ACTION_STARTED')
      .filter((action) => action.playerId === playerId && action.cardId === cardId && action.turnKey === officialTurnKey(session)).map((action) => <label className="review-check-row" key={action.target}>
        <input type="checkbox" checked={value.completedCleanseObjectiveIds?.includes(action.target) ?? false} onChange={(event) => toggleId('completedCleanseObjectiveIds', action.target, event.target.checked)} />
        <span>{units.find((unit) => unit.id === action.unit)?.name} still controls {action.target} · Cleanse completed</span>
      </label>)}</>
    default: return null
  }
}

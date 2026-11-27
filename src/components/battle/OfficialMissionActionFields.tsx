import { useState } from 'react'
import type { BattleSession } from '../../domain/battle/types'
import { officialBoardDefinition } from '../../domain/battlefield/layouts'
import { t as tr } from '../../features/i18n/locale'
import { officialActionStarts } from '../../rulesets/cauldronFFA3/officialSecondary'
import { officialNmlObjectives } from '../../rulesets/cauldronFFA3/officialSecondaryFFA'
import { useBattleStore } from '../../stores/battleStore'
import { missionObjectiveLabel, missionUnitChoices, missionUnitLabel } from './missionChoices'

const CUSTOM_TERRAIN = 'custom-terrain'

export function OfficialMissionActionFields({ session, playerId, cardId, editable, ffa }: {
  session: BattleSession
  playerId: string
  cardId: 'OFFICIAL_CLEANSE' | 'OFFICIAL_PLUNDER'
  editable: boolean
  ffa: boolean
}) {
  const [unitId, setUnitId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [locationText, setLocationText] = useState('')
  const [outsideTerritory, setOutsideTerritory] = useState(false)
  const startAction = useBattleStore((store) => store.startOfficialSecondaryAction)
  const starts = officialActionStarts(session, playerId, cardId)
  const cleanse = cardId === 'OFFICIAL_CLEANSE'
  const showFields = editable && (cleanse || !starts.length)
  const usedUnit = (value: string) => starts.some((action) => action.unit.toLocaleLowerCase() === value.toLocaleLowerCase())
  const units = showFields ? missionUnitChoices(session, playerId, true).filter((unit) => !usedUnit(unit.value)) : []
  const objectives = cleanse && showFields
    ? officialNmlObjectives(session).filter((id) => !starts.some((start) => start.target.toLocaleLowerCase() === id.toLocaleLowerCase()))
    : []
  const terrain = !cleanse && showFields ? officialBoardDefinition(session.setup)?.terrainAreas ?? [] : []
  const footprintIds = !cleanse && showFields && !terrain.length
    ? Object.keys(session.state.battlefield?.footprints ?? {}).filter((id) => session.state.battlefield?.positions[id] && session.state.objectives[id])
    : []
  const hasTerrainChoices = terrain.length > 0 || footprintIds.length > 0
  const usesTerrainText = !cleanse && (!hasTerrainChoices || locationId === CUSTOM_TERRAIN)
  const target = usesTerrainText ? locationText.trim() : locationId
  const targetValid = cleanse ? objectives.includes(target)
    : usesTerrainText ? Boolean(target) : terrain.some((area) => area.id === target) || footprintIds.includes(target)
  const terrainLabel = tr(ffa ? 'Terrain area wholly outside your Territory' : 'Terrain area outside your territory')

  function submit() {
    startAction(playerId, cardId, unitId, target, { terrainWhollyOutsideOwnTerritory: outsideTerritory })
    if (useBattleStore.getState().error) return
    setUnitId('')
    setLocationId('')
    setLocationText('')
    setOutsideTerritory(false)
  }

  function chooseLocation(id: string) {
    setLocationId(id)
    setOutsideTerritory(false)
  }

  return <div className="official-secondary-input">
    <strong>{starts.length} {tr(" action(s) started this turn")}</strong>
    {!!starts.length && <ul>{starts.map((entry) => <li key={entry.unit}>
      {missionUnitLabel(session, playerId, entry.unit)} · {missionObjectiveLabel(session, entry.target)}
    </li>)}</ul>}
    {showFields && <>
      <label>{tr("Acting unit")}<select value={unitId} onChange={(event) => setUnitId(event.target.value)}>
        <option value="">{tr(units.length ? 'Choose a qualifying own unit' : 'No relevant units are currently available.')}</option>
        {units.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
      </select></label>
      {cleanse && <label>{tr("Non-home objective")}<select value={locationId} onChange={(event) => chooseLocation(event.target.value)}>
        <option value="">{tr("Choose an objective")}</option>
        {objectives.map((id) => <option key={id} value={id}>{missionObjectiveLabel(session, id)}</option>)}
      </select></label>}
      {hasTerrainChoices && <label>{terrainLabel}<select value={locationId} onChange={(event) => chooseLocation(event.target.value)}>
        <option value="">{tr("Choose a terrain area")}</option>
        {terrain.map(({ id }) => <option key={id} value={id}>{id}</option>)}
        {footprintIds.map((id) => <option key={id} value={id}>{missionObjectiveLabel(session, id)}</option>)}
        <option value={CUSTOM_TERRAIN}>{tr("Other terrain area")}</option>
      </select></label>}
      {usesTerrainText && <label>{hasTerrainChoices ? tr("Location on the table") : terrainLabel}<input
        value={locationText} placeholder={tr("Location on the table")}
        onChange={(event) => { setLocationText(event.target.value); setOutsideTerritory(false) }}
      /></label>}
      {ffa && !cleanse && <label className="review-check-row"><input type="checkbox" checked={outsideTerritory}
        onChange={(event) => setOutsideTerritory(event.target.checked)} />
        <span>{tr("The entire terrain footprint is wholly outside own Territory, without touching its boundary")}</span>
      </label>}
      <button type="button" disabled={!units.some((unit) => unit.value === unitId) || !targetValid || (ffa && !cleanse && !outsideTerritory)}
        onClick={submit}>{tr("Start action in Shooting phase")}</button>
    </>}
  </div>
}

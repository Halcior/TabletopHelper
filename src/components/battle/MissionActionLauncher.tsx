import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  getEligibleMissionActionUnits,
  type StartMissionActionInput,
} from '../../domain/battle/missionActions'
import type { BattleSession } from '../../domain/battle/types'
import type { SecondaryId } from '../../rulesets/cauldronFFA3/secondaryTypes'

type MissionActionLauncherProps = {
  session: BattleSession
  secondaryId: SecondaryId
  onStart: (input: StartMissionActionInput) => void
  onClose: () => void
}

export function MissionActionLauncher({ session, secondaryId, onStart, onClose }: MissionActionLauncherProps) {
  const playerId = session.state.activePlayerId
  const units = useMemo(
    () => getEligibleMissionActionUnits(session, playerId),
    [session, playerId],
  )
  const neutralObjectives = Object.values(session.state.objectives).filter((objective) => objective.type === 'neutral')
  const [unitId, setUnitId] = useState(units[0]?.unitId ?? '')
  const [objectiveId, setObjectiveId] = useState(neutralObjectives[0]?.id ?? '')
  const [confirmed, setConfirmed] = useState(false)
  useEffect(() => {
    if (!units.some((unit) => unit.unitId === unitId)) setUnitId(units[0]?.unitId ?? '')
  }, [unitId, units])
  const selected = units.find((unit) => unit.unitId === unitId)
  const secureData = secondaryId === 'ZABEZPIECZ_DANE'

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!selected || !confirmed) return
    onStart({
      playerId,
      unitId: selected.unitId,
      type: secureData ? 'SECURE_DATA' : 'SCAN_SIGNAL',
      name: secureData ? 'Securing Data' : 'Scanning Signal',
      targetObjectiveId: secureData ? objectiveId : undefined,
      locationType: secureData ? 'NEUTRAL_OBJECTIVE' : 'BATTLEFIELD_CENTRE',
      linkedSecondaryCardId: secondaryId,
      unknownConditionsConfirmed: confirmed,
    })
  }

  return (
    <form className="mission-action-launcher" onSubmit={submit}>
      <div className="section-heading">
        <div><span className="eyebrow">Mission Action</span><h3>{secureData ? 'Secure Data' : 'Scan Signal'}</h3></div>
        <button type="button" onClick={onClose}>Close</button>
      </div>
      {session.state.phase !== 'MOVEMENT'
        ? <p className="context-note">Mission Actions start at the end of your Movement phase.</p>
        : units.length === 0
          ? <p className="context-note">No eligible units are available. Units need OC&gt;0, must be on the battlefield, and cannot be Battle-shocked, AIRCRAFT, or FORTIFICATION.</p>
          : <>
            <label>Acting unit<select value={unitId} onChange={(event) => setUnitId(event.target.value)}>
              {units.map((unit) => <option key={unit.unitId} value={unit.unitId}>{unit.unitName}</option>)}
            </select></label>
            {secureData && <label>Neutral objective<select value={objectiveId} onChange={(event) => setObjectiveId(event.target.value)}>
              {neutralObjectives.map((objective) => <option key={objective.id} value={objective.id}>{objective.name}</option>)}
            </select></label>}
            {selected && <ul className="mission-known-checks">
              {selected.knownChecks.map((check) => <li key={check.key}><span aria-hidden="true">✓</span>{check.label}</li>)}
            </ul>}
            <label className="mission-physical-confirmation">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
              <span>The unit is eligible to shoot, did not Advance or Fall Back, is not in Engagement Range, and is in the required position.</span>
            </label>
            <button className="button--gold button--wide" disabled={!selected || !confirmed || (secureData && !objectiveId)}>Start action</button>
          </>}
    </form>
  )
}

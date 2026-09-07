import { useMemo, useState } from 'react'
import type { BattleEventInput, BattleSession } from '../../domain/battle/types'

export function RivalDamagePanel({
  session,
  attackerPlayerId,
  victimPlayerId,
  dispatch,
}: {
  session: BattleSession
  attackerPlayerId: string
  victimPlayerId: string
  dispatch: (event: BattleEventInput) => void
}) {
  const [query, setQuery] = useState('')
  const attacker = session.state.players[attackerPlayerId]
  const victim = session.state.players[victimPlayerId]
  const setupPlayer = session.setup.players.find((player) => player.id === victimPlayerId)
  const army = setupPlayer?.armyId ? session.setup.armies[setupPlayer.armyId] : undefined

  const units = useMemo(() => {
    if (!army || !victim) return []
    const normalized = query.trim().toLocaleLowerCase()
    return army.units
      .filter((unit) => !victim.units[unit.id]?.destroyed)
      .filter((unit) => !normalized || unit.name.toLocaleLowerCase().includes(normalized))
  }, [army, query, victim])

  if (!attacker || !victim || !army || attackerPlayerId === victimPlayerId) return null

  function loseModel(unitId: string) {
    dispatch({
      type: 'UNIT_MODEL_DESTROYED',
      payload: { playerId: victimPlayerId, unitId, amount: 1, destroyedByPlayerId: attackerPlayerId },
    })
  }

  function loseWounds(unitId: string, current: number, amount: number) {
    dispatch({
      type: 'UNIT_WOUNDS_CHANGED',
      payload: {
        playerId: victimPlayerId,
        unitId,
        woundsRemaining: Math.max(0, current - amount),
        destroyedByPlayerId: attackerPlayerId,
      },
    })
  }

  function destroyUnit(unitId: string) {
    dispatch({
      type: 'UNIT_DESTROYED',
      payload: { playerId: victimPlayerId, unitId, destroyedByPlayerId: attackerPlayerId },
    })
  }

  return <section className="rival-damage-panel" aria-label={`Record damage to ${victim.name}`}>
    <div className="rival-damage-panel__heading">
      <div><span className="eyebrow">Your attacks</span><h2>Damage {victim.name}</h2><small>Losses are credited to {attacker.name} automatically.</small></div>
      <strong>{army.faction}</strong>
    </div>
    <label className="rival-damage-panel__search">
      <span>Find enemy unit</span>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search unit…" />
    </label>
    <div className="rival-damage-list">
      {units.map((unit) => {
        const state = victim.units[unit.id]
        if (!state) return null
        const multiModel = unit.startingModels > 1
        const maximumWounds = unit.stats?.wounds
        const wounds = state.woundsRemaining ?? maximumWounds ?? 0
        const vital = multiModel
          ? `${state.modelsAlive}/${unit.startingModels} models`
          : maximumWounds ? `${wounds}/${maximumWounds} W` : 'Active'
        return <article className="rival-damage-row" key={unit.id}>
          <div className="rival-damage-row__identity"><strong>{unit.name}</strong><span>{vital}</span></div>
          <div className="rival-damage-row__actions">
            {multiModel ? <button type="button" disabled={state.modelsAlive <= 0} onClick={() => loseModel(unit.id)}>−1 model</button> : maximumWounds ? <>
              <button type="button" disabled={wounds <= 0} onClick={() => loseWounds(unit.id, wounds, 1)}>−1W</button>
              <button type="button" disabled={wounds <= 0} onClick={() => loseWounds(unit.id, wounds, 3)}>−3W</button>
            </> : null}
            <button type="button" className="danger-action" disabled={state.destroyed} onClick={() => destroyUnit(unit.id)}>Destroyed</button>
          </div>
        </article>
      })}
      {units.length === 0 && <p className="context-note">No matching active enemy units.</p>}
    </div>
    <p className="rival-damage-panel__note">Only casualties can be recorded here. The army owner still controls healing, Battle-shock, abilities and corrections.</p>
  </section>
}

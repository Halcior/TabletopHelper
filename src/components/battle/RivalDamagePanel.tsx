import { useEffect, useMemo, useState } from 'react'
import type { BattleEventInput, BattleSession } from '../../domain/battle/types'

export function RivalDamagePanel({
  session,
  attackerPlayerId,
  currentRivalPlayerId,
  dispatch,
}: {
  session: BattleSession
  attackerPlayerId: string
  currentRivalPlayerId?: string | null
  dispatch: (event: BattleEventInput) => void
}) {
  const attacker = session.state.players[attackerPlayerId]
  const opponentIds = session.state.turnOrder.filter((playerId) => playerId !== attackerPlayerId && Boolean(session.state.players[playerId]))
  const defaultVictimId = currentRivalPlayerId && opponentIds.includes(currentRivalPlayerId)
    ? currentRivalPlayerId
    : opponentIds[0] ?? ''
  const [victimPlayerId, setVictimPlayerId] = useState(defaultVictimId)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!opponentIds.includes(victimPlayerId)) setVictimPlayerId(defaultVictimId)
  }, [defaultVictimId, opponentIds, victimPlayerId])

  useEffect(() => {
    setQuery('')
  }, [victimPlayerId])

  const victim = session.state.players[victimPlayerId]
  const setupPlayer = session.setup.players.find((player) => player.id === victimPlayerId)
  const army = setupPlayer?.armyId ? session.setup.armies[setupPlayer.armyId] : undefined
  const victimIsRival = victimPlayerId === currentRivalPlayerId

  const units = useMemo(() => {
    if (!army || !victim) return []
    const normalized = query.trim().toLocaleLowerCase()
    return army.units
      .filter((unit) => !victim.units[unit.id]?.destroyed)
      .filter((unit) => !normalized || unit.name.toLocaleLowerCase().includes(normalized))
  }, [army, query, victim])

  if (!attacker || opponentIds.length === 0) return null

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

  return <section className="rival-damage-panel" aria-label="Record damage to an opponent">
    <div className="rival-damage-panel__heading">
      <div>
        <span className="eyebrow">Your attacks</span>
        <h2>Damage opponent</h2>
        <small>Choose who you attacked. Losses are credited to {attacker.name} automatically.</small>
      </div>
      {victim && <strong>{victim.name}</strong>}
    </div>

    {opponentIds.length > 1 && <div className="rival-damage-panel__targets" role="group" aria-label="Choose damaged opponent">
      {opponentIds.map((playerId) => {
        const player = session.state.players[playerId]
        const isRival = playerId === currentRivalPlayerId
        return <button
          type="button"
          key={playerId}
          className={playerId === victimPlayerId ? 'selected' : ''}
          aria-pressed={playerId === victimPlayerId}
          onClick={() => setVictimPlayerId(playerId)}
        >
          <strong>{player.name}</strong>
          <span>{isRival ? 'Current Rival · scoring target' : 'Other opponent'}</span>
        </button>
      })}
    </div>}

    {victim && army ? <>
      <div className={`rival-damage-panel__scoring-note${victimIsRival ? ' is-rival' : ''}`}>
        <strong>{victimIsRival ? 'Current Rival' : 'Non-Rival target'}</strong>
        <span>{victimIsRival
          ? 'Kills can satisfy Rival-based Cauldron Secondary conditions.'
          : 'You can attack and record losses normally, but Rival-only kill scoring does not count this opponent.'}</span>
      </div>

      <label className="rival-damage-panel__search">
        <span>Find {victim.name} unit · {army.faction}</span>
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
    </> : <p className="context-note">This opponent has no army roster attached.</p>}

    <p className="rival-damage-panel__note">Any opponent can be attacked in FFA. The Rival only determines which opponent counts for Rival-specific scoring. The army owner still controls healing, Battle-shock, abilities and corrections.</p>
  </section>
}

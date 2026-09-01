import { useEffect, useState } from 'react'
import type { Army, UnitDefinition, UnitState, WeaponProfile } from '../../domain/army/types'
import type { BattleEventInput, BattleSession } from '../../domain/battle/types'
import { CAULDRON_RULESET_ID, getCurrentRivalPlayerId } from '../../rulesets/cauldronFFA3'

type ArmyTrackerProps = {
  session: BattleSession
  dispatch: (event: BattleEventInput) => void
}

function Weapons({ title, weapons }: { title: string; weapons: WeaponProfile[] }) {
  if (weapons.length === 0) return null
  return (
    <section className="reference-section">
      <h4>{title}</h4>
      <div className="weapon-table-wrap">
        <table className="weapon-table">
          <thead><tr><th>Weapon</th><th>Range</th><th>A</th><th>Skill</th><th>S</th><th>AP</th><th>D</th></tr></thead>
          <tbody>{weapons.map((weapon) => (
            <tr key={`${weapon.type}-${weapon.name}-${weapon.range}-${weapon.attacks}`}>
              <td>{weapon.name}{weapon.keywords.length > 0 && <small>{weapon.keywords.join(', ')}</small>}</td>
              <td>{weapon.range ?? '—'}</td><td>{weapon.attacks ?? '—'}</td><td>{weapon.skill ?? '—'}</td>
              <td>{weapon.strength ?? '—'}</td><td>{weapon.ap ?? '—'}</td><td>{weapon.damage ?? '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  )
}

function UnitReference({
  unit,
  state,
  army,
  ownerId,
  dispatch,
}: {
  unit: UnitDefinition
  state: UnitState
  army: Army
  ownerId: string
  dispatch: (event: BattleEventInput) => void
}) {
  const stats = unit.stats
  const leaders = unit.ledByUnitIds.flatMap((id) => {
    const name = army.units.find((candidate) => candidate.id === id)?.name
    return name ? [name] : []
  })
  const bodyguard = unit.leaderOfUnitId
    ? army.units.find((candidate) => candidate.id === unit.leaderOfUnitId)?.name ?? null
    : null
  return (
    <div className="unit-reference">
      {stats && <section className="reference-section"><h4>Statline</h4><div className="stat-grid">
        {[
          ['M', stats.movement], ['T', stats.toughness], ['SV', stats.save], ['W', stats.wounds],
          ['LD', stats.leadership], ['OC', stats.objectiveControl], ['INV', stats.invulnerableSave],
        ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value ?? '—'}</strong></div>)}
      </div></section>}
      {unit.modelGroups.length > 0 && <section className="reference-section"><h4>Model groups</h4><ul className="plain-list">
        {unit.modelGroups.map((group) => <li key={group.name}><strong>{group.startingCount}× {group.name}</strong>{group.equipment.length > 0 && <span>{group.equipment.join(', ')}</span>}</li>)}
      </ul></section>}
      <Weapons title="Ranged weapons" weapons={unit.rangedWeapons} />
      <Weapons title="Melee weapons" weapons={unit.meleeWeapons} />
      {unit.abilities.length > 0 && <details className="reference-details"><summary>Abilities</summary><ul className="ability-list">
        {unit.abilities.map((ability) => {
          const used = state.oncePerBattleAbilities[ability.name] ?? false
          return <li key={`${ability.name}-${ability.description ?? ''}`}>
            <div><strong>{ability.name}</strong>{ability.description && <p>{ability.description}</p>}</div>
            <button className={used ? 'button button--danger button--small' : 'button button--small'} onClick={() => dispatch({
              type: 'ABILITY_USED', payload: { playerId: ownerId, unitId: unit.id, abilityName: ability.name, used: !used },
            })}>{used ? 'Used · restore' : 'Mark used'}</button>
          </li>
        })}
      </ul></details>}
      {unit.enhancements.length > 0 && <section className="reference-section"><h4>Enhancements</h4><ul className="plain-list">
        {unit.enhancements.map((enhancement) => <li key={enhancement.name}><strong>{enhancement.name} · {enhancement.points} pts</strong>{enhancement.description && <span>{enhancement.description}</span>}</li>)}
      </ul></section>}
      {unit.wargear.length > 0 && <section className="reference-section"><h4>Wargear</h4><p>
        {unit.wargear.map((item) => `${item.name}${item.points ? ` (+${item.points} pts)` : ''}`).join(' · ')}
      </p></section>}
      {(leaders.length > 0 || bodyguard) && <section className="reference-section"><h4>Leader / bodyguard</h4>
        {leaders.length > 0 && <p>Led by: {leaders.join(', ')}</p>}{bodyguard && <p>Leads: {bodyguard}</p>}
      </section>}
    </div>
  )
}

function UnitCard({
  unit,
  state,
  army,
  ownerId,
  activePlayerId,
  players,
  dispatch,
}: {
  unit: UnitDefinition
  state: UnitState
  army: Army
  ownerId: string
  activePlayerId: string
  players: Array<{ id: string; name: string }>
  dispatch: (event: BattleEventInput) => void
}) {
  const inferredAttacker = activePlayerId === ownerId ? 'other' : activePlayerId
  const [attacker, setAttacker] = useState(inferredAttacker)
  useEffect(() => setAttacker(inferredAttacker), [inferredAttacker])
  const destroyedByPlayerId = attacker === 'other' ? null : attacker
  const multiModel = unit.startingModels > 1
  const maximumWounds = unit.stats?.wounds
  const wounds = state.woundsRemaining ?? maximumWounds ?? 0
  const destroy = () => dispatch({
    type: 'UNIT_DESTROYED', payload: { playerId: ownerId, unitId: unit.id, destroyedByPlayerId },
  })

  return (
    <article className={`unit-card${state.destroyed ? ' is-destroyed' : ''}`}>
      <div className="unit-card__header">
        <div><h3>{unit.name}</h3><p>{unit.points} pts{unit.isWarlord ? ' · Warlord' : ''}</p></div>
        {state.battleShocked && <span className="status-badge status-badge--danger">Battle-shocked</span>}
      </div>
      <label className="casualty-attribution"><span>Destroyed by</span><select value={attacker} onChange={(event) => setAttacker(event.target.value)}>
        {players.map((player) => <option key={player.id} value={player.id}>{player.name}{player.id === activePlayerId ? ' · current' : ''}</option>)}
        <option value="other">Other / environment</option>
      </select></label>
      {multiModel ? <>
        <div className="model-pips" aria-label={`${state.modelsAlive} of ${unit.startingModels} models alive`}>
          {Array.from({ length: unit.startingModels }, (_, index) => <span aria-hidden="true" className={index < state.modelsAlive ? 'alive' : ''} key={index} />)}
        </div>
        <div className="unit-vital"><strong>{state.modelsAlive} / {unit.startingModels}</strong><span>models alive</span></div>
        <div className="unit-actions">
          <button disabled={state.modelsAlive === 0} onClick={() => dispatch({
            type: 'UNIT_MODEL_DESTROYED', payload: { playerId: ownerId, unitId: unit.id, amount: 1, destroyedByPlayerId },
          })}>− Model</button>
          <button disabled={state.modelsAlive >= unit.startingModels} onClick={() => dispatch({
            type: 'UNIT_MODEL_RESTORED', payload: { playerId: ownerId, unitId: unit.id, amount: 1 },
          })}>+ Model</button>
        </div>
        <p className="unit-summary">W{unit.stats?.wounds ?? '—'} / model · OC{unit.stats?.objectiveControl ?? '—'} / model</p>
      </> : maximumWounds ? <>
        <div className="unit-vital unit-vital--wounds"><span>Wounds</span><strong>{wounds} / {maximumWounds}</strong></div>
        <div className="unit-actions unit-actions--three">
          <button disabled={wounds <= 0} onClick={() => dispatch({
            type: 'UNIT_WOUNDS_CHANGED',
            payload: { playerId: ownerId, unitId: unit.id, woundsRemaining: wounds - 1, destroyedByPlayerId },
          })}>− Wound</button>
          <button disabled={wounds >= maximumWounds} onClick={() => dispatch({
            type: 'UNIT_WOUNDS_CHANGED', payload: { playerId: ownerId, unitId: unit.id, woundsRemaining: wounds + 1 },
          })}>+ Wound</button>
          <button className="danger-action" disabled={state.destroyed} onClick={destroy}>Destroyed</button>
        </div>
        <p className="unit-summary">OC{unit.stats?.objectiveControl ?? '—'}</p>
      </> : <div className="unit-actions">
        <button className="danger-action" disabled={state.destroyed} onClick={destroy}>Destroyed</button>
        <button disabled={!state.destroyed} onClick={() => dispatch({
          type: 'UNIT_MODEL_RESTORED', payload: { playerId: ownerId, unitId: unit.id, amount: 1 },
        })}>Restore</button>
      </div>}
      <div className="unit-status-actions"><button onClick={() => dispatch({
        type: 'UNIT_BATTLESHOCK_CHANGED',
        payload: { playerId: ownerId, unitId: unit.id, battleShocked: !state.battleShocked },
      })}>{state.battleShocked ? 'Clear battle-shock' : 'Battle-shocked'}</button></div>
      <details className="unit-details"><summary>Details & quick reference</summary>
        <UnitReference unit={unit} state={state} army={army} ownerId={ownerId} dispatch={dispatch} />
      </details>
    </article>
  )
}

export function ArmyTracker({ session, dispatch }: ArmyTrackerProps) {
  const armyPlayers = session.setup.players.flatMap((player) => {
    const army = player.armyId ? session.setup.armies[player.armyId] : undefined
    return army ? [{ player, army }] : []
  })
  const players = session.state.turnOrder.map((id) => session.state.players[id])
  const rivalPlayerId = session.setup.rulesetId === CAULDRON_RULESET_ID
    ? getCurrentRivalPlayerId(session, session.state.activePlayerId)
    : null
  const rivalHasArmy = armyPlayers.some(({ player }) => player.id === rivalPlayerId)
  const activeHasArmy = armyPlayers.some(({ player }) => player.id === session.state.activePlayerId)
  const preferredPlayerId = rivalHasArmy
    ? rivalPlayerId ?? ''
    : activeHasArmy ? session.state.activePlayerId : armyPlayers[0]?.player.id ?? ''
  const [selectedPlayerId, setSelectedPlayerId] = useState(preferredPlayerId)
  useEffect(() => setSelectedPlayerId(preferredPlayerId), [preferredPlayerId])
  if (armyPlayers.length === 0) return <section className="empty-state"><h2>No army roster attached</h2></section>
  const selected = armyPlayers.find(({ player }) => player.id === selectedPlayerId) ?? armyPlayers[0]
  const playerState = session.state.players[selected.player.id]
  return <div className="army-trackers">
    <nav className="army-player-tabs" aria-label="Choose player army">
      {armyPlayers.map(({ player, army }) => <button
        className={player.id === selected.player.id ? 'selected' : ''}
        aria-pressed={player.id === selected.player.id}
        key={player.id}
        onClick={() => setSelectedPlayerId(player.id)}
      ><span>{player.name}</span><small>{player.id === session.state.activePlayerId
        ? 'Active player'
        : player.id === rivalPlayerId ? 'Rival' : 'Opponent'} · {army.faction}</small></button>)}
    </nav>
    <section key={selected.player.id} className="army-tracker-section">
      <div className="army-heading">
        <div><span className="eyebrow">{selected.player.name} · Zone {selected.player.deploymentZone ?? '—'}</span><h2>{selected.army.faction}</h2></div>
        <strong>{selected.army.totalPoints} pts</strong>
      </div>
      <div className="unit-grid">{selected.army.units.map((unit) => <UnitCard
        key={unit.id}
        unit={unit}
        state={playerState.units[unit.id]}
        army={selected.army}
        ownerId={selected.player.id}
        activePlayerId={session.state.activePlayerId}
        players={players}
        dispatch={dispatch}
      />)}</div>
    </section>
  </div>
}

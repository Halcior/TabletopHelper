import { t as tr } from '../../features/i18n/locale'
import { Link } from 'react-router-dom'
import { ArmyBanner, UnitPortrait } from '../../features/factionVisuals/components'
import { VisualPreferences } from '../../features/factionVisuals/VisualPreferences'
import { useFactionTheme } from '../../features/factionVisuals/preferences'
import { themeStyle, unitRole } from '../../features/factionVisuals/themes'
import { CombatControls } from './CombatControls'
import { AppIcon } from '../AppIcon'
import { useEffect, useMemo, useState } from 'react'
import type { Army, UnitDefinition, UnitState, WeaponProfile } from '../../domain/army/types'
import { getActiveMissionActionForUnit } from '../../domain/battle/missionActions'
import { selectRecentUnits } from '../../domain/battle/recentUnits'
import type { BattleEventInput, BattleSession, CombatAttribution } from '../../domain/battle/types'
import { buildUnitPerformance, performanceKey, type UnitPerformance } from '../../domain/battle/unitPerformance'
import { CombatSourcePicker } from './CombatSourcePicker'
import { CAULDRON_RULESET_ID, getCurrentRivalPlayerId } from '../../rulesets/cauldronFFA3'
import { CAULDRON_SECONDARY_BY_ID } from '../../rulesets/cauldronFFA3/secondaryDefinitions'
import type { SecondaryId } from '../../rulesets/cauldronFFA3/secondaryTypes'

type ArmyTrackerProps = {
  session: BattleSession
  dispatch: (event: BattleEventInput) => void
  preferredPlayerId?: string | null
  sharedMode?: boolean
  viewerPlayerId?: string | null
  secondaryTargetFilter?: SecondaryId | null
  onClearSecondaryTargetFilter?: () => void
}

/** Freeze Quick Access while recording losses so its cards cannot jump under a finger.
 * Refresh is explicitly requested; the full roster always follows import order.
 */
function quickAccessUnitIds(session: BattleSession, playerId: string): string[] {
  const player = session.setup.players.find((entry) => entry.id === playerId)
  const army = player?.armyId ? session.setup.armies[player.armyId] : undefined
  if (!army) return []
  const ids = new Set(army.units.map((unit) => unit.id))
  const recent = selectRecentUnits(session, playerId, 3).map(({ unitId }) => unitId).filter((id) => ids.has(id))
  const available = army.units.filter((unit) => !session.state.players[playerId]?.units[unit.id]?.destroyed).map((unit) => unit.id)
  return [...new Set([...recent, ...available, ...army.units.map((unit) => unit.id)])].slice(0, 3)
}

function matchesSecondaryTarget(unit: UnitDefinition, cardId: SecondaryId): boolean {
  const traits = [...unit.categories, ...unit.keywords].map((value) => value.toLocaleUpperCase())
  if (cardId === 'ZNISZCZ_KOLOSA') return traits.includes('VEHICLE') || traits.includes('MONSTER')
  if (cardId === 'ELIMINACJA_DOWODCY') return traits.includes('CHARACTER')
  return true
}

function Weapons({ title, weapons }: { title: string; weapons: WeaponProfile[] }) {
  if (weapons.length === 0) return null
  return (
    <section className="reference-section">
      <h4>{tr(title)}</h4>
      <div className="weapon-table-wrap">
        <table className="weapon-table">
          <thead><tr><th>{tr("Weapon")}</th><th>{tr("Range")}</th><th>A</th><th>{tr("Skill")}</th><th>S</th><th>{tr("AP")}</th><th>D</th></tr></thead>
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
  canEdit,
}: {
  unit: UnitDefinition
  state: UnitState
  army: Army
  ownerId: string
  dispatch: (event: BattleEventInput) => void
  canEdit: boolean
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
      {stats && <section className="reference-section"><h4>{tr("Statline")}</h4><div className="stat-grid">
        {[
          ['M', stats.movement], ['T', stats.toughness], ['SV', stats.save], ['W', stats.wounds],
          ['LD', stats.leadership], ['OC', stats.objectiveControl], ['INV', stats.invulnerableSave],
        ].map(([label, value]) => <div key={label}><span>{tr(label)}</span><strong>{value ?? '—'}</strong></div>)}
      </div></section>}
      {unit.modelGroups.length > 0 && <section className="reference-section"><h4>{tr("Model groups")}</h4><ul className="plain-list">
        {unit.modelGroups.map((group) => <li key={group.name}><strong>{group.startingCount}× {group.name}</strong>{group.equipment.length > 0 && <span>{group.equipment.join(', ')}</span>}</li>)}
      </ul></section>}
      <Weapons title={tr("Ranged weapons")} weapons={unit.rangedWeapons} />
      <Weapons title={tr("Melee weapons")} weapons={unit.meleeWeapons} />
      {unit.abilities.length > 0 && <details className="reference-details"><summary>{tr("Abilities")}</summary><ul className="ability-list">
        {unit.abilities.map((ability) => {
          const used = state.oncePerBattleAbilities[ability.name] ?? false
          return <li key={`${ability.name}-${ability.description ?? ''}`}>
            <div><strong>{ability.name}</strong>{ability.description && <p>{tr(ability.description)}</p>}</div>
            <button disabled={!canEdit} className={used ? 'button button--danger button--small' : 'button button--small'} onClick={() => dispatch({
              type: 'ABILITY_USED', payload: { playerId: ownerId, unitId: unit.id, abilityName: ability.name, used: !used },
            })}>{used ? tr('Used · restore') : tr('Mark used')}</button>
          </li>
        })}
      </ul></details>}
      {unit.enhancements.length > 0 && <section className="reference-section"><h4>{tr("Enhancements")}</h4><ul className="plain-list">
        {unit.enhancements.map((enhancement) => <li key={enhancement.name}><strong>{enhancement.name} · {enhancement.points} {tr(" pts")}</strong>{enhancement.description && <span>{tr(enhancement.description)}</span>}</li>)}
      </ul></section>}
      {unit.wargear.length > 0 && <section className="reference-section"><h4>{tr("Wargear")}</h4><p>
        {unit.wargear.map((item) => `${item.name}${item.points ? ` (+${item.points} pts)` : ''}`).join(' · ')}
      </p></section>}
      {(leaders.length > 0 || bodyguard) && <section className="reference-section"><h4>{tr("Leader / bodyguard")}</h4>
        {leaders.length > 0 && <p>{tr("Led by: ")}{leaders.join(', ')}</p>}{bodyguard && <p>{tr("Leads: ")}{bodyguard}</p>}
      </section>}
    </div>
  )
}

function UnitCard({
  unit,
  state,
  army,
  ownerId,
  ownerName,
  combatSource,
  performance,
  missionActionName,
  dispatch,
  canEdit,
}: {
  unit: UnitDefinition
  state: UnitState
  army: Army
  ownerId: string
  ownerName: string
  combatSource: CombatAttribution
  performance?: UnitPerformance
  missionActionName?: string
  dispatch: (event: BattleEventInput) => void
  canEdit: boolean
}) {
  const theme = useFactionTheme(army)
  const readOnlyTitle = canEdit ? undefined : `${ownerName} manages this army state on their device.`
  const recordBattleShock = (passed: boolean) => {
    if (!canEdit) return
    dispatch({ type: 'BATTLESHOCK_TEST_RESOLVED', payload: { playerId: ownerId, unitId: unit.id, passed } })
  }

  return (
    <article style={themeStyle(theme)} id={`unit-card-${ownerId}-${unit.id}`} className={`unit-card${state.destroyed ? ' is-destroyed' : ''}${canEdit ? '' : ' unit-card--readonly'}`}>
      <div className="unit-card__header">
        <div className="unit-card__identity"><UnitPortrait army={army} unit={unit} /><div><h3>{unit.name}</h3><p>{unitRole(unit)} · {unit.points} {tr(" pts")}{unit.isWarlord ? tr(' · Warlord') : ''}</p></div></div>
        <span className={`unit-state${state.destroyed ? ' unit-state--destroyed' : ''}`}>{state.destroyed ? tr('Destroyed') : tr('Alive')}</span>
        {state.battleShocked && <span className="status-badge status-badge--danger">{tr("Battle-shocked")}</span>}
      </div>
      {missionActionName && <div className="unit-mission-action"><span>{tr("Mission Action")}</span><strong>{missionActionName}</strong><small>{tr("Cannot Shoot or declare a charge this turn.")}</small></div>}
      {!canEdit && <p className="shared-readonly-note">{tr("Read only on this device · ")}{ownerName} {tr(" records this unit's state.")}</p>}
      <CombatControls unit={unit} state={state} playerId={ownerId} source={combatSource} dispatch={dispatch} canEdit={canEdit} />
      <div className="unit-battleshock-actions">
        <span>{tr("Battle-shock test")}</span>
        <div>
          <button disabled={!canEdit || state.destroyed} title={readOnlyTitle} onClick={() => recordBattleShock(true)}>{tr("Passed")}</button>
          <button className="danger-action" disabled={!canEdit || state.destroyed} title={readOnlyTitle} onClick={() => recordBattleShock(false)}>{tr("Failed")}</button>
          {state.battleShocked && <button disabled={!canEdit} title={readOnlyTitle} onClick={() => dispatch({
            type: 'UNIT_BATTLESHOCK_CHANGED',
            payload: { playerId: ownerId, unitId: unit.id, battleShocked: false },
          })}>{tr("Clear state")}</button>}
        </div>
        <details className="unit-timing-help"><summary>{tr("Test timing")}</summary><small>{tr("Pass/Fail records an exact test timing. Clear state only removes the status.")}</small></details>
      </div>
      <details className="unit-details"><summary>{tr("Details & quick reference")}</summary>
        <UnitReference unit={unit} state={state} army={army} ownerId={ownerId} dispatch={dispatch} canEdit={canEdit} />
      </details>
      {performance && <details className="unit-performance-inline"><summary>{tr("Battle performance · ")}{performance.kills} {tr(" kills · ")}{Math.round(performance.enemyPointsDestroyed)} {tr(" pts")}</summary>
        <p>{tr("Effective damage: ")}{performance.damageDealt ?? tr('Unknown')} {tr(" W · received: ")}{performance.damageReceived ?? tr('Unknown')} {tr(" W (partial). Healed: ")}{performance.woundsHealed} {tr(" W · restored: ")}{performance.modelsRestored} {tr(" models.")}</p>
        <p>{performance.modelsDestroyed} {tr(" enemy models · ")}{performance.combatRoi === null ? '—' : tr(`${Math.round(performance.combatRoi)}%`, "{0}%")} {tr(" Combat ROI · ")}{performance.completedMissionActions} {tr(" completed actions")}</p>
        <small>{tr("Net model value; equal points per starting model. Full comparison is in Battle Report.")}</small>
      </details>}
    </article>
  )
}

function QuickUnitControl({
  unit,
  state,
  ownerId,
  combatSource,
  dispatch,
  canEdit,
  onOpen,
}: {
  unit: UnitDefinition
  state: UnitState
  ownerId: string
  combatSource: CombatAttribution
  dispatch: (event: BattleEventInput) => void
  canEdit: boolean
  onOpen: () => void
}) {
  const maximumWounds = unit.stats?.wounds
  const wounds = state.woundsRemaining ?? maximumWounds ?? 0
  const multiModel = unit.startingModels > 1
  const vital = multiModel
    ? `${state.modelsAlive}/${unit.startingModels} models`
    : maximumWounds ? `${wounds}/${maximumWounds} W` : state.destroyed ? 'Destroyed' : 'Active'

  return <article className={`recent-unit${state.destroyed ? ' is-destroyed' : ''}`}>
    <button className="recent-unit__identity" type="button" onClick={onOpen}>
      <strong>{unit.name}</strong>
      <span>{vital}</span>
    </button>
    <CombatControls unit={unit} state={state} playerId={ownerId} source={combatSource} dispatch={dispatch} canEdit={canEdit} compact />
  </article>
}

export function ArmyTracker({
  session,
  dispatch,
  preferredPlayerId,
  sharedMode = false,
  viewerPlayerId = null,
  secondaryTargetFilter,
  onClearSecondaryTargetFilter,
}: ArmyTrackerProps) {
  const armyPlayers = session.setup.players.flatMap((player) => {
    const army = player.armyId ? session.setup.armies[player.armyId] : undefined
    return army ? [{ player, army }] : []
  })
  const performance = useMemo(() => buildUnitPerformance(session), [session])
  const performanceByUnit = useMemo(() => new Map(performance.units.map((unit) => [performanceKey(unit.playerId, unit.unitId), unit])), [performance])
  const [sources, setSources] = useState<Record<string, CombatAttribution>>({})
  const [lastUnits, setLastUnits] = useState<Record<string, string | null>>({})
  const [quickAccessByPlayer, setQuickAccessByPlayer] = useState<Record<string, string[]>>(
    () => Object.fromEntries(session.setup.players.map((player) => [player.id, quickAccessUnitIds(session, player.id)])),
  )
  // Switching to another battle starts new shortcuts; combat events do not reshuffle them.
  useEffect(() => {
    setQuickAccessByPlayer(Object.fromEntries(session.setup.players.map((player) => [player.id, quickAccessUnitIds(session, player.id)])))
  }, [session.setup.gameId])
  const rivalPlayerId = session.setup.rulesetId === CAULDRON_RULESET_ID
    ? getCurrentRivalPlayerId(session, session.state.activePlayerId)
    : null
  const requestedHasArmy = Boolean(preferredPlayerId && armyPlayers.some(({ player }) => player.id === preferredPlayerId))
  const rivalHasArmy = armyPlayers.some(({ player }) => player.id === rivalPlayerId)
  const activeHasArmy = armyPlayers.some(({ player }) => player.id === session.state.activePlayerId)
  const defaultPlayerId = requestedHasArmy
    ? preferredPlayerId ?? ''
    : rivalHasArmy
      ? rivalPlayerId ?? ''
      : activeHasArmy ? session.state.activePlayerId : armyPlayers[0]?.player.id ?? ''
  const [selectedPlayerId, setSelectedPlayerId] = useState(defaultPlayerId)
  useEffect(() => setSelectedPlayerId(defaultPlayerId), [defaultPlayerId])
  if (armyPlayers.length === 0) return <section className="empty-state"><h2>{tr("No army roster attached")}</h2></section>
  const selected = armyPlayers.find(({ player }) => player.id === selectedPlayerId) ?? armyPlayers[0]
  const sourceKey = `${session.setup.gameId}:${session.state.activePlayerId}:${selected.player.id}`
  const source = sources[sourceKey] ?? { destroyedByPlayerId: session.state.activePlayerId === selected.player.id ? null : session.state.activePlayerId }
  const attackerId = source.destroyedByPlayerId
  const recentAttack = attackerId ? [...session.state.events].reverse().find((event) => (event.type === 'UNIT_COMBAT_RESOLVED' || event.type === 'UNIT_DESTROYED' || event.type === 'UNIT_MODEL_DESTROYED' || event.type === 'UNIT_WOUNDS_CHANGED') && event.payload.destroyedByPlayerId === attackerId && event.payload.attackerUnitId) : undefined
  const suggestedUnit = recentAttack && 'attackerUnitId' in recentAttack.payload ? recentAttack.payload.attackerUnitId : null
  const chosenUnit = attackerId ? Object.hasOwn(lastUnits, attackerId) ? lastUnits[attackerId] : suggestedUnit : null
  const combatSource: CombatAttribution = { ...source, attackerUnitId: chosenUnit && !session.state.players[attackerId ?? '']?.units[chosenUnit]?.destroyed ? chosenUnit : null }
  const playerState = session.state.players[selected.player.id]
  const canEditSelectedArmy = !sharedMode || selected.player.id === viewerPlayerId
  const filterRivalTargets = Boolean(secondaryTargetFilter && selected.player.id === rivalPlayerId)
  const filteredUnits = filterRivalTargets && secondaryTargetFilter
    ? selected.army.units.filter((unit) => (
      !playerState.units[unit.id].destroyed && matchesSecondaryTarget(unit, secondaryTargetFilter)
    ))
    : selected.army.units
  // Stable roster order: receiving damage must never move an interactive card.
  const visibleUnits = filteredUnits
  // Shortcuts are pinned until explicitly refreshed, avoiding movement in both
  // Quick Access and the main card grid while repeatedly tapping Wound controls.
  const quickUnitIds = quickAccessByPlayer[selected.player.id] ?? quickAccessUnitIds(session, selected.player.id)
  const quickUnits = filterRivalTargets
    ? []
    : quickUnitIds.flatMap((unitId) => selected.army.units.find((unit) => unit.id === unitId) ?? [])

  function openUnitCard(unitId: string) {
    document.getElementById(`unit-card-${selected.player.id}-${unitId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return <div className="army-trackers">
    <nav className="army-player-tabs" aria-label={tr("Choose player army")}>
      {armyPlayers.map(({ player, army }) => <button
        className={player.id === selected.player.id ? 'selected' : ''}
        aria-pressed={player.id === selected.player.id}
        key={player.id}
        onClick={() => setSelectedPlayerId(player.id)}
      ><span>{player.name}{sharedMode && player.id === viewerPlayerId ? tr(' · You') : ''}</span><small>{player.id === session.state.activePlayerId
        ? tr('Active player')
        : player.id === rivalPlayerId ? tr('Rival') : tr('Opponent')} · {army.faction}</small></button>)}
    </nav>
    <section key={selected.player.id} className="army-tracker-section">
      <ArmyBanner army={selected.army} label={selected.player.name} />
      <VisualPreferences army={selected.army} />
      <Link className="army-appearance-link no-print" to={`/army/${encodeURIComponent(selected.army.id)}/appearance?battleId=${encodeURIComponent(session.setup.gameId)}`}>{tr("Appearance & photos")}</Link>
      <div className="army-heading">
        <div><span className="eyebrow">{selected.player.name} {tr(" · Zone ")}{selected.player.deploymentZone ?? '—'}</span><h2>{selected.army.faction}</h2></div>
        <strong>{selected.army.totalPoints} {tr(" pts")}</strong>
      </div>
      {sharedMode && !canEditSelectedArmy && <div className="shared-army-readonly"><strong>{tr("Opponent army · read only")}</strong><span>{selected.player.name} {tr(" records casualties, wounds, battle-shock and abilities on their device.")}</span></div>}
      <CombatSourcePicker session={session} targetPlayerId={selected.player.id} value={combatSource} disabled={!canEditSelectedArmy} onChange={(value) => {
        setSources((current) => ({ ...current, [sourceKey]: value }))
        if (value.destroyedByPlayerId && value.attackerUnitId !== undefined) setLastUnits((current) => ({ ...current, [value.destroyedByPlayerId!]: value.attackerUnitId ?? null }))
      }} />
      {filterRivalTargets && secondaryTargetFilter && <div className="army-target-filter" role="status">
        <span><strong>{tr("Targets for ")}{CAULDRON_SECONDARY_BY_ID[secondaryTargetFilter].name}</strong><small>{visibleUnits.length} {tr(" eligible Rival unit")}{visibleUnits.length === 1 ? '' : 's'} {tr(" remaining.")}</small></span>
        <button onClick={onClearSecondaryTargetFilter}>{tr("Show all units")}</button>
      </div>}
      {quickUnits.length > 0 && <section className="recent-units" aria-label={tr("Quick unit access")}>
        <div className="recent-units__heading">
          <div><span className="eyebrow">{tr("Quick access")}</span><h3>{tr("Units")}</h3></div>
          <small>{tr("Shortcuts stay fixed while you record damage.")}</small>
          <button type="button" className="button button--small" aria-label={tr(`Refresh quick access for ${selected.player.name}`, "Refresh quick access for {0}")} onClick={() => setQuickAccessByPlayer((current) => ({
            ...current, [selected.player.id]: quickAccessUnitIds(session, selected.player.id),
          }))}>{tr("Refresh")}</button>
        </div>
        <div className="recent-unit-list">{quickUnits.map((unit) => <QuickUnitControl
          key={unit.id}
          unit={unit}
          state={playerState.units[unit.id]}
          ownerId={selected.player.id}
          combatSource={combatSource}
          dispatch={dispatch}
          canEdit={canEditSelectedArmy}
          onOpen={() => openUnitCard(unit.id)}
        />)}</div>
      </section>}
      <div className="unit-grid">{visibleUnits.map((unit) => <UnitCard
        key={unit.id}
        unit={unit}
        state={playerState.units[unit.id]}
        army={selected.army}
        ownerId={selected.player.id}
        ownerName={selected.player.name}
        combatSource={combatSource}
        performance={performanceByUnit.get(performanceKey(selected.player.id, unit.id))}
        missionActionName={getActiveMissionActionForUnit(session, selected.player.id, unit.id)?.name}
        dispatch={dispatch}
        canEdit={canEditSelectedArmy}
      />)}</div>
      {filterRivalTargets && visibleUnits.length === 0 && <p className="context-note">{tr("No eligible Rival targets remain.")}</p>}
    </section>
  </div>
}

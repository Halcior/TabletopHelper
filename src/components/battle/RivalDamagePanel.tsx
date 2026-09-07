import { useEffect, useMemo, useState } from 'react'
import type { BattleEvent, BattleEventInput, BattleSession } from '../../domain/battle/types'
import { CAULDRON_SECONDARY_BY_ID } from '../../rulesets/cauldronFFA3/secondaryDefinitions'
import type { SecondaryId } from '../../rulesets/cauldronFFA3/secondaryTypes'
import { useBattleStore } from '../../stores/battleStore'

type DamageNotice = {
  title: string
  victimPlayerId: string
  unitId: string
  eventCountBefore: number
  resolved: boolean
  actionId?: string
  unitDestroyed?: boolean
  secondaryResults?: Array<{ name: string; vp: number }>
  secondaryChoiceRequired?: boolean
}

function casualtyEvent(event: BattleEvent, attackerPlayerId: string, victimPlayerId: string, unitId: string): boolean {
  if (event.type !== 'UNIT_MODEL_DESTROYED' && event.type !== 'UNIT_WOUNDS_CHANGED' && event.type !== 'UNIT_DESTROYED') return false
  return event.payload.playerId === victimPlayerId
    && event.payload.unitId === unitId
    && event.payload.destroyedByPlayerId === attackerPlayerId
}

function secondaryResults(events: BattleEvent[], playerId: string): Array<{ name: string; vp: number }> {
  return events.flatMap((event) => {
    if (event.type !== 'RULESET_EVENT' || event.payload.action !== 'SECONDARY_COMPLETED') return []
    const data = event.payload.data
    if (!data || typeof data !== 'object') return []
    const typed = data as { playerId?: unknown; cardId?: unknown; pointsAwarded?: unknown }
    if (typed.playerId !== playerId || typeof typed.cardId !== 'string' || typeof typed.pointsAwarded !== 'number') return []
    if (!(typed.cardId in CAULDRON_SECONDARY_BY_ID)) return []
    const cardId = typed.cardId as SecondaryId
    return [{ name: CAULDRON_SECONDARY_BY_ID[cardId].name, vp: typed.pointsAwarded }]
  })
}

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
  const [notice, setNotice] = useState<DamageNotice | null>(null)
  const undo = useBattleStore((state) => state.undo)

  useEffect(() => {
    if (!opponentIds.includes(victimPlayerId)) setVictimPlayerId(defaultVictimId)
  }, [defaultVictimId, opponentIds, victimPlayerId])

  useEffect(() => {
    setQuery('')
  }, [victimPlayerId])

  useEffect(() => {
    if (!notice || notice.resolved || session.state.events.length <= notice.eventCountBefore) return
    const generated = session.state.events.slice(notice.eventCountBefore)
    const casualty = generated.find((event) => casualtyEvent(event, attackerPlayerId, notice.victimPlayerId, notice.unitId))
    if (!casualty) return
    const results = secondaryResults(generated, attackerPlayerId)
    const choiceRequired = generated.some((event) => (
      event.type === 'RULESET_EVENT'
      && event.payload.action === 'SECONDARY_ELIMINATION_CHOICE_REQUIRED'
      && typeof event.payload.data === 'object'
      && event.payload.data !== null
      && 'playerId' in event.payload.data
      && (event.payload.data as { playerId?: unknown }).playerId === attackerPlayerId
    ))
    setNotice((current) => current ? {
      ...current,
      resolved: true,
      actionId: casualty.actionId,
      unitDestroyed: session.state.players[current.victimPlayerId]?.units[current.unitId]?.destroyed ?? false,
      secondaryResults: results,
      secondaryChoiceRequired: choiceRequired,
    } : null)
  }, [attackerPlayerId, notice, session])

  useEffect(() => {
    if (!notice?.resolved) return
    const timeout = window.setTimeout(() => setNotice(null), 6500)
    return () => window.clearTimeout(timeout)
  }, [notice?.actionId, notice?.resolved])

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

  function beginNotice(unitId: string, title: string) {
    setNotice({
      title,
      victimPlayerId,
      unitId,
      eventCountBefore: session.state.events.length,
      resolved: false,
    })
  }

  function loseModel(unitId: string, unitName: string) {
    beginNotice(unitId, `${unitName} · −1 model`)
    dispatch({
      type: 'UNIT_MODEL_DESTROYED',
      payload: { playerId: victimPlayerId, unitId, amount: 1, destroyedByPlayerId: attackerPlayerId },
    })
  }

  function loseWounds(unitId: string, unitName: string, current: number, amount: number) {
    beginNotice(unitId, `${unitName} · −${Math.min(amount, current)}W`)
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

  function destroyUnit(unitId: string, unitName: string) {
    beginNotice(unitId, `${unitName} · destroyed`)
    dispatch({
      type: 'UNIT_DESTROYED',
      payload: { playerId: victimPlayerId, unitId, destroyedByPlayerId: attackerPlayerId },
    })
  }

  const latestActionId = session.state.events.at(-1)?.actionId
  const noticeUndoAvailable = Boolean(notice?.resolved && notice.actionId && notice.actionId === latestActionId)

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
              {multiModel ? <button type="button" disabled={state.modelsAlive <= 0} onClick={() => loseModel(unit.id, unit.name)}>−1 model</button> : maximumWounds ? <>
                <button type="button" disabled={wounds <= 0} onClick={() => loseWounds(unit.id, unit.name, wounds, 1)}>−1W</button>
                <button type="button" disabled={wounds <= 0} onClick={() => loseWounds(unit.id, unit.name, wounds, 3)}>−3W</button>
              </> : null}
              <button type="button" className="danger-action" disabled={state.destroyed} onClick={() => destroyUnit(unit.id, unit.name)}>Destroyed</button>
            </div>
          </article>
        })}
        {units.length === 0 && <p className="context-note">No matching active enemy units.</p>}
      </div>
    </> : <p className="context-note">This opponent has no army roster attached.</p>}

    <p className="rival-damage-panel__note">Any opponent can be attacked in FFA. The Rival only determines which opponent counts for Rival-specific scoring. The army owner still controls healing, Battle-shock, abilities and corrections.</p>

    {notice && <div className={`battle-action-toast${notice.unitDestroyed ? ' battle-action-toast--kill' : ''}`} role="status" aria-live="polite">
      <div className="battle-action-toast__body">
        <strong>{notice.resolved ? 'Recorded' : 'Recording…'}</strong>
        <span>{notice.title}</span>
        {notice.unitDestroyed && <small>Unit destroyed · kill credited to {attacker.name}</small>}
        {notice.secondaryResults?.map((result, index) => <small className="battle-action-toast__score" key={`${result.name}-${index}`}>✓ {result.name} completed · +{result.vp} VP</small>)}
        {notice.secondaryChoiceRequired && <small className="battle-action-toast__score">Secondary scoring choice required.</small>}
      </div>
      {noticeUndoAvailable && <button type="button" onClick={() => { undo(); setNotice(null) }}>Undo</button>}
    </div>}
  </section>
}

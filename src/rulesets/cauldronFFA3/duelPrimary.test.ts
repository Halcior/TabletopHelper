import { describe, expect, it } from 'vitest'
import { dispatchBattleEvents } from '../../domain/battle/engine'
import { authorizeSharedMutation } from '../../multiplayer/sharedEventPolicy'
import { testArmy } from './cauldronTestUtils'
import {
  DISPOSITIONS, DUEL_MISSIONS, DUEL_PRIMARY_MATRIX, duelPrimaryPreview, getDuelConditions,
  getDuelMission, hasDuelOwnTurnCommit, reviewDuelPrimary, confirmDuelBattleReady,
} from './duelPrimary'
import { OFFICIAL_SECONDARY_IDS } from './officialSecondaryDefinitions'
import { acknowledgeOfficialWindow, officialPendingReviewPlayers } from './officialSecondary'
import { confirmCauldronEndRound } from './roundEnd'
import { advanceCauldronPhase, createCauldronGame } from './session'
import { getSecondaryState } from './secondary'

function game(left: typeof DISPOSITIONS[number] = 'take-and-hold', right: typeof DISPOSITIONS[number] = 'purge-the-foe') {
  return createCauldronGame({
    gameId: 'duel-primary-test', createdAt: '2026-09-28T12:00:00.000Z', guidanceLevel: 'guided',
    primaryDeck: 'chapter-approved-duel', secondaryDeck: 'chapter-approved', mode: 'duel',
    officialSecondaryStrategies: { 'p-a': 'fixed', 'p-b': 'tactical' },
    fixedSecondarySelections: { 'p-a': ['OFFICIAL_A_GRIEVOUS_BLOW', 'OFFICIAL_ENGAGE_ON_ALL_FRONTS'] },
    secondaryDeckOrders: { 'p-b': OFFICIAL_SECONDARY_IDS },
    armies: [testArmy('army-a'), testArmy('army-b')],
    players: [
      { id: 'p-a', name: 'Alpha', armyId: 'army-a', deploymentZone: 'A', turnPosition: 1, operationalPlanId: 'WYNISZCZENIE', forceDisposition: left },
      { id: 'p-b', name: 'Bravo', armyId: 'army-b', deploymentZone: 'B', turnPosition: 2, operationalPlanId: 'WYNISZCZENIE', forceDisposition: right },
    ],
  })
}

describe('11th edition official duel', () => {
  it('maps every ordered Force Disposition pairing to one of 25 distinct cards', () => {
    expect(Object.keys(DUEL_MISSIONS)).toHaveLength(25)
    expect(new Set(DISPOSITIONS.flatMap((own) => DISPOSITIONS.map((enemy) => DUEL_PRIMARY_MATRIX[own][enemy]))).size).toBe(25)
    for (const own of DISPOSITIONS) for (const enemy of DISPOSITIONS) {
      const session = game(own, enemy)
      expect(getDuelMission(session, 'p-a').name).toBe(DUEL_PRIMARY_MATRIX[own][enemy])
      expect(getDuelMission(session, 'p-b').name).toBe(DUEL_PRIMARY_MATRIX[enemy][own])
      expect(getDuelMission(session, 'p-a').url).toContain(`/primary-missions/${own}/`)
      expect(getDuelMission(session, 'p-a').conditions.length).toBeGreaterThan(0)
    }
  })

  it('scores at Command from round 2, moving Command checks to turn end in round 5', () => {
    let session = game('take-and-hold', 'take-and-hold')
    expect(getDuelConditions(session, 'p-a', 'command')).toEqual([])
    session = dispatchBattleEvents(session, [{ type: 'ROUND_STARTED', payload: { round: 2 } }])
    expect(getDuelConditions(session, 'p-a', 'command').map((item) => item.id)).toEqual(['held', 'outside-home'])
    session = reviewDuelPrimary(session, 'p-a', 'command', { held: 3, 'outside-home': 2 })
    expect(session.state.players['p-a'].score.primary).toBe(13)
    expect(() => reviewDuelPrimary(session, 'p-a', 'command', {})).toThrow(/already been reviewed/)
    expect(() => duelPrimaryPreview(session, 'p-a', 'command', { held: 1, 'outside-home': 2 })).toThrow(/base condition/)
    session = dispatchBattleEvents(session, [{ type: 'ROUND_STARTED', payload: { round: 5 } }])
    expect(getDuelConditions(session, 'p-a', 'command')).toEqual([])
    expect(getDuelConditions(session, 'p-a', 'turn').map((item) => item.id)).toEqual(['held', 'outside-home'])
  })

  it('limits the first-round Outmanoeuvre award to 15 VP and prevents replay', () => {
    let session = game('disruption', 'disruption')
    session = dispatchBattleEvents(session, [{ type: 'PHASE_CHANGED', payload: { phase: 'END_TURN' } }])
    const preview = duelPrimaryPreview(session, 'p-a', 'turn', { 'enemy-home': 1, 'held-first': 3 })
    expect(preview).toMatchObject({ raw: 22, awarded: 15 })
    session = reviewDuelPrimary(session, 'p-a', 'turn', { 'enemy-home': 1, 'held-first': 3 })
    expect(session.state.players['p-a'].score.primary).toBe(15)
    expect(hasDuelOwnTurnCommit(session, 'p-a')).toBe(true)
    expect(() => reviewDuelPrimary(session, 'p-a', 'turn', {})).toThrow(/already been reviewed/)
  })

  it('draws Tactical cards for the second player at their first Command, independently of Fixed cards', () => {
    let session = game()
    expect(getSecondaryState(session)['p-a'].active).toHaveLength(2)
    expect(getSecondaryState(session)['p-b'].active).toHaveLength(0)
    expect(() => reviewDuelPrimary(session, 'p-a', 'command', {})).toThrow(/not open/)
    session = advanceCauldronPhase(session)
    session = dispatchBattleEvents(session, [{ type: 'PHASE_CHANGED', payload: { phase: 'END_TURN' } }])
    session = reviewDuelPrimary(session, 'p-a', 'turn', {})
    for (const id of officialPendingReviewPlayers(session)) session = acknowledgeOfficialWindow(session, id)
    session = advanceCauldronPhase(session)
    expect(session.state.activePlayerId).toBe('p-b')
    expect(session.state.phase).toBe('COMMAND')
    expect(getSecondaryState(session)['p-b'].active).toHaveLength(2)
    expect(getSecondaryState(session)['p-a'].active).toHaveLength(2)
  })

  it('requires both player Primary reviews before the round closes; opponent reviews Punishment separately', () => {
    let session = game('purge-the-foe', 'disruption')
    session = dispatchBattleEvents(session, [{ type: 'PHASE_CHANGED', payload: { phase: 'END_TURN' } }])
    session = reviewDuelPrimary(session, 'p-a', 'turn', {})
    session = dispatchBattleEvents(session, [{ type: 'TURN_STARTED', payload: { playerId: 'p-b' } }, { type: 'PHASE_CHANGED', payload: { phase: 'END_TURN' } }])
    expect(getDuelConditions(session, 'p-a', 'turn').map((item) => item.id)).toEqual(['condemned'])
    session = reviewDuelPrimary(session, 'p-b', 'turn', {})
    for (const id of officialPendingReviewPlayers(session)) session = acknowledgeOfficialWindow(session, id)
    expect(() => confirmCauldronEndRound(session)).toThrow(/end-turn Primary/)
    session = reviewDuelPrimary(session, 'p-a', 'turn', { condemned: 1 })
    expect(session.state.players['p-a'].score.primary).toBe(5)
    session = confirmCauldronEndRound(session)
    expect(session.state.round).toBe(2)
  })

  it('does not score Punishment before that commander has condemned any units at the start of their first turn', () => {
    let session = game('disruption', 'purge-the-foe')
    session = dispatchBattleEvents(session, [{ type: 'PHASE_CHANGED', payload: { phase: 'END_TURN' } }])
    expect(getDuelConditions(session, 'p-b', 'turn')).toEqual([])
    expect(() => reviewDuelPrimary(session, 'p-b', 'turn', { condemned: 1 })).toThrow(/no opponent-turn Primary/)
    session = dispatchBattleEvents(session, [{ type: 'TURN_STARTED', payload: { playerId: 'p-b' } }])
    expect(getDuelConditions(session, 'p-b', 'turn').some((condition) => condition.id === 'condemned')).toBe(true)
  })

  it('lets a shared player confirm only their own opponent-turn Primary', () => {
    let session = game('purge-the-foe', 'disruption')
    session = dispatchBattleEvents(session, [{ type: 'TURN_STARTED', payload: { playerId: 'p-b' } }, { type: 'PHASE_CHANGED', payload: { phase: 'END_TURN' } }])
    const after = reviewDuelPrimary(session, 'p-a', 'turn', { condemned: 1 })
    const membership = { battleId: session.setup.gameId, roomCode: 'ABC123', playerId: 'p-a', isHost: false } as Parameters<typeof authorizeSharedMutation>[2]
    expect(authorizeSharedMutation(session, after, membership).allowed).toBe(true)
    expect(authorizeSharedMutation(session, after, { ...membership!, playerId: 'p-b' }).allowed).toBe(false)
  })

  it('closes the fifth round only after battle scoring and each Battle Ready decision', () => {
    let session = game()
    expect((session.setup.rulesetConfig as { totalCap: number }).totalCap).toBe(100)
    session = dispatchBattleEvents(session, [
      { type: 'ROUND_STARTED', payload: { round: 5 } },
      { type: 'PHASE_CHANGED', payload: { phase: 'END_TURN' } },
    ])
    session = reviewDuelPrimary(session, 'p-a', 'turn', { 'held-fifth': 1 })
    session = dispatchBattleEvents(session, [
      { type: 'TURN_STARTED', payload: { playerId: 'p-b' } },
      { type: 'PHASE_CHANGED', payload: { phase: 'END_TURN' } },
    ])
    session = reviewDuelPrimary(session, 'p-b', 'turn', { kill: 0 })
    for (const id of officialPendingReviewPlayers(session)) session = acknowledgeOfficialWindow(session, id)
    expect(() => confirmCauldronEndRound(session)).toThrow(/end-of-battle Primary/)
    session = reviewDuelPrimary(session, 'p-a', 'battle', {})
    session = reviewDuelPrimary(session, 'p-b', 'battle', { 'central-battle': 1 })
    expect(() => confirmCauldronEndRound(session)).toThrow(/Battle Ready/)
    const beforeReady = session
    session = confirmDuelBattleReady(session, 'p-a', true)
    expect(authorizeSharedMutation(beforeReady, session, {
      battleId: session.setup.gameId, roomCode: 'ABC123', playerId: 'p-b', isHost: false,
    } as Parameters<typeof authorizeSharedMutation>[2]).allowed).toBe(true)
    session = confirmDuelBattleReady(session, 'p-b', false)
    expect(() => confirmDuelBattleReady(session, 'p-a', true)).toThrow(/once/)
    session = confirmCauldronEndRound(session)
    expect(session.state.status).toBe('completed')
    expect(session.state.players['p-a'].score.adjustment).toBe(10)
    expect(session.state.players['p-b'].score.adjustment).toBe(0)
  })
})

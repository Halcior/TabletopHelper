import { describe, expect, it } from 'vitest'
import { deserializeBattleSession, dispatchBattleEvent, dispatchBattleEvents, serializeBattleSession } from '../../domain/battle/engine'
import type { BattleSession } from '../../domain/battle/types'
import { authorizeSharedMutation } from '../../multiplayer/sharedEventPolicy'
import type { SharedMembership } from '../../multiplayer/types'
import { testArmy } from './cauldronTestUtils'
import { OFFICIAL_SECONDARY_DEFINITIONS, OFFICIAL_SECONDARY_IDS } from './officialSecondaryDefinitions'
import {
  acknowledgeOfficialWindow, canScoreOfficialSecondary, discardOfficialAtEndTurn, officialActionCount,
  officialPendingReviewPlayers, replaceOfficialSecondary, scoreOfficialSecondary, startOfficialSecondaryAction,
} from './officialSecondary'
import { createSecondaryRefillEvents, getRoundSecondaryVp, getSecondaryState } from './secondary'
import { createCauldronGame } from './session'
import type { OfficialSecondaryId } from './secondaryTypes'

function ordered(...first: OfficialSecondaryId[]): OfficialSecondaryId[] {
  return [...first, ...OFFICIAL_SECONDARY_IDS.filter((id) => !first.includes(id))]
}

function game(first: OfficialSecondaryId[], strategy: 'tactical' | 'fixed' = 'tactical', ffa = false): BattleSession {
  const armies = [testArmy('army-a'), testArmy('army-b'), ...(ffa ? [testArmy('army-c')] : [])]
  return createCauldronGame({
    gameId: 'official-test', createdAt: '2026-09-28T00:00:00.000Z', guidanceLevel: 'guided',
    secondaryDeck: 'chapter-approved', officialSecondaryStrategy: strategy,
    fixedSecondarySelections: strategy === 'fixed' ? Object.fromEntries(armies.map((_, index) => [
      `p-${'abc'[index]}`, [first[0], first[1]],
    ])) : undefined,
    secondaryDeckOrders: strategy === 'tactical' ? Object.fromEntries(armies.map((_, index) => [
      `p-${'abc'[index]}`, ordered(...first),
    ])) : undefined,
    armies,
    players: armies.map((army, index) => ({
      id: `p-${'abc'[index]}`, name: `Player ${index + 1}`, armyId: army.id,
      deploymentZone: 'ABC'[index] as 'A' | 'B' | 'C', turnPosition: (index + 1) as 1 | 2 | 3,
      operationalPlanId: 'WYNISZCZENIE',
    })),
  })
}

function phase(session: BattleSession, phaseName: 'SHOOTING' | 'END_TURN'): BattleSession {
  const phases = ['MOVEMENT', 'SHOOTING', 'CHARGE', 'FIGHT', 'END_TURN'] as const
  let current = session
  for (const next of phases) {
    current = dispatchBattleEvent(current, { type: 'PHASE_CHANGED', payload: { phase: next } })
    if (next === phaseName) return current
  }
  return current
}

function membership(playerId: string): SharedMembership {
  return { roomId: 'room', roomCode: 'ABC234', battleId: 'official-test', clientId: playerId, playerId, isHost: playerId === 'p-a' }
}

describe('Chapter Approved Secondary deck', () => {
  it('contains 18 unique cards and exactly four Fixed options', () => {
    expect(OFFICIAL_SECONDARY_DEFINITIONS).toHaveLength(18)
    expect(new Set(OFFICIAL_SECONDARY_IDS).size).toBe(18)
    expect(OFFICIAL_SECONDARY_DEFINITIONS.filter((card) => card.fixed)).toHaveLength(4)
  })

  it('draws two initially and two each later Command phase, keeping the rest of the hand', () => {
    const session = game(['OFFICIAL_NO_PRISONERS', 'OFFICIAL_CENTRE_GROUND', 'OFFICIAL_OUTFLANK', 'OFFICIAL_CLEANSE'])
    expect(getSecondaryState(session)['p-a'].active).toHaveLength(2)
    expect(getSecondaryState(session)['p-a'].deck).toHaveLength(16)
    // Player B has their first two cards already; their first Command is not a second draw.
    expect(createSecondaryRefillEvents(session, 'p-b', 1)).toHaveLength(0)
    const newTurn = dispatchBattleEvent(session, { type: 'TURN_STARTED', payload: { playerId: 'p-a' } })
    const refill = createSecondaryRefillEvents(newTurn, 'p-a', 2)
    expect(refill.filter((event) => event.type === 'RULESET_EVENT' && event.payload.action === 'SECONDARY_DRAWN')).toHaveLength(2)
    const after = dispatchBattleEvents(newTurn, refill)
    expect(getSecondaryState(after)['p-a'].active.map((card) => card.cardId)).toEqual([
      'OFFICIAL_NO_PRISONERS', 'OFFICIAL_CENTRE_GROUND', 'OFFICIAL_OUTFLANK', 'OFFICIAL_CLEANSE',
    ])
    expect(getSecondaryState(deserializeBattleSession(serializeBattleSession(after)))['p-a']).toEqual(getSecondaryState(after)['p-a'])
  })

  it('automatically replaces Defend Stronghold in round one and offers its card-specific redraws', () => {
    const session = game(['OFFICIAL_DEFEND_STRONGHOLD', 'OFFICIAL_BEHIND_ENEMY_LINES', 'OFFICIAL_NO_PRISONERS', 'OFFICIAL_CENTRE_GROUND'])
    expect(getSecondaryState(session)['p-a'].active.map((card) => card.cardId)).toEqual(['OFFICIAL_BEHIND_ENEMY_LINES', 'OFFICIAL_NO_PRISONERS'])
    expect(getSecondaryState(session)['p-a'].discarded.map((card) => card.cardId)).toEqual(['OFFICIAL_DEFEND_STRONGHOLD'])
    const redrawn = replaceOfficialSecondary(session, 'p-a', 'OFFICIAL_BEHIND_ENEMY_LINES')
    expect(getSecondaryState(redrawn)['p-a'].active.map((card) => card.cardId)).toEqual(['OFFICIAL_NO_PRISONERS', 'OFFICIAL_CENTRE_GROUND'])
  })

  it('scores on eligible turn ends, enforces 15/45 VP caps and synchronizes an opponent turn score', () => {
    let session = phase(game(['OFFICIAL_NO_PRISONERS', 'OFFICIAL_DISPLAY_OF_MIGHT']), 'END_TURN')
    expect(canScoreOfficialSecondary(session, 'p-a', 'OFFICIAL_NO_PRISONERS')).toBe(true)
    expect(canScoreOfficialSecondary(session, 'p-b', 'OFFICIAL_DISPLAY_OF_MIGHT')).toBe(true)
    const otherPlayerScore = scoreOfficialSecondary(session, 'p-b', 'OFFICIAL_DISPLAY_OF_MIGHT', 5)
    expect(authorizeSharedMutation(session, otherPlayerScore, membership('p-b')).allowed).toBe(true)
    expect(authorizeSharedMutation(session, otherPlayerScore, membership('p-a')).allowed).toBe(false)
    session = otherPlayerScore
    expect(session.state.players['p-b'].score.secondary).toBe(5)
    session = scoreOfficialSecondary(session, 'p-a', 'OFFICIAL_NO_PRISONERS', 4)
    expect(getRoundSecondaryVp(session, 'p-a')).toBe(4)
    expect(getSecondaryState(session)['p-a'].active).toHaveLength(1)
    expect(officialPendingReviewPlayers(session)).toContain('p-a')
    session = acknowledgeOfficialWindow(session, 'p-a')
    expect(officialPendingReviewPlayers(session)).not.toContain('p-a')
    expect(canScoreOfficialSecondary(session, 'p-a', 'OFFICIAL_DISPLAY_OF_MIGHT')).toBe(false)
  })

  it('uses the current Rival for FFA opponent scoring', () => {
    let session = phase(game(['OFFICIAL_BEACON', 'OFFICIAL_NO_PRISONERS'], 'tactical', true), 'END_TURN')
    expect(canScoreOfficialSecondary(session, 'p-b', 'OFFICIAL_BEACON')).toBe(false)
    expect(canScoreOfficialSecondary(session, 'p-c', 'OFFICIAL_BEACON')).toBe(true)
    session = scoreOfficialSecondary(session, 'p-c', 'OFFICIAL_BEACON', 3)
    expect(session.state.players['p-c'].score.secondary).toBe(3)
  })

  it('keeps Fixed cards, limits each to 20 VP, and prevents scoring twice in the same turn', () => {
    let session = phase(game(['OFFICIAL_A_GRIEVOUS_BLOW', 'OFFICIAL_ASSASSINATION'], 'fixed'), 'END_TURN')
    expect(getSecondaryState(session)['p-a'].deck).toHaveLength(0)
    session = scoreOfficialSecondary(session, 'p-a', 'OFFICIAL_A_GRIEVOUS_BLOW', 20)
    expect(getRoundSecondaryVp(session, 'p-a')).toBe(15)
    expect(getSecondaryState(session)['p-a'].active).toHaveLength(2)
    expect(() => scoreOfficialSecondary(session, 'p-a', 'OFFICIAL_A_GRIEVOUS_BLOW', 4)).toThrow(/already scored/i)
    expect(getSecondaryState(session)['p-a'].scoreHistory[0].pointsAwarded).toBe(15)
    expect(() => replaceOfficialSecondary(session, 'p-a', 'OFFICIAL_A_GRIEVOUS_BLOW')).toThrow(/Fixed/i)
  })

  it('records Cleanse in the Shooting phase, and grants one CP for an end-turn discard', () => {
    let session = phase(game(['OFFICIAL_CLEANSE', 'OFFICIAL_NO_PRISONERS']), 'SHOOTING')
    expect(() => startOfficialSecondaryAction(session, 'p-a', 'OFFICIAL_CLEANSE', '', 'N1')).toThrow()
    session = startOfficialSecondaryAction(session, 'p-a', 'OFFICIAL_CLEANSE', 'Squad A', 'N1')
    expect(officialActionCount(session, 'p-a', 'OFFICIAL_CLEANSE')).toBe(1)
    session = dispatchBattleEvents(session, ['CHARGE', 'FIGHT', 'END_TURN'].map((next) => ({ type: 'PHASE_CHANGED', payload: { phase: next as 'CHARGE' | 'FIGHT' | 'END_TURN' } })))
    expect(canScoreOfficialSecondary(session, 'p-a', 'OFFICIAL_CLEANSE')).toBe(true)
    session = scoreOfficialSecondary(session, 'p-a', 'OFFICIAL_CLEANSE', 2)
    const before = session.state.players['p-a'].cp
    session = discardOfficialAtEndTurn(session, 'p-a', ['OFFICIAL_NO_PRISONERS'])
    expect(session.state.players['p-a'].cp).toBe(before + 1)
    expect(getSecondaryState(session)['p-a'].discarded).toHaveLength(1)
  })
})

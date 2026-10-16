import { describe, expect, it } from 'vitest'
import { deserializeBattleSession, dispatchBattleEvent, dispatchBattleEvents, serializeBattleSession } from '../../domain/battle/engine'
import { authorizeSharedMutation } from '../../multiplayer/sharedEventPolicy'
import type { SharedMembership } from '../../multiplayer/types'
import { selectCommandPointRecordedThisTurn } from '../../domain/context/selectors'
import { testArmy, testCauldronGame } from './cauldronTestUtils'
import { getCauldronEventData } from './events'
import { FFA_ROUND_CP_ACTION, calculateFfaRoundCpAward, ffaRoundCpGrantEvents, type FfaRoundCpAward } from './ffaCp'
import { createCauldronGame, grantCommandPhaseCp } from './session'

const ids = ['p-a', 'p-b', 'p-c'] as const

function newFfa() {
  const armies = ['a', 'b', 'c'].map((suffix) => testArmy(`army-${suffix}`))
  return createCauldronGame({
    gameId: 'ffa-cp-balance',
    createdAt: '2026-10-16T08:00:00.000Z',
    mode: 'ffa3',
    guidanceLevel: 'guided',
    armies,
    players: armies.map((army, i) => ({
      id: ids[i], name: ['Alpha', 'Bravo', 'Charlie'][i], armyId: army.id,
      deploymentZone: 'ABC'[i] as 'A' | 'B' | 'C',
      turnPosition: (i + 1) as 1 | 2 | 3,
      operationalPlanId: 'WYNISZCZENIE' as const,
    })),
  })
}

function roundTransition(before: ReturnType<typeof newFfa>) {
  const round = before.state.round + 1
  const input = [
    { type: 'TURN_ENDED' as const, payload: { playerId: 'p-c' } },
    { type: 'ROUND_ENDED' as const, payload: { round: before.state.round } },
    { type: 'ROUND_STARTED' as const, payload: { round } },
    { type: 'TURN_STARTED' as const, payload: { playerId: 'p-a' } },
  ]
  const preview = dispatchBattleEvents(before, input)
  const granted = ffaRoundCpGrantEvents(preview)
  return { preview, granted, after: dispatchBattleEvents(before, [...input, ...granted], { actorPlayerId: 'p-c' }) }
}

describe('FFA balanced round CP economy', () => {
  it('grants 2 CP to all three players on setup, not another +1 on own Command', () => {
    const session = newFfa()
    expect(session.state.round).toBe(1)
    expect(ids.map((id) => session.state.players[id].cp)).toEqual([2, 2, 2])
    expect(getCauldronEventData<FfaRoundCpAward>(session, FFA_ROUND_CP_ACTION)).toEqual([{
      round: 1, baseCp: 2, bonusPlayerIds: [], grants: { 'p-a': 2, 'p-b': 2, 'p-c': 2 },
    }])
    expect(ffaRoundCpGrantEvents(session)).toEqual([])
    expect(selectCommandPointRecordedThisTurn(session)).toBe(true)
    expect(() => grantCommandPhaseCp(session)).toThrow(/automatically granted/)
    const manual = dispatchBattleEvent(session, { type: 'CP_GAINED', payload: { playerId: 'p-a', amount: 1 } })
    expect(manual.state.players['p-a'].cp).toBe(3)
    expect(getCauldronEventData(manual, FFA_ROUND_CP_ACTION)).toHaveLength(1)
  })

  it('round two grants everyone exactly +2 even when one player is trailing', () => {
    let before = newFfa()
    before = dispatchBattleEvents(before, [
      { type: 'SCORE_ADJUSTED', payload: { playerId: 'p-a', category: 'primary', delta: 20 } },
      { type: 'TURN_STARTED', payload: { playerId: 'p-c' } },
    ])
    const { after } = roundTransition(before)
    expect(ids.map((id) => after.state.players[id].cp)).toEqual([4, 4, 4])
    expect(getCauldronEventData<FfaRoundCpAward>(after, FFA_ROUND_CP_ACTION).at(-1)?.bonusPlayerIds).toEqual([])
    expect(ffaRoundCpGrantEvents(after)).toEqual([])
  })

  it('round three awards +1 Underdog to every last-place tie, but not an everyone tie', () => {
    const { after: roundTwo } = roundTransition(dispatchBattleEvent(newFfa(), {
      type: 'TURN_STARTED', payload: { playerId: 'p-c' },
    }))
    let lastTurn = dispatchBattleEvents(roundTwo, [
      { type: 'SCORE_ADJUSTED', payload: { playerId: 'p-a', category: 'primary', delta: 15 } },
      { type: 'SCORE_ADJUSTED', payload: { playerId: 'p-b', category: 'primary', delta: 5 } },
      { type: 'SCORE_ADJUSTED', payload: { playerId: 'p-c', category: 'primary', delta: 5 } },
      { type: 'TURN_STARTED', payload: { playerId: 'p-c' } },
    ])
    const { after } = roundTransition(lastTurn)
    expect(ids.map((id) => after.state.players[id].cp)).toEqual([6, 7, 7])
    expect(calculateFfaRoundCpAward(after).bonusPlayerIds).toEqual(['p-b', 'p-c'])
    const saved = deserializeBattleSession(serializeBattleSession(after))
    expect(ids.map((id) => saved.state.players[id].cp)).toEqual([6, 7, 7])
    expect(ffaRoundCpGrantEvents(saved)).toEqual([])
    const equal = dispatchBattleEvents(newFfa(), [
      { type: 'ROUND_STARTED', payload: { round: 3 } },
      { type: 'TURN_STARTED', payload: { playerId: 'p-a' } },
    ])
    expect(calculateFfaRoundCpAward(equal).bonusPlayerIds).toEqual([])
    expect(ffaRoundCpGrantEvents(equal)).toHaveLength(4)
  })

  it('legacy FFA games retain original 0 starting CP and manual per-turn +1', () => {
    const legacy = testCauldronGame()
    expect(ids.map((id) => legacy.state.players[id].cp)).toEqual([0, 0, 0])
    expect(getCauldronEventData(legacy, FFA_ROUND_CP_ACTION)).toEqual([])
    expect(grantCommandPhaseCp(legacy).state.players['p-a'].cp).toBe(1)
  })

  it('a shared last-turn owner may grant exact CP to everyone in one action, not forge a grant', () => {
    const before = dispatchBattleEvents(newFfa(), [
      { type: 'TURN_STARTED', payload: { playerId: 'p-c' } },
      { type: 'PHASE_CHANGED', payload: { phase: 'END_TURN' } },
      { type: 'SCORE_ADJUSTED', payload: { playerId: 'p-a', category: 'primary', delta: 12 } },
    ])
    const { preview, granted, after } = roundTransition(before)
    const seat: SharedMembership = { battleId: before.setup.gameId, roomId: 'room', roomCode: 'TEST', playerId: 'p-c', clientId: 'phone-c', isHost: false }
    expect(authorizeSharedMutation(before, after, seat).allowed).toBe(true)
    expect(authorizeSharedMutation(before, after, { ...seat, playerId: 'p-a' }).allowed).toBe(false)
    const forged = dispatchBattleEvents(before, [
      { type: 'TURN_ENDED', payload: { playerId: 'p-c' } },
      { type: 'ROUND_ENDED', payload: { round: 1 } },
      { type: 'ROUND_STARTED', payload: { round: 2 } },
      { type: 'TURN_STARTED', payload: { playerId: 'p-a' } },
      ...granted.map((event) => event.type === 'CP_GAINED' && event.payload.playerId === 'p-a'
        ? { ...event, payload: { ...event.payload, amount: 200 } } : event),
    ], { actorPlayerId: 'p-c' })
    expect(authorizeSharedMutation(before, forged, seat).allowed).toBe(false)
    expect(ffaRoundCpGrantEvents(preview)).toEqual(granted)
  })
})

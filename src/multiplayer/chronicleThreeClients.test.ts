import { expect, it } from 'vitest'
import { dispatchBattleEvent, rehydrateBattleSession } from '../domain/battle/engine'
import { buildBattleReport } from '../domain/battle/battleReport'
import { testCauldronGame } from '../rulesets/cauldronFFA3/cauldronTestUtils'
import { authorizeSharedMutation } from './sharedEventPolicy'
import { findRetryableLocalEvents, mergeCanonicalEnvelopes } from './sharedSync'
import type { BattleSession } from '../domain/battle/types'
import type { SharedEventEnvelope, SharedMembership } from './types'

it('three clients retain unit provenance across canonical replay, duplicate retry, offline edits and host correction', () => {
  const snapshot = testCauldronGame()
  const member = (playerId: string): SharedMembership => ({ battleId: snapshot.setup.gameId, roomId: 'room', roomCode: 'ABC123', clientId: playerId, playerId, isHost: playerId === 'p-a' })
  let canonical: SharedEventEnvelope[] = []
  let sequence = 0
  const rebuild = (): BattleSession => {
    const seen = new Set(snapshot.state.events.map((event) => event.id))
    const events = canonical.map((envelope) => envelope.event).filter((event) => { if (seen.has(event.id)) return false; seen.add(event.id); return true })
    return rehydrateBattleSession({ ...snapshot, state: { ...snapshot.state, events: [...snapshot.state.events, ...events] } })
  }
  const publish = (before: BattleSession, after: BattleSession, playerId: string) => {
    expect(authorizeSharedMutation(before, after, member(playerId)).allowed).toBe(true)
    const ids = new Set(before.state.events.map((event) => event.id))
    const envelopes = after.state.events.filter((event) => !ids.has(event.id)).map((event) => ({ roomId: 'room', sequence: ++sequence, event }))
    canonical = mergeCanonicalEnvelopes(canonical, envelopes)
    // A delivery retry repeats both the envelope and its event ID.
    canonical = mergeCanonicalEnvelopes(canonical, envelopes)
  }
  const alpha = rebuild()
  const after = dispatchBattleEvent(alpha, { type: 'UNIT_DESTROYED', payload: { playerId: 'p-b', unitId: 'tank', destroyedByPlayerId: 'p-a', attackerUnitId: 'tank', note: 'Split fire' } })
  publish(alpha, after, 'p-a')
  const offline = dispatchBattleEvent(snapshot, { type: 'UNIT_MODEL_DESTROYED', payload: { playerId: 'p-c', unitId: 'infantry', amount: 2, destroyedByPlayerId: 'p-a', attackerUnitId: 'infantry' } })
  const retry = findRetryableLocalEvents(snapshot, offline)
  expect(retry).toHaveLength(1)
  publish(snapshot, offline, 'p-c')
  expect(canonical).toHaveLength(2)
  expect(['p-a', 'p-b', 'p-c'].map(() => buildBattleReport(rebuild()))).toEqual(Array(3).fill(buildBattleReport(rebuild())))
  expect(buildBattleReport(rebuild()).performance.armies[0].enemyPointsDestroyed).toBe(310)
  const current = rebuild()
  const corrected = dispatchBattleEvent(current, { type: 'STATE_CORRECTED', payload: { correction: { kind: 'UNIT_MODELS', playerId: 'p-b', unitId: 'tank', value: 1 }, reason: 'Wrong target' } })
  publish(current, corrected, 'p-a')
  const report = buildBattleReport(rebuild())
  expect(report.performance.armies[0].enemyPointsDestroyed).toBe(85)
  expect(report.performance.armies[0].kills).toBe(0)
  expect(report.rounds[0].highlights.some((entry) => entry.note === 'Wrong target')).toBe(true)
})

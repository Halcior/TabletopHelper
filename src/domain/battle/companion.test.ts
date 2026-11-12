import { describe, expect, it } from 'vitest'
import { createBattleSession, dispatchBattleEvent, rehydrateBattleSession } from './engine'
import { companionUseError, type CompanionUse } from './companion'
import { authorizeSharedMutation } from '../../multiplayer/sharedEventPolicy'
import type { RulesManifest } from '../../features/companion/data'
import { buildBattleChronicle } from './chronicle'

function battle(count = 3) {
  return createBattleSession({ gameId: 'companion-test', rulesetId: 'generic', players: Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, startingCp: 3 })) })
}
const use: CompanionUse = { operationId: 'op-1', playerId: 'p1', stratagemId: 's1', name: 'TEST ONLY', baseCost: 2, cost: 1, datasetId: 'test', round: 1, phase: 'COMMAND', activePlayerId: 'p0' }
const record = (session: ReturnType<typeof battle>, payload = use) => dispatchBattleEvent(session, { type: 'COMPANION_STRATAGEM_RECORDED', payload }, { undoable: false })
const revert = (session: ReturnType<typeof battle>) => dispatchBattleEvent(session, { type: 'COMPANION_STRATAGEM_REVERTED', payload: { playerId: 'p1', operationId: use.operationId } }, { undoable: false })

describe('Companion CP audit', () => {
  it.each([2, 3, 4])('records the using player outside their turn with %i seats', count => {
    const after = record(battle(count))
    expect(after.state.players.p0.cp).toBe(3)
    expect(after.state.players.p1.cp).toBe(2)
    expect(after.state.events.at(-1)?.type).toBe('COMPANION_STRATAGEM_RECORDED')
    expect(buildBattleChronicle(after).at(-1)?.category).toBe('stratagems')
  })
  it('accepts zero and rejects negative, fractional, nonfinite, overspend or wrong-unit costs', () => {
    expect(record(battle(), { ...use, cost: 0 }).state.players.p1.cp).toBe(3)
    for (const cost of [-1, .5, NaN, Infinity, 4]) expect(companionUseError(battle(), { ...use, cost })).toBeTruthy()
    expect(companionUseError(battle(), { ...use, targetUnitId: 'enemy' })).toBeTruthy()
  })
  it('deduplicates operation retries across different event IDs and reloads', () => {
    const after = record(record(battle()))
    expect(after.state.players.p1.cp).toBe(2)
    expect(rehydrateBattleSession(JSON.parse(JSON.stringify(after))).state.players.p1.cp).toBe(2)
  })
  it('refunds the actual cost once without overwriting later CP changes', () => {
    const after = dispatchBattleEvent(record(battle()), { type: 'CP_GAINED', payload: { playerId: 'p1', amount: 4 } })
    const undone = revert(revert(after))
    expect(undone.state.players.p1.cp).toBe(7)
    expect(undone.state.companion?.uses['op-1'].status).toBe('reverted')
    expect(record(undone).state.players.p1.cp).toBe(7)
  })
  it('rejects insufficient replays without charging or refunding a cost not paid', () => {
    let session = record(battle(), { ...use, cost: 4 })
    expect(session.state.players.p1.cp).toBe(3)
    expect(session.state.companion?.uses['op-1'].status).toBe('rejected')
    session = revert(session)
    expect(session.state.players.p1.cp).toBe(3)
  })
  it('pins rules metadata across replay and rejects online CP use at the mutation boundary', () => {
    const before = battle()
    const membership = { roomId: 'room', roomCode: 'ROOM12', battleId: before.setup.gameId, clientId: 'client', playerId: 'p1', isHost: true }
    expect(authorizeSharedMutation(before, record(before), membership).allowed).toBe(false)
    const manifest: RulesManifest = { id: 'snapshot-a', edition: '11', source: 'Wahapedia', importedAt: '2026-11-12', files: [], warnings: [] }
    const after = dispatchBattleEvent(before, { type: 'COMPANION_RULES_SELECTED', payload: { playerId: 'p1', manifest } })
    expect(authorizeSharedMutation(before, after, membership).allowed).toBe(true)
    expect(authorizeSharedMutation(before, after, { ...membership, playerId: 'p0' }).allowed).toBe(false)
    expect(rehydrateBattleSession(after).state.companion?.rules.p1.id).toBe('snapshot-a')
  })
})

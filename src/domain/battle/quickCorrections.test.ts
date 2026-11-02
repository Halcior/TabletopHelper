import { describe, expect, it } from 'vitest'
import { testCauldronGame } from '../../rulesets/cauldronFFA3/cauldronTestUtils'
import { CAULDRON_SECONDARY_IDS } from '../../rulesets/cauldronFFA3/secondaryDefinitions'
import { authorizeSharedMutation } from '../../multiplayer/sharedEventPolicy'
import { findRetryableLocalEvents } from '../../multiplayer/sharedSync'
import { dispatchBattleEvent, dispatchBattleEvents, rehydrateBattleSession, serializeBattleSession, deserializeBattleSession } from './engine'
import { buildBattleChronicle } from './chronicle'
import { planQuickUndo } from './quickCorrections'
import { readCombatState } from './combatState'
import { officialKillLedger } from '../../rulesets/cauldronFFA3/officialSecondaryFFA'
import { buildCauldronTurnSummary } from '../../rulesets/cauldronFFA3/turnSummary'
import { buildScoringAudit } from './scoringAudit'
import type { BattleEventInput, BattleSession } from './types'

function inverse(session: BattleSession) {
  const plan = planQuickUndo(session)
  if (!plan.safe) throw new Error(plan.reason)
  return plan.input
}
const partial: BattleEventInput = { type: 'UNIT_COMBAT_RESOLVED', payload: {
  playerId: 'p-b', unitId: 'infantry', kind: 'damage', destroyedByPlayerId: 'p-a', attackerUnitId: 'tank', allocations: [{ profileId: 'unit', models: 2 }],
} }

describe('guarded append-only quick corrections', () => {
  it.each([
    { type: 'CP_SPENT', payload: { playerId: 'p-a', amount: 999 } },
    { type: 'CP_GAINED', payload: { playerId: 'p-a', amount: 5 } },
    { type: 'SCORE_ADJUSTED', payload: { playerId: 'p-a', category: 'adjustment', delta: -999 } },
    { type: 'OBJECTIVE_CONTROL_CHANGED', payload: { objectiveId: 'N1', controllerPlayerId: 'p-b' } },
    partial,
  ] as BattleEventInput[])('restores the precise before state for $type rather than negating amounts', event => {
    const base = dispatchBattleEvent(testCauldronGame(), { type: 'SCORE_ADJUSTED', payload: { playerId: 'p-a', category: 'adjustment', delta: 7 } })
    const changed = dispatchBattleEvent(base, event)
    const corrected = dispatchBattleEvent(changed, inverse(changed))
    expect(corrected.state.players).toMatchObject(base.state.players)
    expect(readCombatState(base.setup.armies['army-b'].units[0], corrected.state.players['p-b'].units.infantry)).toEqual(readCombatState(base.setup.armies['army-b'].units[0], base.state.players['p-b'].units.infantry))
    expect(corrected.state.objectives).toEqual(base.state.objectives)
    expect(corrected.state.events.length).toBe(base.state.events.length + 2)
    expect(corrected.state.events.slice(0, changed.state.events.length)).toEqual(changed.state.events)
    expect(deserializeBattleSession(serializeBattleSession(corrected)).state.players).toEqual(corrected.state.players)
  })

  it('does not overwrite later actions after offline rebase; stale compensation is an explicit no-op', () => {
    const base = testCauldronGame()
    const damaged = dispatchBattleEvent(base, partial)
    const offline = dispatchBattleEvent(damaged, inverse(damaged))
    const later = dispatchBattleEvent(damaged, { type: 'CP_GAINED', payload: { playerId: 'p-c', amount: 1 } })
    const retry = findRetryableLocalEvents(damaged, offline)
    expect(retry).toHaveLength(1)
    const merged = rehydrateBattleSession({ ...later, state: { ...later.state, events: [...later.state.events, ...retry, ...retry] } })
    expect(merged.state.players).toEqual(later.state.players)
    expect(merged.state.events.filter(event => event.type === 'STATE_CORRECTED')).toHaveLength(1)
    expect(buildBattleChronicle(merged).at(-1)?.description).toContain('Quick correction skipped')
    expect(buildBattleChronicle(merged).at(-1)?.unitChange).toBeUndefined()
  })

  it('two concurrent corrections and acknowledgement-loss retry apply exactly once', () => {
    const damaged = dispatchBattleEvent(testCauldronGame(), partial)
    const a = dispatchBattleEvent(damaged, inverse(damaged))
    const b = dispatchBattleEvent(damaged, inverse(damaged))
    const corrections = [a.state.events.at(-1)!, b.state.events.at(-1)!, a.state.events.at(-1)!]
    const canonical = rehydrateBattleSession({ ...damaged, state: { ...damaged.state, events: [...damaged.state.events, ...corrections] } })
    expect(canonical.state.players['p-b'].units.infantry.modelsAlive).toBe(4)
    expect(canonical.state.events.filter(event => event.type === 'STATE_CORRECTED')).toHaveLength(2)
    const ledger = buildBattleChronicle(canonical)
    expect(ledger.filter(entry => entry.description.startsWith('Quick correction skipped'))).toHaveLength(1)
    expect(ledger.filter(entry => entry.unitChange?.correction && entry.unitChange.modelsAfter > entry.unitChange.modelsBefore)).toHaveLength(1)
    expect(officialKillLedger(canonical)).toEqual([])
  })

  it('removes successfully compensated kill/score credit but preserves the original Chronicle entry', () => {
    const base = testCauldronGame()
    const damaged = dispatchBattleEvent(base, partial)
    expect(officialKillLedger(damaged).reduce((sum, entry) => sum + entry.modelsDestroyed, 0)).toBe(2)
    const corrected = dispatchBattleEvent(damaged, inverse(damaged))
    expect(officialKillLedger(corrected)).toEqual([])
    expect(buildBattleChronicle(corrected).some(entry => entry.event.id === damaged.state.events.at(-1)!.id && entry.unitChange?.modelsAfter === 2)).toBe(true)
    const scored = dispatchBattleEvent(base, { type: 'SCORE_ADJUSTED', payload: { playerId: 'p-a', category: 'secondary', delta: 5 } })
    const unscored = dispatchBattleEvent(scored, inverse(scored))
    expect(buildCauldronTurnSummary(unscored, 'p-a').secondaryGained).toBe(0)
    const later = dispatchBattleEvent(scored, { type: 'CP_GAINED', payload: { playerId: 'p-a', amount: 1 } })
    const stale = dispatchBattleEvent(later, inverse(scored))
    expect(buildScoringAudit(stale).filter(entry => entry.corrected)).toHaveLength(0)
    expect(officialKillLedger(dispatchBattleEvent(dispatchBattleEvent(damaged, { type: 'CP_GAINED', payload: { playerId: 'p-a', amount: 1 } }), inverse(damaged)))).toHaveLength(1)
  })

  it('keeps the existing host-only correction policy and rejects an older Chronicle action', () => {
    const damaged = dispatchBattleEvent(testCauldronGame(), partial)
    const corrected = dispatchBattleEvent(damaged, inverse(damaged))
    const membership = { roomId: 'r', roomCode: 'ABC123', battleId: damaged.setup.gameId, clientId: 'a', playerId: 'p-a', isHost: true }
    expect(authorizeSharedMutation(damaged, corrected, membership).allowed).toBe(true)
    expect(authorizeSharedMutation(damaged, corrected, { ...membership, isHost: false }).allowed).toBe(false)
    expect(planQuickUndo(corrected, damaged.state.events.at(-1)!.id).safe).toBe(false)
  })

  it('refuses grouped scoring, automatic kill consequences, round changes and unknown historical allocations', () => {
    const base = testCauldronGame({ secondaryDeckOrders: { 'p-a': ['SILA_OGNIA', ...CAULDRON_SECONDARY_IDS.filter(id => id !== 'SILA_OGNIA')] } })
    const grouped = dispatchBattleEvents(base, [
      { type: 'SCORE_ADJUSTED', payload: { playerId: 'p-a', category: 'primary', delta: 5 } },
      { type: 'RULESET_EVENT', payload: { rulesetId: base.setup.rulesetId, action: 'PRIMARY_COMMITTED', data: { playerId: 'p-a' } } },
    ])
    expect(planQuickUndo(grouped).safe).toBe(false)
    const shooting = dispatchBattleEvent(base, { type: 'PHASE_CHANGED', payload: { phase: 'SHOOTING' } })
    const killed = dispatchBattleEvent(shooting, { type: 'UNIT_COMBAT_RESOLVED', payload: { ...partial.payload, allocations: [{ profileId: 'unit', models: 4 }] } } as BattleEventInput)
    expect(killed.state.events.some(event => event.derivedFromCombatId)).toBe(true)
    expect(planQuickUndo(killed).safe).toBe(false)
    expect(planQuickUndo(dispatchBattleEvent(base, { type: 'ROUND_STARTED', payload: { round: 2 } })).safe).toBe(false)
    const unknown = structuredClone(base)
    const definition = unknown.setup.armies['army-b'].units[0]
    definition.modelGroups = [{ name: 'Different group', startingCount: 2, equipment: [], stats: { wounds: 3 } }, { name: 'Other group', startingCount: 2, equipment: [], stats: { wounds: 5 } }]
    const legacy = dispatchBattleEvent(unknown, { type: 'STATE_CORRECTED', payload: { correction: { kind: 'UNIT_MODELS', playerId: 'p-b', unitId: 'infantry', value: 3 }, reason: 'legacy unallocated losses' } })
    const lost = dispatchBattleEvent(legacy, { type: 'UNIT_MODEL_DESTROYED', payload: { playerId: 'p-b', unitId: 'infantry', amount: 1 } })
    expect(planQuickUndo(lost).safe).toBe(false)
  })
})

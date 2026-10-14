import { CAULDRON_SECONDARY_IDS } from '../../rulesets/cauldronFFA3/secondaryDefinitions'
import { describe, expect, it } from 'vitest'
import { createBattleSession, dispatchBattleEvent, dispatchBattleEvents, rehydrateBattleSession, redoLastAction, undoLastAction } from './engine'
import { buildBattleChronicle } from './chronicle'
import { buildUnitPerformance } from './unitPerformance'
import { buildBattleReport } from './battleReport'
import { combatProfiles, combatStatus, readCombatState, resolveCombat, setCombatState } from './combatState'
import { testArmy, testCauldronGame } from '../../rulesets/cauldronFFA3/cauldronTestUtils'
import { dispatchCauldronBattleEvent, getSecondaryState } from '../../rulesets/cauldronFFA3/secondary'
import { officialKillLedger } from '../../rulesets/cauldronFFA3/officialSecondaryFFA'
import type { BattleEventInput, BattleSession, CombatResolution } from './types'
import { authorizeSharedMutation } from '../../multiplayer/sharedEventPolicy'
import type { SharedMembership } from '../../multiplayer/types'
import { findRetryableLocalEvents } from '../../multiplayer/sharedSync'

const input = (wounds: number, extra: Partial<CombatResolution> = {}): BattleEventInput => ({ type: 'UNIT_COMBAT_RESOLVED', payload: { playerId: 'p-b', unitId: 'infantry', kind: 'damage', destroyedByPlayerId: 'p-a', attackerUnitId: 'tank', allocations: [{ profileId: 'unit', wounds }], ...extra } })
const state = (session: BattleSession) => session.state.players['p-b'].units.infantry
const run = (session: BattleSession, wounds: number, extra: Partial<CombatResolution> = {}) => dispatchCauldronBattleEvent(session, input(wounds, extra))
const member = (session: BattleSession, playerId: string): SharedMembership => ({ battleId: session.setup.gameId, roomId: 'room', roomCode: 'ABC123', clientId: playerId, playerId, isHost: playerId === 'p-a' })
const heal = (wounds: number) => ({ kind: 'heal' as const, allocations: [{ profileId: 'unit', wounds }], destroyedByPlayerId: null, attackerUnitId: null })
const restore = (models: number, allowDestroyed = false) => ({ kind: 'restore' as const, allocations: [{ profileId: 'unit', models }], allowDestroyed, destroyedByPlayerId: null, attackerUnitId: null })

describe('atomic effective combat losses', () => {
  it('4 × 3 W loses 1 W, then 2 W: one casualty and 3 effective Wounds', () => {
    let game = run(testCauldronGame(), 1)
    expect(state(game)).toMatchObject({ modelsAlive: 4, currentModelWounds: 2, destroyed: false })
    game = run(game, 2)
    expect(state(game)).toMatchObject({ modelsAlive: 3, currentModelWounds: 3 })
    expect(buildUnitPerformance(game).units.find((unit) => unit.playerId === 'p-a' && unit.unitId === 'tank')).toMatchObject({ damageDealt: 3, modelsDestroyed: 1, kills: 0 })
  })
  it('3 × 3 W loses eight in a single resolution and a single Chronicle entry', () => {
    const start = dispatchBattleEvent(testCauldronGame(), { type: 'UNIT_MODEL_DESTROYED', payload: { playerId: 'p-b', unitId: 'infantry', amount: 1 } })
    const game = run(start, 8)
    expect(state(game)).toMatchObject({ modelsAlive: 1, currentModelWounds: 1 })
    const entries = buildBattleChronicle(game).filter((entry) => entry.event.type === 'UNIT_COMBAT_RESOLVED')
    expect(entries).toHaveLength(1)
    expect(entries[0].description).toContain('8 Wounds lost · 2 models destroyed')
    expect(buildBattleReport(game).narrative.join(' ')).toContain('8 Wounds')
  })
  it('heals the wounded model, caps healing, and preserves it when restoring models', () => {
    let game = run(testCauldronGame(), 4)
    game = run(game, 1, restore(1))
    expect(state(game)).toMatchObject({ modelsAlive: 4, currentModelWounds: 2 })
    game = run(game, 50, heal(50))
    expect(state(game)).toMatchObject({ modelsAlive: 4, currentModelWounds: 3 })
    expect(buildUnitPerformance(game).units.find((unit) => unit.playerId === 'p-b' && unit.unitId === 'infantry')).toMatchObject({ woundsHealed: 1, modelsRestored: 1, damageReceived: 4 })
  })
  it('caps overkill, never heals a dead unit, and explicitly returns models', () => {
    let game = run(testCauldronGame(), 100)
    expect(state(game)).toMatchObject({ modelsAlive: 0, currentModelWounds: 0, destroyed: true })
    expect(buildBattleChronicle(game).at(-1)?.unitChange?.effectiveWoundsLost).toBe(12)
    game = run(game, 1, heal(1))
    expect(state(game).destroyed).toBe(true)
    expect(() => run(game, 1, restore(1))).toThrow(/Explicitly confirm/)
    game = run(game, 1, restore(1, true))
    expect(state(game)).toMatchObject({ modelsAlive: 1, currentModelWounds: 3 })
    game = run(game, 1, restore(100))
    expect(state(game).modelsAlive).toBe(4)
  })
  it.each([0, -1, 1.5, NaN, Infinity])('rejects invalid wound amount %s', (wounds) => {
    expect(() => run(testCauldronGame(), wounds)).toThrow()
  })
  it('rejects ambiguous amounts, missing allocation and invalid attacker ownership', () => {
    expect(() => run(testCauldronGame(), 1, { allocations: [{ profileId: 'unit', wounds: 1, models: 1 }] })).toThrow()
    expect(() => run(testCauldronGame(), 1, { allocations: [{ profileId: 'invented', wounds: 1 }] })).toThrow()
    expect(() => run(testCauldronGame(), 1, { attackerUnitId: 'invented' })).toThrow()
    expect(() => run(testCauldronGame(), 1, { ...heal(1), attackerUnitId: 'tank' })).toThrow()
  })
  it('undo/redo restores the whole resolution with its attribution', () => {
    const start = testCauldronGame()
    const game = run(start, 8)
    const undone = undoLastAction(game)
    expect(state(undone)).toEqual(state(start))
    expect(state(redoLastAction(undone))).toEqual(state(game))
  })
  it('a correction retracts mistaken casualty credit without generating a kill or reanimation', () => {
    let game = run(testCauldronGame(), 4)
    game = dispatchBattleEvent(game, { type: 'STATE_CORRECTED', payload: { reason: 'Wrong amount', correction: { kind: 'UNIT_COMBAT', playerId: 'p-b', unitId: 'infantry', value: { unit: { modelsAlive: 4, woundsPerModel: 3, currentModelWounds: 2 } } } } })
    const entry = buildBattleChronicle(game).at(-1)!
    expect(entry.unitChange?.correction).toBe(true)
    expect(entry.description).toContain('correction')
    expect(buildUnitPerformance(game).units.find((unit) => unit.playerId === 'p-a' && unit.unitId === 'tank')).toMatchObject({ modelsDestroyed: 0, damageDealt: 1, kills: 0 })
    expect(officialKillLedger(game)).toHaveLength(1)
  })
  it('retains gross effective damage while restoration retracts net ROI and final kills', () => {
    let game = run(testCauldronGame(), 12)
    game = run(game, 1, restore(4, true))
    game = run(game, 12)
    const performer = buildUnitPerformance(game).units.find((unit) => unit.playerId === 'p-a' && unit.unitId === 'tank')!
    expect(performer).toMatchObject({ damageDealt: 24, modelsDestroyed: 4, kills: 1, enemyPointsDestroyed: 170 })
  })
  it('splits model value among attackers and gives only the final kill to the finisher', () => {
    let game = run(testCauldronGame(), 6)
    game = run(game, 6, { destroyedByPlayerId: 'p-c', attackerUnitId: 'infantry' })
    const performance = buildUnitPerformance(game)
    expect(performance.units.find((unit) => unit.playerId === 'p-a' && unit.unitId === 'tank')).toMatchObject({ damageDealt: 6, modelsDestroyed: 2, kills: 0, enemyPointsDestroyed: 85 })
    expect(performance.units.find((unit) => unit.playerId === 'p-c' && unit.unitId === 'infantry')).toMatchObject({ damageDealt: 6, modelsDestroyed: 2, kills: 1, enemyPointsDestroyed: 85 })
    game = run(game, 2, { unitId: 'tank' })
    expect(game.state.players['p-b'].units.tank.woundsRemaining).toBe(12)
  })
})

describe('mixed and legacy profiles', () => {
  it('uses confirmed Wounds for single-model strength and model count for squads', () => {
    const unit = testArmy('a').units[1]
    delete unit.stats!.wounds
    const state = { unitId: unit.id, modelsAlive: 1, destroyed: false, battleShocked: false, inReserve: false, oncePerBattleAbilities: {} }
    setCombatState(unit, state, { unit: { modelsAlive: 1, woundsPerModel: 10, currentModelWounds: 4 } })
    expect(combatStatus(unit, state)).toBe('Below Half Strength')
    setCombatState(unit, state, { unit: { modelsAlive: 1, woundsPerModel: 10, currentModelWounds: 5 } })
    expect(combatStatus(unit, state)).toBe('Damaged')
    const squad = testArmy('a').units[0]
    setCombatState(squad, state, { unit: { modelsAlive: 2, woundsPerModel: 3, currentModelWounds: 1 } })
    expect(combatStatus(squad, state)).toBe('Damaged')
    setCombatState(squad, state, { unit: { modelsAlive: 1, woundsPerModel: 3, currentModelWounds: 3 } })
    expect(combatStatus(squad, state)).toBe('Below Half Strength')
    squad.ledByUnitIds = ['leader']
    expect(combatStatus(squad, state)).toContain('confirm attached strength')
  })
  function mixed() {
    const army = testArmy('army')
    army.units[0].modelGroups = [{ name: 'Guard', startingCount: 3, equipment: [], stats: { wounds: 3 } }, { name: 'Veteran', startingCount: 1, equipment: [], stats: { wounds: 5 } }]
    army.units[2].leaderOfUnitId = 'infantry'
    army.units[0].ledByUnitIds = ['remainder']
    return createBattleSession({ rulesetId: 'generic', armies: [army], players: [{ id: 'p-b', name: 'B', armyId: army.id }] })
  }
  it('requires explicit mixed-profile allocation and leaves an attached Leader untouched', () => {
    const before = mixed()
    const unit = before.setup.armies.army.units[0]
    expect(combatProfiles(unit)).toHaveLength(2)
    expect(() => run(before, 2, { destroyedByPlayerId: null, attackerUnitId: null })).toThrow(/profile/)
    const game = run(before, 1, { destroyedByPlayerId: null, attackerUnitId: null, allocations: [{ profileId: 'group-0', wounds: 4 }, { profileId: 'group-1', wounds: 2 }] })
    expect(state(game).combatProfiles).toMatchObject({ 'group-0': { modelsAlive: 2, currentModelWounds: 2 }, 'group-1': { modelsAlive: 1, currentModelWounds: 3 } })
    expect(game.state.players['p-b'].units.remainder).toEqual(before.state.players['p-b'].units.remainder)
    expect(buildBattleChronicle(game).at(-1)?.unitChange?.effectiveWoundsLost).toBe(6)
  })
  it('opens old mixed casualties but requests survivor confirmation before new damage', () => {
    const legacy = dispatchBattleEvent(mixed(), { type: 'UNIT_MODEL_DESTROYED', payload: { playerId: 'p-b', unitId: 'infantry', amount: 1 } })
    expect(rehydrateBattleSession(legacy).state.players['p-b'].units.infantry.modelsAlive).toBe(3)
    expect(readCombatState(legacy.setup.armies.army.units[0], state(legacy))).toBeNull()
    expect(() => run(legacy, 1, { destroyedByPlayerId: null, attackerUnitId: null, allocations: [{ profileId: 'group-0', wounds: 1 }] })).toThrow(/Confirm/)
  })
  it('missing Wounds can record casualties but cannot invent wound allocation', () => {
    const definition = testArmy('a').units[0]
    delete definition.stats!.wounds
    const initial = { unitId: definition.id, modelsAlive: 4, destroyed: false, battleShocked: false, inReserve: false, oncePerBattleAbilities: {} }
    expect(() => resolveCombat(definition, initial, { playerId: 'b', unitId: definition.id, kind: 'damage', allocations: [{ profileId: 'unit', wounds: 1 }] })).toThrow(/Confirm/)
    expect(resolveCombat(definition, initial, { playerId: 'b', unitId: definition.id, kind: 'damage', allocations: [{ profileId: 'unit', models: 1 }] }).modelsAlive).toBe(3)
  })
})

describe('canonical concurrent combat and permissions', () => {
  it('merges two offline partial attacks additively, retries once, and awards automatic Secondary only at the canonical final casualty', () => {
    let base = testCauldronGame({ secondaryDeckOrders: { 'p-a': ['SILA_OGNIA', ...CAULDRON_SECONDARY_IDS.filter((id) => id !== 'SILA_OGNIA')] } })
    base = dispatchBattleEvent(base, { type: 'PHASE_CHANGED', payload: { phase: 'SHOOTING' } })
    const first = run(base, 6)
    const second = run(base, 6)
    const events = [...findRetryableLocalEvents(base, first), ...findRetryableLocalEvents(base, second)]
    const canonical = rehydrateBattleSession({ ...base, state: { ...base.state, events: [...base.state.events, ...events, ...events] } })
    expect(state(canonical).destroyed).toBe(true)
    expect(canonical.state.events.filter((event) => event.type === 'UNIT_COMBAT_RESOLVED')).toHaveLength(2)
    expect(officialKillLedger(canonical).filter((kill) => kill.unitDestroyed)).toHaveLength(1)
    expect(getSecondaryState(canonical)['p-a'].completed.filter((card) => card.cardId === 'SILA_OGNIA')).toHaveLength(1)
    expect(canonical.state.players['p-a'].score.secondary).toBe(4)
    expect(findRetryableLocalEvents(base, canonical).every((event) => !event.derivedFromCombatId)).toBe(true)
    const repeated = rehydrateBattleSession(canonical)
    expect(repeated.state.players).toEqual(canonical.state.players)
  })
  it('does not duplicate automatic awards when two offline inputs both appeared lethal', () => {
    let base = testCauldronGame({ secondaryDeckOrders: { 'p-a': ['SILA_OGNIA', ...CAULDRON_SECONDARY_IDS.filter((id) => id !== 'SILA_OGNIA')] } })
    base = dispatchBattleEvent(base, { type: 'PHASE_CHANGED', payload: { phase: 'SHOOTING' } })
    const a = run(base, 12), b = run(base, 12)
    const canonical = rehydrateBattleSession({ ...base, state: { ...base.state, events: [...base.state.events, ...findRetryableLocalEvents(base, a), ...findRetryableLocalEvents(base, b)] } })
    expect(canonical.state.players['p-a'].score.secondary).toBe(4)
    expect(buildUnitPerformance(canonical).units.find((unit) => unit.playerId === 'p-a' && unit.unitId === 'tank')?.damageDealt).toBe(12)
  })
  it('only owner or active attributed attacker can record losses; healing/corrections stay restricted', () => {
    const game = testCauldronGame(), damaged = run(game, 1)
    expect(authorizeSharedMutation(game, damaged, member(game, 'p-a')).allowed).toBe(true)
    expect(authorizeSharedMutation(game, damaged, member(game, 'p-b')).allowed).toBe(true)
    expect(authorizeSharedMutation(game, damaged, member(game, 'p-c')).allowed).toBe(false)
    const healed = run(damaged, 1, heal(1))
    expect(authorizeSharedMutation(damaged, healed, member(game, 'p-a')).allowed).toBe(false)
    expect(authorizeSharedMutation(damaged, healed, member(game, 'p-b')).allowed).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { createBattleSession, dispatchBattleEvent, rehydrateBattleSession, undoLastAction, redoLastAction } from '../battle/engine'
import { testArmy, testCauldronGame } from '../../rulesets/cauldronFFA3/cauldronTestUtils'
import { buildBattleChronicle } from '../battle/chronicle'
import { buildBattlefieldReplay } from './replay'
import { battlefieldView } from './layouts'
import { mapEntry, unitMapChangeInput, unitMapKey } from './unitTracking'
import { authorizeSharedMutation } from '../../multiplayer/sharedEventPolicy'
import { mergeCanonicalEnvelopes } from '../../multiplayer/sharedSync'
import { createBattleClock, clockConfig, reconcileClock } from '../../features/battleClock/model'
import { combatProfiles } from '../battle/combatState'
import type { BattleSession } from '../battle/types'

const enable = (session = testCauldronGame()) => dispatchBattleEvent(session, { type: 'UNIT_TRACKING_CHANGED', payload: { enabled: true } })
const change = (session: BattleSession, playerId = 'p-a', unitId = 'infantry', status: 'battlefield' | 'reserves' | 'unplaced' = 'battlefield', position = status === 'battlefield' ? { x: .3, y: .7 } : null) => dispatchBattleEvent(session, unitMapChangeInput(session.state, playerId, unitId, status, position))
const membership = (playerId: string, isHost = false, battleId = 'cauldron-test') => ({ playerId, isHost, battleId, roomId: 'room', roomCode: 'ABCD', clientId: playerId })

describe('canonical tactical map', () => {
  it('keeps old games opt-in and never backfills historical positions', () => {
    const old = testCauldronGame()
    expect(old.state.unitTracking).toBeUndefined()
    const history = old.state.events.length
    const next = change(enable(old))
    const frames = buildBattlefieldReplay(next)
    expect(frames.slice(0, history + 1).every(frame => !frame.unitTracking)).toBe(true)
    expect(buildBattlefieldReplay(old).every(frame => !frame.unitTracking)).toBe(true)
    expect(rehydrateBattleSession(old).state).toEqual(old.state)
  })
  it('distinguishes Unplaced, Reserves and deployment; persists, undo and redo', () => {
    let session = enable()
    expect(mapEntry(session.state, 'p-a', 'infantry')).toBeUndefined()
    session = change(session)
    expect(mapEntry(session.state, 'p-a', 'infantry')?.status).toBe('battlefield')
    session = change(session, 'p-a', 'infantry', 'reserves')
    expect(mapEntry(session.state, 'p-a', 'infantry')).toMatchObject({ status: 'reserves', position: null, lastPosition: { x: .3, y: .7 } })
    session = change(session)
    expect(buildBattleChronicle(session).at(-1)).toMatchObject({ category: 'movement', highlight: true, description: 'Four-model unit deployed from Reserves' })
    session = change(session, 'p-a', 'infantry', 'reserves')
    session = change(session, 'p-a', 'infantry', 'unplaced')
    const restored = rehydrateBattleSession(JSON.parse(JSON.stringify(session)))
    expect(restored.state).toEqual(session.state)
    expect(mapEntry(undoLastAction(session).state, 'p-a', 'infantry')?.status).toBe('reserves')
    expect(mapEntry(redoLastAction(undoLastAction(session)).state, 'p-a', 'infantry')?.status).toBe('unplaced')
    expect(session.state.players['p-a'].units.infantry.destroyed).toBe(false)
  })
  it('validates coordinates, unit existence, statuses and tracking enablement', () => {
    expect(() => change(testCauldronGame())).toThrow(/Enable/)
    for (const x of [-.01, 1.01, NaN, Infinity]) expect(() => change(enable(), 'p-a', 'infantry', 'battlefield', { x, y: .5 })).toThrow(/coordinates/)
    expect(() => change(enable(), 'unknown')).toThrow(/Unknown/)
    expect(() => change(enable(), 'p-a', 'missing')).toThrow(/Unknown/)
    expect(unitMapKey('a:b', 'c')).not.toBe(unitMapKey('a', 'b:c'))
    expect(() => dispatchBattleEvent(enable(), { type: 'UNIT_MAP_CHANGED', payload: { playerId: 'p-a', unitId: 'infantry', status: 'destroyed' as never, position: null, expectedRevision: null } })).toThrow(/status/)
  })
  it('does not change scoring, objective OC, CP, phases or timing', () => {
    const before = testCauldronGame()
    const after = change(enable(before))
    expect(after.state.players).toEqual(before.state.players)
    expect(after.state.objectives).toEqual(before.state.objectives)
    expect(after.state.phase).toBe(before.state.phase)
    expect(after.state.timing).toEqual(before.state.timing)
  })
  it('reconstructs exact combat positions before movement, elimination and restoration', () => {
    let session = change(change(enable()), 'p-b')
    session = dispatchBattleEvent(session, { type: 'UNIT_MODEL_DESTROYED', payload: { playerId: 'p-b', unitId: 'infantry', amount: 2, destroyedByPlayerId: 'p-a', attackerUnitId: 'infantry' } })
    const combatId = session.state.events.at(-1)!.id
    session = change(session, 'p-a', 'infantry', 'battlefield', { x: .9, y: .1 })
    session = dispatchBattleEvent(session, { type: 'UNIT_DESTROYED', payload: { playerId: 'p-b', unitId: 'infantry', destroyedByPlayerId: 'p-a', attackerUnitId: 'infantry' } })
    const killId = session.state.events.at(-1)!.id
    expect(mapEntry(session.state, 'p-b', 'infantry')).toMatchObject({ status: 'destroyed', position: null, lastPosition: { x: .3, y: .7 } })
    expect(() => change(session, 'p-b')).toThrow(/Restore/)
    session = dispatchBattleEvent(session, { type: 'UNIT_MODEL_RESTORED', payload: { playerId: 'p-b', unitId: 'infantry', amount: 1 } })
    expect(mapEntry(session.state, 'p-b', 'infantry')?.status).toBe('unplaced')
    const frames = buildBattlefieldReplay(session)
    expect(frames.find(frame => frame.eventId === combatId)?.combat).toMatchObject({ attacker: { position: { x: .3, y: .7 } }, target: { position: { x: .3, y: .7 } }, modelsLost: 2, eliminated: false })
    expect(frames.find(frame => frame.eventId === killId)?.combat).toMatchObject({ attacker: { position: { x: .9, y: .1 } }, eliminated: true })
    expect(buildBattleChronicle(session).find(entry => entry.id === combatId)?.spatialCombat).toEqual(frames.find(frame => frame.eventId === combatId)?.combat)
    const snapshot = JSON.stringify(session)
    frames.reverse()
    expect(JSON.stringify(session)).toBe(snapshot)
    expect(session.state.events.filter(event => event.type === 'UNIT_DESTROYED')).toHaveLength(1)
  })
  it('projects Combat Log 2.0 damage, correction and resurrection without a second kill event', () => {
    let session = change(enable(), 'p-b', 'tank')
    const definition = session.setup.armies['army-b'].units.find(unit => unit.id === 'tank')!
    const profileId = combatProfiles(definition)[0].id
    session = dispatchBattleEvent(session, { type: 'UNIT_COMBAT_RESOLVED', payload: { playerId: 'p-b', unitId: 'tank', kind: 'damage', allocations: [{ profileId, wounds: 14 }], destroyedByPlayerId: 'p-a', attackerUnitId: 'tank' } })
    expect(mapEntry(session.state, 'p-b', 'tank')?.status).toBe('destroyed')
    expect(session.state.events.filter(event => event.type === 'UNIT_DESTROYED')).toHaveLength(0)
    session = dispatchBattleEvent(session, { type: 'UNIT_COMBAT_RESOLVED', payload: { playerId: 'p-b', unitId: 'tank', kind: 'restore', allocations: [{ profileId, models: 1 }], allowDestroyed: true } })
    expect(mapEntry(session.state, 'p-b', 'tank')?.status).toBe('unplaced')
    session = change(session, 'p-b', 'tank')
    session = dispatchBattleEvent(session, { type: 'STATE_CORRECTED', payload: { correction: { kind: 'UNIT_MODELS', playerId: 'p-b', unitId: 'tank', value: 0 }, reason: 'Confirmed casualty' } })
    expect(mapEntry(session.state, 'p-b', 'tank')?.status).toBe('destroyed')
  })
  it('disabling tracking invalidates current positions without erasing historical ones', () => {
    let session = change(enable())
    const placedId = session.state.events.at(-1)!.id
    session = dispatchBattleEvent(session, { type: 'UNIT_TRACKING_CHANGED', payload: { enabled: false } })
    session = enable(session)
    expect(mapEntry(session.state, 'p-a', 'infantry')?.position).toBeNull()
    expect(buildBattlefieldReplay(session).find(frame => frame.eventId === placedId)?.unitTracking?.units[unitMapKey('p-a','infantry')].position).toEqual({ x: .3, y: .7 })
  })
  it('movement does not stop, pass or otherwise reconcile the clock', () => {
    const session = enable()
    const clock = createBattleClock(session.setup, clockConfig('casual'), 1000)!
    const after = change(session)
    expect(reconcileClock(clock, after, 5000)).toBe(clock)
  })

  it('never invents combat locations for unplaced attackers or targets', () => {
    let session = change(enable())
    session = dispatchBattleEvent(session, { type: 'UNIT_DESTROYED', payload: { playerId: 'p-b', unitId: 'tank', destroyedByPlayerId: 'p-a', attackerUnitId: 'tank' } })
    expect(buildBattlefieldReplay(session).at(-1)?.combat).toMatchObject({ attacker: { position: null }, target: { position: null } })
  })
  it('maps quarter turns and flips without changing saved source coordinates', () => {
    const point = { x: .27, y: .84 }
    for (const rotated of [false, true]) {
      const view = battlefieldView(112, 152, rotated)
      const result = view.toSource(view.toDisplay(point))
      expect(result.x).toBeCloseTo(point.x)
      expect(result.y).toBeCloseTo(point.y)
    }
  })
  it('ignores stale offline moves, deduplicates retries and accepts concurrent different units', () => {
    const base = change(enable())
    const online = change(base, 'p-a', 'infantry', 'battlefield', { x: .1, y: .2 }).state.events.at(-1)!
    const offline = change(base, 'p-a', 'infantry', 'battlefield', { x: .8, y: .9 }).state.events.at(-1)!
    const other = change(base, 'p-b').state.events.at(-1)!
    const envelopes = mergeCanonicalEnvelopes([{ sequence: 2, event: online }], [{ sequence: 3, event: offline }, { sequence: 1, event: other }, { sequence: 2, event: online }])
    const projected = rehydrateBattleSession({ ...base, state: { ...base.state, events: [...base.state.events, ...envelopes.map(e => e.event), online] } })
    expect(mapEntry(projected.state, 'p-a', 'infantry')?.position).toEqual({ x: .1, y: .2 })
    expect(mapEntry(projected.state, 'p-b', 'infantry')?.position).toEqual({ x: .3, y: .7 })
    expect(projected.state.events.filter(e => e.id === online.id)).toHaveLength(1)
    expect(buildBattleChronicle(projected).find(e => e.id === offline.id)?.description).toMatch(/stale change ignored/)
  })
  it('keeps ownership per army in a four-seat Doubles game, with explicit host corrections', () => {
    const armies = ['a','b','c','d'].map(id => testArmy(id))
    const session = enable(createBattleSession({ rulesetId: 'test', gameId: 'doubles', armies, players: armies.map(army => ({ id: army.id, name: army.id, armyId: army.id })), turnOrder: ['a','c'], doubles: { rulesVersion: 'GW-Doubles-1.0', forces: [
      { id: 'ab', name: 'AB', memberPlayerIds: ['a','b'], captainPlayerId: 'a', forceDisposition: 'test', forceType: 'convenience', warlord: { playerId: 'a', unitId: 'remainder' } },
      { id: 'cd', name: 'CD', memberPlayerIds: ['c','d'], captainPlayerId: 'c', forceDisposition: 'test', forceType: 'convenience', warlord: { playerId: 'c', unitId: 'remainder' } },
    ] } }))
    const own = change(session, 'b')
    expect(authorizeSharedMutation(session, own, membership('b', false, 'doubles')).allowed).toBe(true)
    expect(authorizeSharedMutation(session, own, membership('a', false, 'doubles')).allowed).toBe(false)
    expect(authorizeSharedMutation(session, own, membership('c', false, 'doubles')).allowed).toBe(false)
    expect(authorizeSharedMutation(session, own, membership('a', true, 'doubles')).allowed).toBe(true)
  })
  it('only lets a host toggle tracking in multiplayer', () => {
    const before = testCauldronGame(), after = enable(before)
    expect(authorizeSharedMutation(before, after, membership('p-a')).allowed).toBe(false)
    expect(authorizeSharedMutation(before, after, membership('p-a', true)).allowed).toBe(true)
  })
})

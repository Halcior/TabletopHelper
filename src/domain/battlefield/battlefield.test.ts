import { describe, expect, it } from 'vitest'
import { createCauldronGame } from '../../rulesets/cauldronFFA3/session'
import {
  testArmy,
  testCauldronGame,
} from '../../rulesets/cauldronFFA3/cauldronTestUtils'
import {
  DISPOSITIONS,
  type ForceDisposition,
  getDuelConditions,
} from '../../rulesets/cauldronFFA3/duelPrimary'
import { buildBattlefieldReplay } from './replay'
import {
  battlefieldPresentation,
  defaultBattlefieldGeometry,
  displayBoardPoint,
  officialBoardDefinition,
  validateBattlefieldGeometry,
} from './layouts'
import {
  deserializeBattleSession,
  dispatchBattleEvent,
  dispatchBattleEvents,
  redoLastAction,
  serializeBattleSession,
  undoLastAction,
} from '../battle/engine'
import { authorizeSharedMutation } from '../../multiplayer/sharedEventPolicy'
import type { BattleEvent, BattleSession } from '../battle/types'
import type { SharedMembership } from '../../multiplayer/types'
import { buildBattleReport } from '../battle/battleReport'

function duel(
  a: ForceDisposition = 'take-and-hold',
  b: ForceDisposition = 'take-and-hold',
  layout: 1 | 2 | 3 = 1,
  attackerHomeZone: 'A' | 'B' = 'A',
): BattleSession {
  const armies = [testArmy('a'), testArmy('b')]
  return createCauldronGame({
    gameId: 'geometry-duel',
    armies,
    guidanceLevel: 'fast',
    primaryDeck: 'chapter-approved-duel',
    secondaryDeck: 'chapter-approved',
    officialLayout: layout,
    battlefieldAttackerHomeZone: attackerHomeZone,
    players: armies.map((army, index) => ({
      id: `p-${'ab'[index]}`,
      name: `Player ${'AB'[index]}`,
      armyId: army.id,
      deploymentZone: index === 0 ? 'A' : 'B',
      turnPosition: index === 0 ? 2 : 1,
      operationalPlanId: 'WYNISZCZENIE',
      forceDisposition: index === 0 ? a : b,
    })),
  })
}
const membership = (
  session: BattleSession,
  playerId: string,
  isHost: boolean,
): SharedMembership => ({
  battleId: session.setup.gameId,
  roomId: 'room',
  roomCode: 'ABC123',
  clientId: playerId,
  playerId,
  isHost,
})

describe('official source geometry', () => {
  for (const a of DISPOSITIONS)
    for (const b of DISPOSITIONS)
      for (const layout of [1, 2, 3] as const) {
        it(`${a} vs ${b}, layout ${'ABC'[layout - 1]} selects its actual pairing diagram`, () => {
          const session = duel(a, b, layout)
          const definition = officialBoardDefinition(session.setup)!
          expect(definition).toBeDefined()
          expect(definition.variant).toBe('ABC'[layout - 1])
          expect([...definition.dispositions].sort()).toEqual([a, b].sort())
          const geometry = session.state.battlefield!
          expect(geometry).toMatchObject({
            widthCm: 111.76,
            heightCm: 152.4,
            locked: true,
          })
          expect(Object.keys(geometry.positions).sort()).toEqual(
            session.setup.objectives.map((objective) => objective.id).sort(),
          )
          expect(
            Object.values(geometry.positions).filter(Boolean),
          ).toHaveLength(
            Object.values(definition.objectives).reduce(
              (sum, positions) => sum + positions.length,
              0,
            ),
          )
          expect(() =>
            validateBattlefieldGeometry(session.setup, geometry),
          ).not.toThrow()
          const presentation = battlefieldPresentation(session.setup, geometry)
          expect(presentation).toMatchObject({
            official: true,
            sourcePage: definition.page,
            sourceVersion: '1.0',
          })
          expect(presentation.deploymentAreas).toHaveLength(2)
          expect(presentation.territoryPaths.length).toBeGreaterThan(0)
        })
      }

  it('uses transcribed objective glyph centres from page 9 without fabricating absent IDs', () => {
    const session = duel()
    const geometry = session.state.battlefield!
    expect(geometry.positions['A-HOME']).toEqual({ x: 0.374741, y: 0.1697 })
    expect(geometry.positions['B-HOME']).toEqual({ x: 0.585527, y: 0.788059 })
    expect(geometry.positions['CENTER-1']).toEqual({ x: 0.500396, y: 0.499928 })
    expect(Object.hasOwn(geometry.positions, 'CENTER-2')).toBe(false)
    expect(
      battlefieldPresentation(session.setup, geometry).unplacedIds,
    ).toEqual([])
    expect(session.setup.objectives).toHaveLength(5)
    expect(
      session.setup.objectives.every((objective) =>
        objective.id.endsWith('-HOME')
          ? objective.type === 'home'
          : objective.type === 'neutral',
      ),
    ).toBe(true)
  })

  it('preserves the four-objective Meatgrinder diagrams without fabricating expansion positions', () => {
    for (const variant of [1, 3] as const) {
      const session = duel('purge-the-foe', 'purge-the-foe', variant)
      expect(
        battlefieldPresentation(session.setup, session.state.battlefield!)
          .unplacedIds,
      ).toEqual([])
      expect(Object.keys(session.state.objectives)).toHaveLength(4)
      expect('EXPANSION-1' in session.state.objectives).toBe(false)
    }
  })

  it('matches HOME to Attacker/Defender rather than first turn, and rotation changes only display', () => {
    const first = duel()
    const swapped = duel('take-and-hold', 'take-and-hold', 1, 'B')
    expect(first.state.activePlayerId).toBe('p-b')
    expect(first.state.battlefield!.positions['A-HOME']).toEqual(
      swapped.state.battlefield!.positions['B-HOME'],
    )
    expect(first.state.battlefield!.positions['B-HOME']).toEqual(
      swapped.state.battlefield!.positions['A-HOME'],
    )
    expect(displayBoardPoint({ x: 0.2, y: 0.3 }, true)).toEqual({
      x: 0.8,
      y: 0.7,
    })
    expect(
      displayBoardPoint(displayBoardPoint({ x: 0.2, y: 0.3 }, true), true).x,
    ).toBeCloseTo(0.2)
    expect(first.state.objectives).toEqual(swapped.state.objectives)
  })

  it('rejects official objective moves and dimension changes but allows exact HOME reassignment', () => {
    const session = duel()
    const changed = structuredClone(session.state.battlefield!)
    changed.positions['A-HOME'] = { x: 0.1, y: 0.1 }
    expect(() =>
      dispatchBattleEvent(session, {
        type: 'BATTLEFIELD_LAYOUT_CHANGED',
        payload: { geometry: changed },
      }),
    ).toThrow(/fixed/)
    const mapping = defaultBattlefieldGeometry(session.setup, 'B')
    expect(
      dispatchBattleEvent(session, {
        type: 'BATTLEFIELD_LAYOUT_CHANGED',
        payload: { geometry: mapping },
      }).state.battlefield,
    ).toEqual(mapping)
    expect(() =>
      validateBattlefieldGeometry(session.setup, { ...mapping, widthCm: 180 }),
    ).toThrow(/fixed/)
  })
})

describe('custom geometry, replay and permissions', () => {
  it('displays a history-free saved snapshot without inventing control transitions', () => {
    const session = testCauldronGame()
    session.state.events = []
    session.state.objectives.N1.controllerPlayerId = 'p-c'
    const frames = buildBattlefieldReplay(session)
    expect(frames).toHaveLength(1)
    expect(frames[0].controllers.N1).toBe('p-c')
    expect(frames[0].description).toContain('no event history')
  })
  it('supports seven-objective FFA plus historical N1/N2/N3 and six-objective battles', () => {
    const legacy = testCauldronGame()
    const geometry = legacy.state.battlefield!
    expect(Object.keys(geometry.positions)).toHaveLength(6)
    expect(Object.hasOwn(geometry.positions, 'CENTER')).toBe(false)
    expect(geometry.positions.N2!.x).toBe(1 - geometry.positions.N3!.x)
    const modern = {
      ...legacy.setup,
      objectives: [
        ...legacy.setup.objectives.map((objective) => ({
          ...objective,
          id:
            (
              {
                N1: 'AB-NEUTRAL',
                N2: 'AC-NEUTRAL',
                N3: 'BC-NEUTRAL',
              } as Record<string, string>
            )[objective.id] ?? objective.id,
        })),
        { id: 'CENTER', name: 'CENTER', type: 'neutral' as const },
      ],
    }
    const seven = defaultBattlefieldGeometry(modern)
    expect(Object.keys(seven.positions)).toHaveLength(7)
    expect(seven.positions.CENTER).toEqual({ x: 0.5, y: 0.5 })
    expect(seven.positions['AC-NEUTRAL']).toEqual(geometry.positions.N2)
    expect(battlefieldPresentation(modern, seven)).toMatchObject({
      official: false,
      territoryPaths: [],
    })
  })

  it('uses a clearly schematic Cauldron Duel fallback', () => {
    const session = duel()
    const setup = { ...session.setup, rulesetConfig: undefined }
    const geometry = defaultBattlefieldGeometry(setup)
    expect(battlefieldPresentation(setup, geometry)).toMatchObject({
      official: false,
      title: 'Cauldron Duel · schematic',
    })
    expect(Object.keys(geometry.positions)).toHaveLength(session.setup.objectives.length)
  })

  it('persists normalized positions and dimensions, including undo, redo and legacy rehydration', () => {
    const before = testCauldronGame()
    const geometry = {
      ...structuredClone(before.state.battlefield!),
      widthCm: 160,
      locked: true,
    }
    geometry.positions.N1 = { x: 0.32, y: 0.67 }
    const after = dispatchBattleEvent(before, {
      type: 'BATTLEFIELD_LAYOUT_CHANGED',
      payload: { geometry },
    })
    expect(after.state.objectives).toEqual(before.state.objectives)
    expect(
      deserializeBattleSession(serializeBattleSession(after)).state.battlefield,
    ).toEqual(geometry)
    expect(undoLastAction(after).state.battlefield).toEqual(
      before.state.battlefield,
    )
    expect(redoLastAction(undoLastAction(after)).state.battlefield).toEqual(
      geometry,
    )
    const old = structuredClone(before)
    delete old.state.battlefield
    expect(
      deserializeBattleSession(serializeBattleSession(old)).state.battlefield,
    ).toEqual(before.state.battlefield)
  })

  it('rejects malformed dimensions, positions, missing/extra IDs and custom null placements', () => {
    const session = testCauldronGame(),
      valid = session.state.battlefield!
    for (const geometry of [
      { ...valid, widthCm: NaN },
      { ...valid, heightCm: 0 },
      { ...valid, positions: {} },
      {
        ...valid,
        positions: { ...valid.positions, EXTRA: { x: 0.5, y: 0.5 } },
      },
      { ...valid, positions: { ...valid.positions, N1: { x: 1.1, y: 0.5 } } },
      { ...valid, positions: { ...valid.positions, N1: null } },
    ]) {
      expect(() =>
        validateBattlefieldGeometry(session.setup, geometry),
      ).toThrow()
    }
  })

  it('reserves geometry to host while retaining participant objective-control permissions', () => {
    const before = testCauldronGame()
    const geometry = { ...before.state.battlefield!, widthCm: 160 }
    const after = dispatchBattleEvent(before, {
      type: 'BATTLEFIELD_LAYOUT_CHANGED',
      payload: { geometry },
    })
    expect(
      authorizeSharedMutation(before, after, membership(before, 'p-b', false))
        .allowed,
    ).toBe(false)
    expect(
      authorizeSharedMutation(before, after, membership(before, 'p-b', true))
        .allowed,
    ).toBe(true)
    const control = dispatchBattleEvent(before, {
      type: 'OBJECTIVE_CONTROL_CHANGED',
      payload: { objectiveId: 'N1', controllerPlayerId: 'p-b' },
    })
    expect(
      authorizeSharedMutation(before, control, membership(before, 'p-b', false))
        .allowed,
    ).toBe(true)
    const officialBefore = duel()
    const mapped = dispatchBattleEvent(officialBefore, {
      type: 'BATTLEFIELD_LAYOUT_CHANGED',
      payload: {
        geometry: defaultBattlefieldGeometry(officialBefore.setup, 'B'),
      },
    })
    expect(getDuelConditions(mapped, 'p-a', 'turn')).toEqual(
      getDuelConditions(officialBefore, 'p-a', 'turn'),
    )
  })

  it('replays control and scores at every event within the same round, including OC and corrections', () => {
    const session = dispatchBattleEvents(testCauldronGame(), [
      {
        type: 'OBJECTIVE_CONTROL_CHANGED',
        payload: { objectiveId: 'N1', controllerPlayerId: 'p-a' },
      },
      { type: 'TURN_STARTED', payload: { playerId: 'p-b' } },
      {
        type: 'OBJECTIVE_CONTROL_CHANGED',
        payload: { objectiveId: 'N1', controllerPlayerId: 'p-b' },
      },
      {
        type: 'SCORE_ADJUSTED',
        payload: { playerId: 'p-b', category: 'primary', delta: 5 },
      },
      {
        type: 'STATE_CORRECTED',
        payload: {
          correction: {
            kind: 'SCORE',
            playerId: 'p-b',
            category: 'primary',
            value: 3,
          },
          reason: 'Wrong award',
        },
      },
      {
        type: 'OBJECTIVE_OC_CHANGED',
        payload: { objectiveId: 'N1', playerId: 'p-c', oc: 4 },
      },
    ])
    const before = serializeBattleSession(session)
    const frames = buildBattlefieldReplay(session)
    expect(frames.slice(-6).map((frame) => frame.controllers.N1)).toEqual([
      'p-a',
      'p-a',
      'p-b',
      'p-b',
      'p-b',
      'p-c',
    ])
    expect(frames.slice(-3).map((frame) => frame.scores['p-b'])).toEqual([
      5, 3, 3,
    ])
    expect(new Set(frames.slice(-6).map((frame) => frame.round))).toEqual(
      new Set([1]),
    )
    expect(serializeBattleSession(session)).toBe(before)
  })

  it('keeps old geometry in earlier frames and ignores duplicate event IDs', () => {
    const initial = testCauldronGame()
    const geometry = { ...initial.state.battlefield!, widthCm: 160 }
    const session = dispatchBattleEvent(initial, {
      type: 'BATTLEFIELD_LAYOUT_CHANGED',
      payload: { geometry },
    })
    const frames = buildBattlefieldReplay(session)
    expect(frames.at(-2)!.geometry.widthCm).toBe(180)
    expect(frames.at(-1)!.geometry.widthCm).toBe(160)
    const duplicate = {
      ...session,
      state: {
        ...session.state,
        events: [...session.state.events, session.state.events.at(-1)!],
      },
    }
    expect(buildBattlefieldReplay(duplicate)).toEqual(frames)
  })

  it('handles hundreds of events in one pass without mutating battle or report scoring', () => {
    const initial = testCauldronGame()
    const inputs = Array.from({ length: 600 }, (_, index) => ({
      type: 'OBJECTIVE_CONTROL_CHANGED' as const,
      payload: {
        objectiveId: 'N1',
        controllerPlayerId: index % 2 ? 'p-b' : 'p-a',
      },
    }))
    const session = dispatchBattleEvents(initial, inputs)
    const before = buildBattleReport(session)
    expect(buildBattlefieldReplay(session)).toHaveLength(
      session.state.events.length + 1,
    )
    expect(buildBattleReport(session)).toEqual(before)
  })
})


describe('Battlefield 2.0 objective footprint visuals and balanced FFA', () => {
  it('places all three FFA HOME points at the same physical radius on 180×120 cm', () => {
    const session = testCauldronGame()
    const g = defaultBattlefieldGeometry(session.setup)
    const radius = (id: string) => {
      const p = g.positions[id]!
      return Math.hypot((p.x - 0.5) * g.widthCm, (p.y - 0.5) * g.heightCm)
    }
    expect(radius('A-HOME')).toBeCloseTo(radius('B-HOME'), 9)
    expect(radius('A-HOME')).toBeCloseTo(radius('C-HOME'), 9)
    expect(g.positions.N2!.x).toBeLessThan(0.5)
    expect(g.positions.N3!.x).toBeGreaterThan(0.5)
    expect(g.positions.N1!.y).toBeLessThan(0.5)
  })

  it('round trips custom terrain footprints, replay, undo and scoring unchanged', () => {
    const initial = testCauldronGame()
    const geometry = structuredClone(initial.state.battlefield!)
    geometry.footprints = {
      N1: { kind: 'rectangle', widthCm: 24, heightCm: 16, rotation: 45 },
      N2: { kind: 'chamfered', widthCm: 20, heightCm: 12, rotation: 0 },
    }
    const changed = dispatchBattleEvent(initial, {
      type: 'BATTLEFIELD_LAYOUT_CHANGED', payload: { geometry },
    })
    expect(changed.state.objectives).toEqual(initial.state.objectives)
    expect(changed.state.players).toEqual(initial.state.players)
    expect(deserializeBattleSession(serializeBattleSession(changed)).state.battlefield).toEqual(geometry)
    expect(buildBattlefieldReplay(changed).at(-1)?.geometry.footprints).toEqual(geometry.footprints)
    expect(buildBattlefieldReplay(changed).at(-2)?.geometry.footprints).toBeUndefined()
    expect(undoLastAction(changed).state.battlefield).toEqual(initial.state.battlefield)
    expect(redoLastAction(undoLastAction(changed)).state.battlefield).toEqual(geometry)
    expect(authorizeSharedMutation(initial, changed, membership(initial, 'p-b', false)).allowed).toBe(false)
    expect(authorizeSharedMutation(initial, changed, membership(initial, 'p-b', true)).allowed).toBe(true)
  })

  it('rejects malformed or official overrides while tolerating older geometry without footprints', () => {
    const session = testCauldronGame()
    const valid = structuredClone(session.state.battlefield!)
    expect(() => validateBattlefieldGeometry(session.setup, valid)).not.toThrow()
    for (const footprints of [
      { N99: { kind: 'rectangle', widthCm: 20, heightCm: 10, rotation: 0 } },
      { N1: { kind: 'rectangle', widthCm: -1, heightCm: 10, rotation: 0 } },
      { N1: { kind: 'ellipse', widthCm: 20, heightCm: 10, rotation: 0 } },
      { N1: { kind: 'chamfered', widthCm: 20, heightCm: 10, rotation: 360 } },
      { N1: { kind: 'chamfered', widthCm: Number.NaN, heightCm: 10, rotation: 0 } },
    ]) expect(() => validateBattlefieldGeometry(session.setup, { ...valid, footprints })).toThrow()
    const official = duel()
    expect(() => validateBattlefieldGeometry(official.setup, {
      ...official.state.battlefield!,
      footprints: { 'A-HOME': { kind: 'rectangle', widthCm: 20, heightCm: 12, rotation: 0 } },
    })).toThrow(/Official geometry/)
  })
})

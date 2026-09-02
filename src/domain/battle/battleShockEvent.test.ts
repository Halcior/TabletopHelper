import { describe, expect, it } from 'vitest'
import {
  deserializeBattleSession,
  dispatchBattleEvent,
  serializeBattleSession,
  undoLastAction,
} from './engine'
import { testCauldronGame } from '../../rulesets/cauldronFFA3/cauldronTestUtils'

describe('Battle-shock test result event', () => {
  it('projects fail/pass state and restores the previous state on undo', () => {
    let session = testCauldronGame()
    session = dispatchBattleEvent(session, {
      type: 'BATTLESHOCK_TEST_RESOLVED',
      payload: { playerId: 'p-a', unitId: 'infantry', passed: false },
    }, { actorPlayerId: 'p-a' })

    expect(session.state.players['p-a'].units.infantry.battleShocked).toBe(true)
    expect(session.state.events.at(-1)?.type).toBe('BATTLESHOCK_TEST_RESOLVED')

    session = dispatchBattleEvent(session, {
      type: 'BATTLESHOCK_TEST_RESOLVED',
      payload: { playerId: 'p-a', unitId: 'infantry', passed: true },
    }, { actorPlayerId: 'p-a' })
    expect(session.state.players['p-a'].units.infantry.battleShocked).toBe(false)

    session = undoLastAction(session)
    expect(session.state.players['p-a'].units.infantry.battleShocked).toBe(true)
  })

  it('keeps an explicit failed result through persistence replay', () => {
    const session = dispatchBattleEvent(testCauldronGame(), {
      type: 'BATTLESHOCK_TEST_RESOLVED',
      payload: { playerId: 'p-a', unitId: 'infantry', passed: false },
    }, { actorPlayerId: 'p-a' })

    const restored = deserializeBattleSession(serializeBattleSession(session))
    expect(restored.state.players['p-a'].units.infantry.battleShocked).toBe(true)
    expect(restored.state.events.at(-1)?.type).toBe('BATTLESHOCK_TEST_RESOLVED')
  })
})

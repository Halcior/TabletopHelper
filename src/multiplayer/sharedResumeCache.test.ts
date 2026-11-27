import { expect, it } from 'vitest'
import { dispatchBattleEvents } from '../domain/battle/engine'
import { testCauldronGame } from '../rulesets/cauldronFFA3/cauldronTestUtils'
import { acknowledgeSharedOutbox, appendSharedOutbox, readSharedOutbox, readSharedStartedAt, writeSharedStartedAt } from './sharedResumeCache'
import type { SharedMembership } from './types'

function localStorageFixture(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => values.delete(key),
    setItem: (key, value) => { values.set(key, value) },
  }
}

const seat: SharedMembership = {
  roomId: 'room', roomCode: 'ABC234', battleId: 'battle', playerId: 'p-a', clientId: 'a', isHost: true,
}

it('preserves independent batches and their event order when another batch is acknowledged', () => {
  const storage = localStorageFixture()
  expect(readSharedOutbox(storage, seat)).toBeNull()
  const started = testCauldronGame()
  const local = dispatchBattleEvents(started, [1, 2, 3].map(amount => ({
    type: 'CP_GAINED', payload: { amount, playerId: seat.playerId },
  })))
  const [first, second, third] = local.state.events.slice(-3)

  appendSharedOutbox(storage, seat, [first, second])
  appendSharedOutbox(storage, seat, [third])
  expect(readSharedOutbox(storage, seat)).toEqual([first, second, third])
  acknowledgeSharedOutbox(storage, seat, new Set([first.id]))
  expect(readSharedOutbox(storage, seat)).toEqual([second, third])
  acknowledgeSharedOutbox(storage, seat, new Set([second.id, third.id]))
  expect(readSharedOutbox(storage, seat)).toEqual([])
})

it('scopes start confirmation and pending actions to the saved room and seat', () => {
  const storage = localStorageFixture()
  const startedAt = '2026-11-27T10:00:00.000Z'
  const otherSeat = { ...seat, playerId: 'p-b' }
  writeSharedStartedAt(storage, seat, startedAt)
  appendSharedOutbox(storage, seat, [])
  expect(readSharedStartedAt(storage, seat)).toBe(startedAt)
  expect(readSharedStartedAt(storage, otherSeat)).toBeNull()
  expect(readSharedOutbox(storage, otherSeat)).toBeNull()
})

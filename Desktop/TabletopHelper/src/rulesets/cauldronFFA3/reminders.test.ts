import { describe, expect, it } from 'vitest'
import { dispatchBattleEvent } from '../../domain/battle/engine'
import { testCauldronGame } from './cauldronTestUtils'
import { getCauldronReminders } from './reminders'

describe('Cauldron reminder presentation', () => {
  it('prioritizes actionable state without repeating the Rival shown in the battle header', () => {
    const reminders = getCauldronReminders(testCauldronGame())

    expect(reminders).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'command-cp', state: 'action', status: 'Player action' }),
      expect.objectContaining({ id: 'change-plan', state: 'action' }),
      expect.objectContaining({ id: 'round-snapshot', state: 'complete', status: 'Automatic' }),
    ]))
    expect(reminders.some((reminder) => reminder.title.includes('Current Rival'))).toBe(false)
  })

  it('marks the Command phase CP reminder complete after the gain is recorded', () => {
    const session = dispatchBattleEvent(testCauldronGame(), {
      type: 'CP_GAINED',
      payload: { playerId: 'p-a', amount: 1 },
    })

    expect(getCauldronReminders(session)).toContainEqual(expect.objectContaining({
      id: 'command-cp',
      title: '+1 CP recorded',
      state: 'complete',
      status: 'Done',
    }))
  })
})

import { describe, expect, it } from 'vitest'
import { dispatchBattleEvent } from '../battle/engine'
import { testCauldronGame } from '../../rulesets/cauldronFFA3/cauldronTestUtils'
import { buildBattleContext } from './contextEngine'

describe('Guided Mode progression guard', () => {
  it('blocks leaving Command until the phase CP gain is recorded', () => {
    const session = testCauldronGame()
    const context = buildBattleContext({ session })
    const cp = context.blockingItems.find((item) => item.type === 'COMMAND_POINT')

    expect(cp?.status).toBe('BLOCKING')
    expect(cp?.actions[0]).toMatchObject({ type: 'GAIN_COMMAND_POINT', label: '+1 CP' })
    expect(cp?.title).toMatch(/before advancing/i)
  })

  it('clears the blocker after CP is recorded and keeps Fast Mode non-blocking', () => {
    let session = testCauldronGame()
    session = dispatchBattleEvent(session, {
      type: 'CP_GAINED',
      payload: { playerId: session.state.activePlayerId, amount: 1 },
    })

    const guided = buildBattleContext({ session })
    expect(guided.blockingItems.some((item) => item.type === 'COMMAND_POINT')).toBe(false)
    expect(guided.sections.flatMap((section) => section.items)
      .find((item) => item.type === 'COMMAND_POINT')?.status).toBe('DONE')

    const fastSession = {
      ...testCauldronGame(),
      setup: { ...testCauldronGame().setup, guidanceLevel: 'fast' as const },
    }
    const fast = buildBattleContext({ session: fastSession })
    expect(fast.blockingItems.some((item) => item.type === 'COMMAND_POINT')).toBe(false)
    expect(fast.sections.flatMap((section) => section.items)
      .find((item) => item.type === 'COMMAND_POINT')?.status).toBe('AVAILABLE')
  })
})

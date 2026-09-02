import { describe, expect, it } from 'vitest'
import { advanceCauldronPhase } from '../../rulesets/cauldronFFA3'
import { testCauldronGame } from '../../rulesets/cauldronFFA3/cauldronTestUtils'
import { getCurrentReactionWindow, requestReactionHold } from './battleIntegration'
import type { StratagemDefinition } from './types'

function shootingSession() {
  let session = testCauldronGame()
  while (session.state.phase !== 'SHOOTING') session = advanceCauldronPhase(session)
  return session
}

const returnFire: StratagemDefinition = {
  id: 'return-fire-test',
  kind: 'STRATAGEM',
  name: 'Return fire test',
  description: 'Structured reaction timing test.',
  ownerScope: 'OPPONENT',
  phases: ['SHOOTING'],
  triggers: ['UNIT_SELECTED_TO_SHOOT'],
  reaction: true,
  source: 'test',
  cpCost: 0,
}

describe('explicit HOLD timing selection', () => {
  it('uses the selected structured trigger to expose an exact reaction', () => {
    const session = requestReactionHold(shootingSession(), 'p-b', {
      trigger: 'UNIT_SELECTED_TO_SHOOT',
      context: { actingPlayerId: 'p-a', triggerSubjectPlayerId: 'p-a' },
      definitionsByPlayer: {
        'p-a': [],
        'p-b': [returnFire],
        'p-c': [],
      },
      timestamp: '2026-09-02T12:30:00.000Z',
    })

    const window = getCurrentReactionWindow(session)
    expect(window?.requestedByPlayerId).toBe('p-b')
    expect(window?.trigger).toBe('UNIT_SELECTED_TO_SHOOT')
    expect(window?.responses['p-b']).toMatchObject({
      status: 'PENDING',
      availableOptionIds: ['return-fire-test'],
    })
  })

  it('still pauses the table when HOLD is explicit but no registered option matches', () => {
    const session = requestReactionHold(shootingSession(), 'p-b', {
      trigger: 'CUSTOM_CONFIRMATION',
      context: { actingPlayerId: 'p-a' },
      definitionsByPlayer: {
        'p-a': [],
        'p-b': [returnFire],
        'p-c': [],
      },
      timestamp: '2026-09-02T12:31:00.000Z',
    })

    expect(getCurrentReactionWindow(session)?.responses['p-b']).toMatchObject({
      status: 'PENDING',
      availableOptionIds: [],
    })
  })
})

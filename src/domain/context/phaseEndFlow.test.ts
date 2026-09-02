import { describe, expect, it } from 'vitest'
import { advanceCauldronPhase } from '../../rulesets/cauldronFFA3'
import { testCauldronGame } from '../../rulesets/cauldronFFA3/cauldronTestUtils'
import {
  getCurrentReactionWindow,
  passReaction,
  processReactionTrigger,
} from '../stratagems/battleIntegration'
import type { StratagemDefinition } from '../stratagems/types'
import {
  selectReactionPlayersAtCheckpoint,
  selectRelevantStratagemsAtCheckpoint,
} from './selectors'
import type { CurrentTimingCheckpoint } from './timingContext'
import type { ContextRulesByPlayer } from './types'

function toShooting() {
  let session = testCauldronGame()
  while (session.state.phase !== 'SHOOTING') session = advanceCauldronPhase(session)
  return session
}

function definition(input: {
  id: string
  ownerScope: StratagemDefinition['ownerScope']
  reaction: boolean
  triggers?: StratagemDefinition['triggers']
}): StratagemDefinition {
  return {
    id: input.id,
    kind: 'STRATAGEM',
    name: input.id,
    description: 'Structured end-of-phase test option.',
    ownerScope: input.ownerScope,
    phases: ['SHOOTING'],
    triggers: input.triggers ?? ['PHASE_END'],
    reaction: input.reaction,
    source: 'test',
    cpCost: 0,
  }
}

describe('guided end-of-phase flow', () => {
  it('finds explicit PHASE_END options, resolves opponent reactions, then allows phase advance', () => {
    let session = toShooting()
    const activeOption = definition({ id: 'active-end', ownerScope: 'ACTIVE_PLAYER', reaction: false })
    const reaction = definition({ id: 'reaction-end', ownerScope: 'OPPONENT', reaction: true })
    const manualOnly = definition({
      id: 'manual-only',
      ownerScope: 'ACTIVE_PLAYER',
      reaction: false,
      triggers: ['CUSTOM_CONFIRMATION'],
    })
    const rulesData: ContextRulesByPlayer = {
      'p-a': {
        stratagems: [
          {
            definition: activeOption,
            classification: 'ACTIVE',
            manualConfirmationRequired: false,
            fullyAutomatedTiming: true,
          },
          {
            definition: manualOnly,
            classification: 'ACTIVE',
            manualConfirmationRequired: true,
            fullyAutomatedTiming: false,
          },
        ],
      },
      'p-b': {
        stratagems: [{
          definition: reaction,
          classification: 'REACTION',
          manualConfirmationRequired: false,
          fullyAutomatedTiming: true,
        }],
      },
      'p-c': { stratagems: [] },
    }
    const checkpoint: CurrentTimingCheckpoint = {
      triggers: ['PHASE_END'],
      context: {
        actingPlayerId: 'p-a',
        phaseEndCheckpointKey: '1:p-a:SHOOTING',
      },
    }

    const activeOptions = selectRelevantStratagemsAtCheckpoint(
      session,
      rulesData,
      checkpoint,
      'p-a',
      { allowCustomFallback: false },
    )
    expect(activeOptions.map((option) => option.definition.id)).toEqual(['active-end'])

    const reactionPlayers = selectReactionPlayersAtCheckpoint(
      session,
      rulesData,
      checkpoint,
      { allowCustomFallback: false },
    )
    expect(reactionPlayers.find((player) => player.playerId === 'p-b')?.exactCount).toBe(1)

    session = processReactionTrigger(session, {
      trigger: 'PHASE_END',
      context: checkpoint.context,
      definitionsByPlayer: {
        'p-a': [activeOption, manualOnly],
        'p-b': [reaction],
        'p-c': [],
      },
      timestamp: '2026-09-02T12:00:00.000Z',
    }).session

    const window = getCurrentReactionWindow(session)
    expect(window).toMatchObject({
      trigger: 'PHASE_END',
      activePlayerId: 'p-a',
      status: 'OPEN',
      context: { phaseEndCheckpointKey: '1:p-a:SHOOTING' },
    })

    session = passReaction(session, window!.id, 'p-b', '2026-09-02T12:00:01.000Z')
    expect(getCurrentReactionWindow(session)).toBeUndefined()

    session = advanceCauldronPhase(session)
    expect(session.state.phase).toBe('CHARGE')
  })
})

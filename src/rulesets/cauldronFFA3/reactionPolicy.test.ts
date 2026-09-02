import { describe, expect, it } from 'vitest'
import type { StratagemDefinition, StratagemUsageState, TimingStateView } from '../../domain/stratagems/types'
import { cauldronReactionPolicy } from './reactionPolicy'

const reaction: StratagemDefinition = {
  id: 'reaction-a',
  kind: 'STRATAGEM',
  name: 'Reaction A',
  description: 'test',
  cpCost: 1,
  ownerScope: 'OPPONENT',
  phases: ['SHOOTING'],
  triggers: ['UNIT_SELECTED_AS_TARGET'],
  reaction: true,
  source: 'test',
}

const otherReaction: StratagemDefinition = { ...reaction, id: 'reaction-b', name: 'Reaction B' }
const usage: StratagemUsageState = {
  playerId: 'p2',
  stratagemId: reaction.id,
  usedThisTurn: 0,
  usedThisBattleRound: 0,
  usedThisPhase: 0,
  timesUsedBattle: 0,
}

function state(events: TimingStateView['events'] = []): TimingStateView {
  return {
    round: 1,
    activePlayerId: 'p1',
    phase: 'SHOOTING',
    players: { p1: { cp: 3 }, p2: { cp: 3 }, p3: { cp: 3 } },
    events,
  }
}

function check(gameState: TimingStateView, definition = reaction) {
  return cauldronReactionPolicy.canUseReaction({
    playerId: 'p2',
    gameState,
    phase: 'SHOOTING',
    trigger: 'UNIT_SELECTED_AS_TARGET',
    context: {},
    definition,
    usage: { ...usage, stratagemId: definition.id },
  })
}

describe('Cauldron FFA 3 reaction policy', () => {
  it('allows the first reaction in an opponent turn', () => {
    expect(check(state())).toBe(true)
  })

  it('allows only one reaction Stratagem during the same opponent turn', () => {
    const result = check(state([
      { type: 'TURN_STARTED', payload: { playerId: 'p1' } },
      { type: 'STRATAGEM_USED', payload: { playerId: 'p2', stratagemId: reaction.id, reactionWindowId: 'rw-1' } },
    ]), otherReaction)
    expect(result).toMatchObject({ allowed: false })
    if (typeof result !== 'boolean') expect(result.reason).toMatch(/one reaction Stratagem/i)
  })

  it('still blocks the same reaction later in the Battle Round after a new opponent turn starts', () => {
    const result = check(state([
      { type: 'ROUND_STARTED', payload: { round: 1 } },
      { type: 'TURN_STARTED', payload: { playerId: 'p1' } },
      { type: 'STRATAGEM_USED', payload: { playerId: 'p2', stratagemId: reaction.id, reactionWindowId: 'rw-1' } },
      { type: 'TURN_STARTED', payload: { playerId: 'p3' } },
    ]))
    expect(result).toMatchObject({ allowed: false })
    if (typeof result !== 'boolean') expect(result.reason).toMatch(/Battle Round/i)
  })

  it('resets the same-reaction limit in a new Battle Round', () => {
    expect(check(state([
      { type: 'ROUND_STARTED', payload: { round: 1 } },
      { type: 'TURN_STARTED', payload: { playerId: 'p1' } },
      { type: 'STRATAGEM_USED', payload: { playerId: 'p2', stratagemId: reaction.id, reactionWindowId: 'rw-1' } },
      { type: 'ROUND_STARTED', payload: { round: 2 } },
      { type: 'TURN_STARTED', payload: { playerId: 'p3' } },
    ]))).toBe(true)
  })

  it('does not count an active use that was not made through a reaction window', () => {
    expect(check(state([
      { type: 'TURN_STARTED', payload: { playerId: 'p1' } },
      { type: 'STRATAGEM_USED', payload: { playerId: 'p2', stratagemId: reaction.id } },
    ]))).toBe(true)
  })
})

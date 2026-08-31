import { describe, expect, it } from 'vitest'
import {
  advancePhase,
  createBattleSession,
  deserializeBattleSession,
  dispatchBattleEvent,
  serializeBattleSession,
  undoLastAction,
} from '../battle/engine'
import type { BattleSession, GuidanceLevel } from '../battle/types'
import {
  getCurrentReactionWindow,
  isBattleFlowPaused,
  passReaction,
  processReactionTrigger,
  requestReactionHold,
  useStratagem,
} from './battleIntegration'
import { getReactionOpportunity } from './reactionEngine'
import { getAvailableStratagems } from './timingEngine'
import { getUsage } from './usage'
import type { StandardUsageLimit, StratagemDefinition } from './types'

function battle(mode: GuidanceLevel = 'guided', cp = 3): BattleSession {
  return createBattleSession({
    gameId: `reaction-${mode}`,
    rulesetId: 'generic',
    guidanceLevel: mode,
    createdAt: '2026-08-31T12:00:00.000Z',
    players: [
      { id: 'p1', name: 'Alpha', startingCp: cp },
      { id: 'p2', name: 'Bravo', startingCp: cp },
      { id: 'p3', name: 'Charlie', startingCp: cp },
    ],
  })
}

function definition(overrides: Partial<StratagemDefinition> = {}): StratagemDefinition {
  return {
    id: 'test-stratagem',
    kind: 'STRATAGEM',
    name: 'Test Stratagem',
    description: 'Fictional test rule.',
    cpCost: 1,
    ownerScope: 'ANY_PLAYER',
    phases: ['ANY'],
    triggers: ['PHASE_START'],
    reaction: false,
    usageLimits: [],
    source: 'Test',
    ...overrides,
  }
}

function shooting(current: BattleSession): BattleSession {
  return dispatchBattleEvent(current, { type: 'PHASE_CHANGED', payload: { phase: 'SHOOTING' } })
}

function availability(current: BattleSession, stratagem: StratagemDefinition, playerId = 'p1') {
  return getAvailableStratagems({
    playerId,
    gameState: current.state,
    trigger: stratagem.triggers[0],
    definitions: [stratagem],
    context: { targetPlayerId: 'p2' },
  })[0]
}

function limited(limit: StandardUsageLimit): StratagemDefinition {
  return definition({ id: limit.toLowerCase(), usageLimits: [limit] })
}

const targetedReaction = definition({
  id: 'targeted-reaction',
  name: 'Targeted Reaction',
  ownerScope: 'OPPONENT',
  phases: ['SHOOTING'],
  triggers: ['UNIT_SELECTED_AS_TARGET'],
  reaction: true,
  restrictions: [{
    id: 'own-unit-targeted',
    description: 'Only the targeted player can use this.',
    evaluate: ({ playerId, context }) => context.targetPlayerId === playerId,
  }],
})

function reactionDefinitions() {
  return { p1: [], p2: [targetedReaction], p3: [targetedReaction] }
}

function openTargetedReaction(current: BattleSession): BattleSession {
  return processReactionTrigger(shooting(current), {
    trigger: 'UNIT_SELECTED_AS_TARGET',
    context: { targetPlayerId: 'p2', sourceUnitId: 'attacker', targetUnitId: 'defender' },
    definitionsByPlayer: reactionDefinitions(),
    timestamp: '2026-08-31T12:05:00.000Z',
  }).session
}

describe('Stratagem timing', () => {
  it('shows a phase-specific Stratagem only in the correct phase', () => {
    const stratagem = definition({ phases: ['SHOOTING'] })
    const current = battle()
    expect(availability(current, stratagem)).toBeUndefined()
    expect(availability(shooting(current), stratagem)?.canUse).toBe(true)
  })

  it('does not show an active-player Stratagem to an opponent', () => {
    const stratagem = definition({ ownerScope: 'ACTIVE_PLAYER' })
    const current = battle()
    expect(availability(current, stratagem, 'p1')?.canUse).toBe(true)
    expect(availability(current, stratagem, 'p2')).toBeUndefined()
  })

  it('shows a reaction only to the correct targeted opponent', () => {
    const current = shooting(battle())
    const opportunity = getReactionOpportunity({
      gameState: current.state,
      trigger: 'UNIT_SELECTED_AS_TARGET',
      context: { targetPlayerId: 'p2' },
      definitionsByPlayer: reactionDefinitions(),
    })
    expect(opportunity.eligiblePlayerIds).toEqual(['p2'])
    expect(opportunity.reactionsByPlayer.p2[0].definition.id).toBe(targetedReaction.id)
    expect(opportunity.reactionsByPlayer.p3).toEqual([])
  })

  it('keeps an in-timing Stratagem visible but disables it when CP is insufficient', () => {
    const current = battle('guided', 0)
    const result = availability(current, definition({ cpCost: 2 }))
    expect(result?.canUse).toBe(false)
    expect(result?.reasons.join(' ')).toContain('Requires 2 CP')
  })

  it.each([
    ['ONCE_PER_PHASE', 'phase'],
    ['ONCE_PER_TURN', 'turn'],
    ['ONCE_PER_BATTLE_ROUND', 'battle round'],
    ['ONCE_PER_BATTLE', 'battle'],
  ] as const)('enforces the %s usage limit', (limit, scopeLabel) => {
    const stratagem = limited(limit)
    let current = battle()
    current = useStratagem(current, {
      playerId: 'p1', definition: stratagem, trigger: 'PHASE_START', timestamp: '2026-08-31T12:01:00.000Z',
    })
    expect(availability(current, stratagem)?.canUse).toBe(false)
    expect(availability(current, stratagem)?.reasons.join(' ')).toContain(scopeLabel)
  })

  it('resets phase, turn, and battle-round counters at their event boundaries but never the battle counter', () => {
    const limits = {
      phase: limited('ONCE_PER_PHASE'),
      turn: limited('ONCE_PER_TURN'),
      round: limited('ONCE_PER_BATTLE_ROUND'),
      battle: limited('ONCE_PER_BATTLE'),
    }
    let current = battle('guided', 20)
    for (const stratagem of Object.values(limits)) {
      current = useStratagem(current, { playerId: 'p1', definition: stratagem, trigger: 'PHASE_START' })
    }
    current = dispatchBattleEvent(current, { type: 'PHASE_CHANGED', payload: { phase: 'MOVEMENT' } })
    expect(availability(current, limits.phase)?.canUse).toBe(true)
    expect(availability(current, limits.turn)?.canUse).toBe(false)

    current = dispatchBattleEvent(current, { type: 'TURN_STARTED', payload: { playerId: 'p2' } })
    expect(availability(current, limits.turn)?.canUse).toBe(true)
    expect(availability(current, limits.round)?.canUse).toBe(false)

    current = dispatchBattleEvent(current, { type: 'ROUND_STARTED', payload: { round: 2 } })
    expect(availability(current, limits.round)?.canUse).toBe(true)
    expect(availability(current, limits.battle)?.canUse).toBe(false)
  })
})

describe('Reaction windows and battle events', () => {
  it('opens a hard Guided window, auto-passes a player with no reaction, and waits', () => {
    const current = openTargetedReaction(battle())
    const window = getCurrentReactionWindow(current)
    expect(window?.behavior).toBe('HARD')
    expect(window?.responses.p2.status).toBe('PENDING')
    expect(window?.responses.p3).toMatchObject({ status: 'PASS', automatic: true })
    expect(isBattleFlowPaused(current)).toBe(true)
    expect(advancePhase(current)).toBe(current)
  })

  it('PASS resolves a window after all required responses are complete', () => {
    let current = openTargetedReaction(battle())
    const id = getCurrentReactionWindow(current)!.id
    current = passReaction(current, id, 'p2', '2026-08-31T12:06:00.000Z')
    expect(current.state.timing.reactionWindows[id].responses.p2.status).toBe('PASS')
    expect(current.state.timing.reactionWindows[id].status).toBe('RESOLVED')
    expect(current.state.timing.activeReactionWindowId).toBeNull()
  })

  it('FAST mode exposes a soft opportunity without opening or blocking a window', () => {
    const current = shooting(battle('fast'))
    const result = processReactionTrigger(current, {
      trigger: 'UNIT_SELECTED_AS_TARGET',
      context: { targetPlayerId: 'p2' },
      definitionsByPlayer: reactionDefinitions(),
    })
    expect(result.opportunity.eligiblePlayerIds).toEqual(['p2'])
    expect(result.session).toBe(current)
    expect(getCurrentReactionWindow(result.session)).toBeUndefined()
    expect(isBattleFlowPaused(result.session)).toBe(false)
  })

  it('HOLD opens a hard window even without a preselected or currently legal Stratagem', () => {
    const current = requestReactionHold(battle('fast'), 'p2', {
      trigger: 'CUSTOM_CONFIRMATION',
      definitionsByPlayer: { p1: [], p2: [], p3: [] },
      timestamp: '2026-08-31T12:02:00.000Z',
    })
    const window = getCurrentReactionWindow(current)
    expect(window?.requestedByPlayerId).toBe('p2')
    expect(window?.responses.p2.status).toBe('PENDING')
    expect(window?.responses.p3).toMatchObject({ status: 'PASS', automatic: true })
    expect(isBattleFlowPaused(current)).toBe(true)
    expect(current.state.events.at(-1)?.type).toBe('REACTION_HOLD_REQUESTED')
  })

  it('spends CP, records usage, logs use, resolves the window, and restores all of it on undo', () => {
    let current = openTargetedReaction(battle())
    const windowId = getCurrentReactionWindow(current)!.id
    const cpBefore = current.state.players.p2.cp
    current = useStratagem(current, {
      playerId: 'p2',
      definition: targetedReaction,
      trigger: 'UNIT_SELECTED_AS_TARGET',
      reactionWindowId: windowId,
      timestamp: '2026-08-31T12:07:00.000Z',
    })
    expect(current.state.players.p2.cp).toBe(cpBefore - 1)
    expect(getUsage(current.state.timing, 'p2', targetedReaction.id).timesUsedBattle).toBe(1)
    expect(current.state.timing.reactionWindows[windowId]).toMatchObject({ status: 'RESOLVED' })
    expect(current.state.events.slice(-3).map(({ type }) => type)).toEqual([
      'CP_SPENT', 'STRATAGEM_USED', 'REACTION_WINDOW_RESOLVED',
    ])

    current = undoLastAction(current)
    expect(current.state.players.p2.cp).toBe(cpBefore)
    expect(getUsage(current.state.timing, 'p2', targetedReaction.id).timesUsedBattle).toBe(0)
    expect(current.state.timing.reactionWindows[windowId].responses.p2.status).toBe('PENDING')
    expect(current.state.timing.reactionWindows[windowId].status).toBe('OPEN')
  })

  it('preserves an open window and every response through serialization', () => {
    const current = openTargetedReaction(battle())
    const restored = deserializeBattleSession(serializeBattleSession(current))
    expect(restored.state.timing).toEqual(current.state.timing)
    expect(getCurrentReactionWindow(restored)?.responses).toEqual(getCurrentReactionWindow(current)?.responses)
  })
})

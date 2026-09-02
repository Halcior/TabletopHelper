import { describe, expect, it } from 'vitest'
import { createBattleSession, dispatchBattleEvent } from '../battle/engine'
import {
  cancelReactionWindow,
  refineReactionHold,
  requestReactionHold,
} from './battleIntegration'
import type { StratagemDefinition, StratagemDefinitionsByPlayer } from './types'

const reaction: StratagemDefinition = {
  id: 'return-fire',
  kind: 'STRATAGEM',
  name: 'Return Fire',
  description: 'test',
  cpCost: 1,
  ownerScope: 'OPPONENT',
  phases: ['SHOOTING'],
  triggers: ['UNIT_SELECTED_AS_TARGET'],
  reaction: true,
  source: 'test',
}

function battle() {
  return dispatchBattleEvent(createBattleSession({
    gameId: 'hold-refinement',
    rulesetId: 'generic',
    guidanceLevel: 'guided',
    createdAt: '2026-09-02T11:45:00.000Z',
    players: [
      { id: 'p1', name: 'Alpha', startingCp: 3 },
      { id: 'p2', name: 'Bravo', startingCp: 3 },
    ],
  }), { type: 'PHASE_CHANGED', payload: { phase: 'SHOOTING' } })
}

const definitions: StratagemDefinitionsByPlayer = {
  p1: [],
  p2: [reaction],
}

describe('pause-first reaction HOLD', () => {
  it('opens a hard draft window immediately, then refines the same window id', () => {
    const held = requestReactionHold(battle(), 'p2', {
      trigger: 'CUSTOM_CONFIRMATION',
      context: { holdDraft: true, actingPlayerId: 'p1' },
      definitionsByPlayer: definitions,
      timestamp: '2026-09-02T11:45:01.000Z',
    })
    const windowId = held.state.timing.activeReactionWindowId
    expect(windowId).toBeTruthy()
    const draft = held.state.timing.reactionWindows[windowId ?? '']
    expect(draft).toMatchObject({
      trigger: 'CUSTOM_CONFIRMATION',
      status: 'OPEN',
      behavior: 'HARD',
      requestedByPlayerId: 'p2',
      context: { holdDraft: true },
    })
    expect(draft.responses.p2.status).toBe('PENDING')
    expect(draft.responses.p2.availableOptionIds).toEqual([])

    const refined = refineReactionHold(held, windowId ?? '', 'p2', {
      trigger: 'UNIT_SELECTED_AS_TARGET',
      context: {
        holdDraft: false,
        actingPlayerId: 'p1',
        targetPlayerId: 'p2',
        targetUnitId: 'target',
      },
      definitionsByPlayer: definitions,
      timestamp: '2026-09-02T11:45:02.000Z',
    })
    const window = refined.state.timing.reactionWindows[windowId ?? '']
    expect(refined.state.timing.activeReactionWindowId).toBe(windowId)
    expect(window.id).toBe(windowId)
    expect(window.openedAt).toBe(draft.openedAt)
    expect(window.trigger).toBe('UNIT_SELECTED_AS_TARGET')
    expect(window.context.holdDraft).toBe(false)
    expect(window.responses.p2.availableOptionIds).toEqual(['return-fire'])
    expect(refined.state.events.at(-1)?.type).toBe('REACTION_HOLD_REFINED')
  })

  it('lets the requester cancel a draft HOLD and records them as actor', () => {
    const held = requestReactionHold(battle(), 'p2', {
      trigger: 'CUSTOM_CONFIRMATION',
      context: { holdDraft: true },
      definitionsByPlayer: definitions,
    })
    const windowId = held.state.timing.activeReactionWindowId ?? ''
    const cancelled = cancelReactionWindow(held, windowId, '2026-09-02T11:45:03.000Z')
    expect(cancelled.state.timing.activeReactionWindowId).toBeNull()
    expect(cancelled.state.timing.reactionWindows[windowId].status).toBe('CANCELLED')
    expect(cancelled.state.events.at(-1)).toMatchObject({
      type: 'REACTION_WINDOW_CANCELLED',
      actorPlayerId: 'p2',
    })
  })

  it('rejects refinement by a different player', () => {
    const held = requestReactionHold(battle(), 'p2', {
      trigger: 'CUSTOM_CONFIRMATION',
      context: { holdDraft: true },
      definitionsByPlayer: definitions,
    })
    expect(() => refineReactionHold(held, held.state.timing.activeReactionWindowId ?? '', 'p1', {
      trigger: 'UNIT_SELECTED_AS_TARGET',
      definitionsByPlayer: definitions,
    })).toThrow(/Only the player who requested HOLD/i)
  })
})

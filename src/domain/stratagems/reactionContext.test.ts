import { describe, expect, it } from 'vitest'
import { getReactionContextRequirements, reactionContextIsComplete } from './reactionContext'
import type { StratagemDefinition, TimingRestriction } from './types'

function restriction(id: string): TimingRestriction {
  return { id, description: id, evaluate: () => true }
}

function definition(input: Partial<StratagemDefinition> & Pick<StratagemDefinition, 'id'>): StratagemDefinition {
  return {
    id: input.id,
    kind: 'STRATAGEM',
    name: input.id,
    description: 'test',
    ownerScope: 'OPPONENT',
    phases: ['SHOOTING'],
    triggers: ['UNIT_SELECTED_TO_SHOOT'],
    reaction: true,
    restrictions: [],
    usageLimits: [],
    source: 'test',
    cpCost: 1,
    ...input,
  }
}

describe('reaction context requirements', () => {
  it('asks only for structured fields required by matching reaction definitions', () => {
    const definitions = [
      definition({
        id: 'subject-and-target',
        restrictions: [
          restriction('40kdc-trigger-subject-enemy-unit'),
          restriction('40kdc-target-keywords'),
        ],
      }),
      definition({
        id: 'wrong-trigger',
        triggers: ['UNIT_SELECTED_AS_TARGET'],
        restrictions: [restriction('40kdc-trigger-move-type')],
      }),
      definition({
        id: 'not-a-reaction',
        reaction: false,
        restrictions: [restriction('40kdc-trigger-move-type')],
      }),
    ]

    expect(getReactionContextRequirements(definitions, 'SHOOTING', 'UNIT_SELECTED_TO_SHOOT')).toEqual({
      matchingDefinitionIds: ['subject-and-target'],
      requiresTriggerSubject: true,
      requiresMoveType: false,
      requiresTargetUnit: true,
    })
  })

  it('recognizes move-type guards and ignores definitions from another phase', () => {
    const definitions = [
      definition({
        id: 'move-reaction',
        phases: ['MOVEMENT'],
        triggers: ['UNIT_FINISHED_MOVE'],
        restrictions: [restriction('40kdc-trigger-move-type')],
      }),
      definition({
        id: 'wrong-phase',
        phases: ['FIGHT'],
        triggers: ['UNIT_FINISHED_MOVE'],
        restrictions: [restriction('40kdc-target-keywords')],
      }),
    ]

    const requirements = getReactionContextRequirements(definitions, 'MOVEMENT', 'UNIT_FINISHED_MOVE')
    expect(requirements.matchingDefinitionIds).toEqual(['move-reaction'])
    expect(requirements.requiresMoveType).toBe(true)
    expect(requirements.requiresTargetUnit).toBe(false)
  })

  it('does not consider a structured context complete until every required field is present', () => {
    const requirements = {
      matchingDefinitionIds: ['reaction'],
      requiresTriggerSubject: true,
      requiresMoveType: true,
      requiresTargetUnit: true,
    }
    expect(reactionContextIsComplete(requirements, {
      triggerSubjectPlayerId: 'p1',
      triggerSubjectUnitId: 'u1',
      moveType: 'advance',
      targetPlayerId: 'p2',
      targetUnitId: 'u2',
    })).toBe(false)
    expect(reactionContextIsComplete(requirements, {
      triggerSubjectPlayerId: 'p1',
      triggerSubjectUnitId: 'u1',
      moveType: 'advance',
      targetPlayerId: 'p2',
      targetUnitId: 'u2',
      targetKeywords: ['INFANTRY'],
    })).toBe(true)
  })
})

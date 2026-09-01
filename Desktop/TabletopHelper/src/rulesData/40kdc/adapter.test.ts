import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Army } from '../../domain/army/types'
import { getAvailableStratagems } from '../../domain/stratagems/timingEngine'
import { NewRecruitImporter } from '../../importers/newRecruit'
import { FortyKdcRulesDataProvider } from './adapter'
import { buildArmyStratagemDiagnostic } from './diagnostics'
import { create40kdcRulesDataProvider } from './index'
import type { FortyKdcSource } from './sourceTypes'

const source: FortyKdcSource = {
  factions: [
    { id: 'test-faction', name: 'Test Faction' },
    { id: 'other-faction', name: 'Other Faction' },
  ],
  detachments: [
    { id: 'first-host', name: 'First Host', factionId: 'test-faction', stratagemIds: ['advance', 'unknown'] },
    { id: 'second-host', name: 'Second Host', factionId: 'test-faction', stratagemIds: ['reaction', 'advance'] },
    { id: 'other-host', name: 'First Host', factionId: 'other-faction', stratagemIds: ['other'] },
  ],
  stratagems: [
    {
      id: 'advance',
      name: 'Planned Advance',
      detachmentId: 'first-host',
      cpCost: 2,
      phases: ['movement'],
      playerTurn: 'your-turn',
      timing: 'once-per-phase',
      abilityId: 'advance-ability',
    },
    {
      id: 'unknown',
      name: 'Unresolved Moment',
      detachmentId: 'first-host',
      cpCost: 3,
      phases: ['fight'],
      playerTurn: 'either',
      timing: 'once-per-battle',
      abilityId: 'unknown-ability',
    },
    {
      id: 'reaction',
      name: 'Return Fire',
      detachmentId: 'second-host',
      cpCost: 1,
      phases: ['shooting'],
      playerTurn: 'opponent-turn',
      timing: 'once-per-turn',
      targetRestrictions: { requiredKeywords: ['Infantry'] },
      abilityId: 'reaction-ability',
    },
    {
      id: 'other',
      name: 'Wrong Faction',
      detachmentId: 'other-host',
      cpCost: 1,
      phases: ['command'],
      playerTurn: 'your-turn',
      timing: 'unlimited',
      abilityId: null,
    },
  ],
  abilities: [
    { id: 'advance-ability', behavior: 'activated', triggers: [{ event: 'start-of-phase', hasStructuredGuard: false }] },
    { id: 'unknown-ability', behavior: 'activated', triggers: [] },
    { id: 'reaction-ability', behavior: 'reactive', triggers: [{ event: 'selected-to-shoot', hasStructuredGuard: false }] },
  ],
}

function army(faction = 'Test Faction', detachments = ['First Host']): Pick<Army, 'faction' | 'detachments'> {
  return {
    faction,
    detachments: detachments.map((name, index) => ({ id: `nr-${index}`, name })),
  }
}

const provider = new FortyKdcRulesDataProvider(source)

describe('40kdc adapter', () => {
  it('resolves factions by exact normalized name or id without substring guessing', () => {
    expect(provider.resolveArmyStratagems(army('test-faction')).faction).toEqual({
      id: 'test-faction',
      name: 'Test Faction',
    })
    expect(provider.resolveArmyStratagems(army('Test')).faction).toBeNull()
  })

  it('resolves selected detachments only inside the resolved faction', () => {
    const result = provider.resolveArmyStratagems(army('Test Faction', ['First Host', 'Missing Host']))
    expect(result.selectedDetachments).toEqual([{ id: 'first-host', name: 'First Host' }])
    expect(result.unresolvedDetachmentNames).toEqual(['Missing Host'])
    expect(result.definitions.map((definition) => definition.name)).not.toContain('Wrong Faction')
  })

  it('filters Stratagems to selected detachments and removes duplicate links', () => {
    const first = provider.resolveArmyStratagems(army('Test Faction', ['First Host']))
    expect(first.definitions.map((definition) => definition.name)).toEqual([
      'Planned Advance',
      'Unresolved Moment',
    ])

    const both = provider.resolveArmyStratagems(army('Test Faction', ['First Host', 'Second Host']))
    expect(both.definitions.filter((definition) => definition.name === 'Planned Advance')).toHaveLength(1)
    expect(both.definitions.map((definition) => definition.name)).toContain('Return Fire')
  })

  it('maps CP, phases, and usage limits into StratagemDefinition', () => {
    const definition = provider.resolveArmyStratagems(army()).definitions[0]
    expect(definition).toMatchObject({
      cpCost: 2,
      phases: ['MOVEMENT'],
      triggers: ['PHASE_START'],
      ownerScope: 'ACTIVE_PLAYER',
      usageLimits: ['ONCE_PER_PHASE'],
    })
  })

  it('lets the existing Timing Engine perform phase filtering', () => {
    const definition = provider.resolveArmyStratagems(army()).definitions[0]
    const gameState = {
      round: 1,
      activePlayerId: 'p1',
      phase: 'MOVEMENT' as const,
      players: { p1: { cp: 3 } },
    }
    expect(getAvailableStratagems({
      playerId: 'p1', gameState, trigger: 'PHASE_START', definitions: [definition],
    })).toHaveLength(1)
    expect(getAvailableStratagems({
      playerId: 'p1', gameState: { ...gameState, phase: 'SHOOTING' }, trigger: 'PHASE_START', definitions: [definition],
    })).toEqual([])
  })

  it('maps opponent-turn records as reactions and preserves target checks', () => {
    const result = provider.resolveArmyStratagems(army('Test Faction', ['Second Host']))
    const reaction = result.stratagems.find((item) => item.definition.name === 'Return Fire')
    expect(reaction).toMatchObject({
      classification: 'REACTION',
      manualConfirmationRequired: true,
      targetRestrictions: { requiredKeywords: ['Infantry'] },
      definition: {
        cpCost: 1,
        phases: ['SHOOTING'],
        triggers: ['UNIT_SELECTED_TO_SHOOT'],
        ownerScope: 'OPPONENT',
        reaction: true,
        usageLimits: ['ONCE_PER_TURN'],
      },
    })
    const restriction = reaction?.definition.restrictions?.[0]
    if (!restriction) throw new Error('expected target restriction')
    const base = {
      playerId: 'p2',
      gameState: { round: 1, activePlayerId: 'p1', phase: 'SHOOTING' as const, players: { p1: { cp: 1 }, p2: { cp: 1 } } },
      phase: 'SHOOTING' as const,
      trigger: 'UNIT_SELECTED_TO_SHOOT' as const,
    }
    expect(restriction.evaluate({ ...base, context: {} })).toMatchObject({ allowed: false })
    expect(restriction.evaluate({ ...base, context: { targetKeywords: ['INFANTRY'] } })).toMatchObject({ allowed: true })
  })

  it('uses CUSTOM_CONFIRMATION for missing timing instead of guessing', () => {
    const unresolved = provider.resolveArmyStratagems(army()).stratagems
      .find((item) => item.definition.name === 'Unresolved Moment')
    expect(unresolved).toMatchObject({
      classification: 'BOTH',
      fullyAutomatedTiming: false,
      manualConfirmationRequired: true,
      definition: {
        cpCost: 3,
        phases: ['FIGHT'],
        triggers: ['CUSTOM_CONFIRMATION'],
        reaction: true,
        usageLimits: ['ONCE_PER_BATTLE'],
      },
    })
  })
})

describe('40kdc diagnostic for the imported 1700 Custodes roster', () => {
  it('resolves both selected detachments and every available Stratagem metadata row', () => {
    const fixture = JSON.parse(fs.readFileSync(path.resolve('test-data/1700.json'), 'utf8')) as unknown
    const imported = NewRecruitImporter.import(fixture)
    const diagnostic = buildArmyStratagemDiagnostic(imported.army, create40kdcRulesDataProvider())

    expect(diagnostic.faction).toBe('Adeptus Custodes')
    expect(diagnostic.selectedDetachments).toEqual(['Might of the Moritoi', 'Shield Host'])
    expect(diagnostic.unresolvedDetachments).toEqual([])
    expect(diagnostic.stratagems).toHaveLength(9)
    expect(diagnostic.stratagems.every((row) => (
      row.name.length > 0
      && row.cp >= 0
      && row.detachment.length > 0
      && row.phases.length > 0
      && row.manualConfirmationRequired
      && !row.fullyAutomatedTiming
    ))).toBe(true)
  })
})

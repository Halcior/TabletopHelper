import {
  abilities,
  detachments,
  factions,
  stratagems,
  type Trigger,
} from '@alpaca-software/40kdc-data'
import type {
  FortyKdcSource,
  FortyKdcTargetRestrictions,
  FortyKdcTriggerRecord,
} from './sourceTypes'

function mapTrigger(trigger: Trigger): FortyKdcTriggerRecord {
  return {
    event: trigger.event,
    hasStructuredGuard: Boolean(
      trigger.condition
      || trigger.proximity
      || trigger.move_types?.length
      || trigger.window,
    ),
  }
}

function mapTargetRestrictions(
  restrictions: (typeof stratagems.all)[number]['target_restrictions'],
): FortyKdcTargetRestrictions | undefined {
  if (!restrictions) return undefined
  return {
    requiredKeywords: restrictions.required_keywords,
    requiredAnyKeywords: restrictions.required_keywords_any,
    excludedKeywords: restrictions.excluded_keywords,
    // Notes are intentionally not copied. Their presence only makes the
    // corresponding condition manual.
    hasUnstructuredNotes: Boolean(restrictions.notes?.trim()),
  }
}

/**
 * Converts the package's linked collections into the small, stable shape used
 * by the adapter. This is the only module that imports runtime 40kdc types.
 */
export function loadEmbedded40kdcSource(): FortyKdcSource {
  return {
    factions: factions.all.map((faction) => ({ id: faction.id, name: faction.name })),
    detachments: detachments.all.map((detachment) => ({
      id: detachment.id,
      name: detachment.name,
      factionId: detachment.faction_id,
      stratagemIds: detachment.stratagem_ids ?? [],
    })),
    stratagems: stratagems.all.map((stratagem) => ({
      id: stratagem.id,
      name: stratagem.name,
      detachmentId: stratagem.detachment_id ?? null,
      cpCost: stratagem.cp_cost,
      phases: stratagem.phases,
      playerTurn: stratagem.player_turn,
      timing: stratagem.timing,
      targetRestrictions: mapTargetRestrictions(stratagem.target_restrictions),
      abilityId: stratagem.ability_id ?? null,
    })),
    abilities: abilities.all.map((ability) => {
      const rawTriggers = ability.raw.trigger
        ? Array.isArray(ability.raw.trigger) ? ability.raw.trigger : [ability.raw.trigger]
        : []
      const description = ability.describe().trim()
      return {
        id: ability.id,
        behavior: ability.raw.behavior,
        triggers: rawTriggers.map(mapTrigger),
        description: description || undefined,
      }
    }),
  }
}

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { abilities, detachments, factions, stratagems } from '@alpaca-software/40kdc-data'

function mapTrigger(trigger) {
  return {
    event: trigger.event,
    subject: trigger.subject,
    moveTypes: trigger.move_types ?? [],
    hasCondition: Boolean(trigger.condition),
    hasProximity: Boolean(trigger.proximity),
    hasWindow: Boolean(trigger.window),
  }
}

function mapTargetRestrictions(restrictions) {
  if (!restrictions) return undefined
  return {
    requiredKeywords: restrictions.required_keywords,
    requiredAnyKeywords: restrictions.required_keywords_any,
    excludedKeywords: restrictions.excluded_keywords,
    hasUnstructuredNotes: Boolean(restrictions.notes?.trim()),
  }
}

const source = {
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

const target = new URL('../src/rulesData/40kdc/generated/', import.meta.url)
rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })

function writeChunks(name, records, size) {
  const chunks = []
  for (let index = 0; index < records.length; index += size) {
    const file = `${name}-${chunks.length}.json`
    writeFileSync(new URL(file, target), `${JSON.stringify(records.slice(index, index + size))}\n`)
    chunks.push(file)
  }
  return chunks
}

const files = {
  factions: writeChunks('factions', source.factions, 100),
  detachments: writeChunks('detachments', source.detachments, 250),
  stratagems: writeChunks('stratagems', source.stratagems, 250),
  abilities: writeChunks('abilities', source.abilities, 300),
}
const imports = []
const properties = []
for (const [name, chunks] of Object.entries(files)) {
  const variables = chunks.map((file, index) => {
    const variable = `${name}${index}`
    imports.push(`import ${variable} from './${file}'`)
    return variable
  })
  properties.push(`  ${name}: [${variables.map((variable) => `...${variable}`).join(', ')}],`)
}
writeFileSync(new URL('index.ts', target), `${imports.join('\n')}\n\nexport default {\n${properties.join('\n')}\n}\n`)
console.log(`Generated compact 40kdc snapshot (${JSON.stringify(source).length} bytes).`)

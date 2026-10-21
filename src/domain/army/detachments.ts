import factions from '../../rulesData/40kdc/generated/factions-0.json'
import detachmentsA from '../../rulesData/40kdc/generated/detachments-0.json'
import detachmentsB from '../../rulesData/40kdc/generated/detachments-1.json'
import type { Detachment } from './types'
const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
/** Names from the existing community dataset, not a roster legality checker. */
export function availableDetachments(name: string): Detachment[] {
  const faction = factions.find(
    (f) => key(f.name) === key(name) || key(f.id) === key(name),
  )
  return faction
    ? [...detachmentsA, ...detachmentsB]
        .filter((d) => d.factionId === faction.id)
        .map((d) => ({ id: d.id, name: d.name }))
    : []
}

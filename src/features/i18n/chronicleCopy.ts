import type { ChronicleEntry } from '../../domain/battle/chronicle'
import { t, useLocale } from './locale'

/** Localized view over recorded facts. No translated strings enter event history. */
export function chronicleCopy(entry: ChronicleEntry, players?: Record<string, { name: string }>): string {
  if (useLocale.getState().locale === 'en') return entry.description
  const change = entry.unitChange
  if (change && entry.event.type !== 'STATE_CORRECTED') {
    const identity = (name: string, id: string) => players?.[id]?.name ? `${name} (${players[id].name})` : name
    const owner = identity(change.target.name, change.target.playerId)
    const source = change.attacker ? identity(change.attacker.name, change.attacker.playerId) : change.attackerPlayerId ? players?.[change.attackerPlayerId]?.name ?? change.attackerPlayerId : t('Unknown / environment')
    const parts: string[] = []
    const lost = Math.max(0, change.modelsBefore - change.modelsAfter)
    const restored = Math.max(0, change.modelsAfter - change.modelsBefore)
    if (!change.destroyedBefore && change.destroyedAfter) parts.push(t('Unit destroyed'))
    else if (lost) parts.push(t(`Models lost: ${lost}`, 'Models lost: {0}'))
    if (restored) parts.push(t(`Models restored: ${restored}`, 'Models restored: {0}'))
    if (change.effectiveWoundsLost) parts.push(t(`Wounds lost: ${change.effectiveWoundsLost}`, 'Wounds lost: {0}'))
    if (change.woundsHealed) parts.push(t(`Wounds healed: ${change.woundsHealed}`, 'Wounds healed: {0}'))
    if (parts.length) return `${source} → ${owner}: ${parts.join(' · ')}`
  }
  const templates: Record<string, string> = {
    TURN_STARTED: '{0} turn started', TURN_ENDED: '{0} turn ended', ROUND_STARTED: 'Round {0} started', ROUND_ENDED: 'Round {0} ended',
    CP_GAINED: '{0} gained {1} CP', CP_SPENT: '{0} spent {1} CP',
  }
  const template = templates[entry.event.type]
  if (template) return t(entry.description, template)
  return t(entry.description)
}

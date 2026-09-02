import type { BattleEvent, BattleSession } from './types'

export type RecentUnitReference = {
  playerId: string
  unitId: string
}

function unitReference(event: BattleEvent): RecentUnitReference | null {
  switch (event.type) {
    case 'UNIT_MODEL_DESTROYED':
    case 'UNIT_MODEL_RESTORED':
    case 'UNIT_WOUNDS_CHANGED':
    case 'UNIT_DESTROYED':
    case 'UNIT_BATTLESHOCK_CHANGED':
    case 'BATTLESHOCK_TEST_RESOLVED':
    case 'ABILITY_USED':
      return { playerId: event.payload.playerId, unitId: event.payload.unitId }
    default:
      return null
  }
}

export function selectRecentUnits(
  session: BattleSession,
  playerId?: string,
  limit = 3,
): RecentUnitReference[] {
  const selected: RecentUnitReference[] = []
  const seen = new Set<string>()

  for (let index = session.state.events.length - 1; index >= 0; index -= 1) {
    const reference = unitReference(session.state.events[index])
    if (!reference || (playerId && reference.playerId !== playerId)) continue
    const key = `${reference.playerId}:${reference.unitId}`
    if (seen.has(key)) continue
    seen.add(key)
    selected.push(reference)
    if (selected.length >= limit) break
  }

  return selected
}


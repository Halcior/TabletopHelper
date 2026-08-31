import type { BattleEvent, BattleEventInput, BattleSession } from '../../domain/battle/types'
import { CAULDRON_RULESET_ID } from './constants'

export function cauldronEvent(action: string, data: unknown): BattleEventInput {
  return { type: 'RULESET_EVENT', payload: { rulesetId: CAULDRON_RULESET_ID, action, data } }
}

export function getCauldronEventData<T>(session: BattleSession, action: string): T[] {
  return session.state.events.flatMap((event: BattleEvent) => {
    if (
      event.type !== 'RULESET_EVENT'
      || event.payload.rulesetId !== CAULDRON_RULESET_ID
      || event.payload.action !== action
    ) return []
    return [event.payload.data as T]
  })
}

import type { BattleSetup } from '../domain/battle/types'
import current from './officialRuleSources.json'

export const OFFICIAL_RULES = current
const EVENT_COMPANION_1_3_MISSION_FAQ = 'gw-11th-2026-11-20'

// The absence of a pin denotes the original rules for existing games. Keep
// release IDs explicit when adding a new implementation.
export function usesOfficialMissionFaq(setup: BattleSetup): boolean {
  return setup.officialRulesVersion === EVENT_COMPANION_1_3_MISSION_FAQ
}

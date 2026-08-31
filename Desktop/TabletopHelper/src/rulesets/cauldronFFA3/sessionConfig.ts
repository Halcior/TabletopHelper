import type { BattleSession, BattleSetup } from '../../domain/battle/types'
import { CAULDRON_RULESET_ID } from './constants'
import type { CauldronConfig } from './types'

export function getCauldronConfig(source: BattleSession | BattleSetup): CauldronConfig {
  const setup = 'setup' in source ? source.setup : source
  if (setup.rulesetId !== CAULDRON_RULESET_ID) throw new Error('Battle is not using the Cauldron FFA 3 ruleset.')
  const config = setup.rulesetConfig
  if (!config || typeof config !== 'object' || !('playerConfigs' in config)) {
    throw new Error('Cauldron configuration is missing or invalid.')
  }
  return config as CauldronConfig
}

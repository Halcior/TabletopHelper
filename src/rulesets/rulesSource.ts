import type { BattleSession } from '../domain/battle/types'
import { CAULDRON_RULESET_ID, CAULDRON_RULESET_VERSION } from './cauldronFFA3/constants'
import { getCauldronConfig } from './cauldronFFA3/sessionConfig'
import type { CauldronMode, PrimaryDeck, SecondaryDeck } from './cauldronFFA3/types'

type RulesSelection = { mode: CauldronMode; primaryDeck?: PrimaryDeck; secondaryDeck?: SecondaryDeck }

export type RulesPresentation = {
  source: 'official' | 'community'
  title: string
  description: string
  primary: string
  secondary: string
}

// Setup-only defaults. Engine defaults and persisted configurations stay untouched.
export function recommendedRules(mode: CauldronMode): { primaryDeck: PrimaryDeck; secondaryDeck: SecondaryDeck } {
  return { primaryDeck: mode === 'ffa3' ? 'chapter-approved-ffa' : 'chapter-approved-duel', secondaryDeck: 'chapter-approved' }
}

export function describeRules({ mode, primaryDeck = 'cauldron', secondaryDeck = 'cauldron' }: RulesSelection): RulesPresentation {
  const official = mode !== 'ffa3' && primaryDeck === 'chapter-approved-duel' && secondaryDeck === 'chapter-approved'
  const primary = primaryDeck === 'chapter-approved-duel' ? 'Chapter Approved · Force Disposition matrix'
    : primaryDeck === 'chapter-approved-ffa' ? 'Balanced FFA v1 · house adaptation' : `Cauldron v${CAULDRON_RULESET_VERSION} · Operational Plans`
  const secondary = secondaryDeck === 'chapter-approved'
    ? mode === 'ffa3' ? 'Chapter Approved · FFA Rival adaptation' : 'Chapter Approved 2026–27'
    : `Cauldron v${CAULDRON_RULESET_VERSION} · 15 cards`
  return {
    source: official ? 'official' : 'community',
    title: official ? mode === 'doubles2v2' ? 'GW Doubles 2v2' : 'Chapter Approved Duel 1v1'
      : mode === 'ffa3' ? primaryDeck === 'chapter-approved-ffa' ? secondaryDeck === 'chapter-approved' ? 'Recommended House Format · FFA 3' : 'Custom FFA 3' : 'Cauldron FFA 3'
      : 'Cauldron Duel 1v1',
    description: official
      ? mode === 'doubles2v2' ? 'GW Doubles v1.0. Two shared forces, with one CP pool, VP score and Secondary deck per team.'
        : 'GW / Chapter Approved Duel. Choose Force Dispositions, then a matching battlefield layout.'
      : mode === 'ffa3' ? `Custom / Community. Three-player FFA uses house rules${secondaryDeck === 'chapter-approved' ? '; Chapter Approved cards are adapted with Rival targeting' : ' with the Cauldron Secondary deck'}. This is not an official GW format.`
        : 'Custom / Community. Cauldron scoring and any mixed mission decks use house rules.',
    primary,
    secondary,
  }
}

// Derive labels from existing saves; never migrate a save to the new setup defaults.
export function rulesForSession(session: BattleSession): RulesPresentation {
  if (session.setup.rulesetId !== CAULDRON_RULESET_ID) return {
    source: 'community', title: 'Custom battle', description: 'Custom ruleset.', primary: session.setup.rulesetId, secondary: 'Custom ruleset',
  }
  const config = getCauldronConfig(session)
  const presentation = describeRules({
    mode: session.setup.doubles ? 'doubles2v2' : config.mode ?? (session.setup.players.length === 2 ? 'duel' : 'ffa3'),
    primaryDeck: config.primaryDeck,
    secondaryDeck: config.secondaryDeck,
  })
  if (config.primaryDeck === 'chapter-approved-ffa' && config.officialPrimaryBalance !== 'balanced-v1') {
    return { ...presentation, title: 'Community FFA 3 · original profile', primary: '11th edition FFA · original house profile' }
  }
  return presentation
}

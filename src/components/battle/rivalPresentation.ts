import { t } from '../../features/i18n/locale'
import type { BattleSession } from '../../domain/battle/types'
import { OFFICIAL_SECONDARY_BY_ID } from '../../rulesets/cauldronFFA3/officialSecondaryDefinitions'
import { isOfficialFfa } from '../../rulesets/cauldronFFA3/officialSecondaryFFA'
import { getCurrentRivalPlayerId } from '../../rulesets/cauldronFFA3/rivalRotation'
import { getSecondaryState } from '../../rulesets/cauldronFFA3/secondary'
import type { OfficialSecondaryId, SecondaryId } from '../../rulesets/cauldronFFA3/secondaryTypes'

/** Session identity, shared by Primary, card targets and rotation feedback. */
export function rivalIdentity(session: BattleSession, playerId: string): string {
  const player = session.state.players[playerId]
  const setup = session.setup.players.find((entry) => entry.id === playerId)
  const faction = player?.faction || (setup?.armyId && session.setup.armies[setup.armyId]?.faction) || setup?.faction
  const name = player?.name || setup?.name || 'Unknown player'
  return faction ? `${faction} — ${name}` : name
}

/** Presentation only. Never reassign a missing saved target to the Current Rival. */
export function secondaryScope(session: BattleSession, playerId: string, cardId: SecondaryId) {
  if (!isOfficialFfa(session) || !cardId.startsWith('OFFICIAL_')) return undefined
  const definition = OFFICIAL_SECONDARY_BY_ID[cardId as OfficialSecondaryId]
  const card = getSecondaryState(session)[playerId]?.active.find((entry) => entry.cardId === cardId)
  if (!card) return undefined
  const rivalId = card.secondaryRivalPlayerId
  const rival = rivalId ? rivalIdentity(session, rivalId) : 'Unrecorded rival (check at the table)'
  const rivalTurn = t(`${rival}’s turn`, '{0}’s turn')
  const timing = definition.scoreAt === 'own' ? t('End of your turn')
    : definition.scoreAt === 'either' ? t(`End of your turn or ${rivalTurn}`, 'End of your turn or {0}')
      : t(`End of ${rivalTurn}, or end of Round ${session.state.maxRounds}`, 'End of {0}, or end of Round {1}')
  return {
    label: definition.enemyScope === 'rival' ? t(`Target Rival: ${rival}`, 'Target Rival: {0}')
      : definition.enemyScope === 'all-enemies' ? t('ALL ENEMIES') : t('BATTLEFIELD OBJECTIVE'),
    conditionScope: definition.enemyScope === 'all-enemies' ? t('Condition checks both enemy armies.') : undefined,
    timing: `${cardId === 'OFFICIAL_DEFEND_STRONGHOLD' ? t('From Round 2 · ') : ''}${timing}`,
    assignment: definition.usesSecondaryRival
      ? t(`${definition.enemyScope === 'rival' ? t('Assigned') : t('Timing assigned')} ${card.drawnRound ? t(`in Round ${card.drawnRound}`, 'in Round {0}') : t('when drawn')} · Locked until this card is resolved.`, '{0} {1} · Locked until this card is resolved.')
      : undefined,
    difference: definition.usesSecondaryRival && rivalId && rivalId !== getCurrentRivalPlayerId(session, playerId)
      ? definition.enemyScope === 'rival'
        ? 'Different from Current Rival. This card keeps its original target.'
        : 'Scoring timing differs from Current Rival. This card keeps its original timing rival.'
      : undefined,
  }
}

/** Short scoring conditions; choice/replacement instructions stay in Full rules. */
export const FFA_SCORING_BRIEF: Record<OfficialSecondaryId, string> = {
  OFFICIAL_A_GRIEVOUS_BLOW: 'Your army destroys target units with Starting Strength 13+: Tactical 5 VP; Fixed 4 VP per unit.',
  OFFICIAL_A_TEMPTING_TARGET: 'Control the objective selected by this card’s Target Rival: 5 VP.',
  OFFICIAL_ASSASSINATION: 'Your army destroys a target CHARACTER this turn (or has destroyed all target CHARACTERs): Tactical 5 VP. Fixed: 3 VP per CHARACTER, +1 if Wounds 4+.',
  OFFICIAL_BEACON: 'The locked own unit is on the battlefield outside your deployment: 3 VP; wholly outside your Territory: 5 VP.',
  OFFICIAL_BEHIND_ENEMY_LINES: 'Qualifying units wholly in the Target Rival’s deployment: 3 VP per unit, up to 5 VP.',
  OFFICIAL_BRING_IT_DOWN: 'Your army destroys target models with Wounds 10+: Tactical 5 VP; Fixed 4 VP per model.',
  OFFICIAL_BURDEN_OF_TRUST: 'Still control objectives with their saved guarding units in range: 2 VP each, up to 5 VP. Either enemy can take control away.',
  OFFICIAL_CENTRE_GROUND: 'Qualifying own unit within 3″ of CENTER, neither enemy within 3″: 3 VP; neither enemy within 6″: 5 VP.',
  OFFICIAL_CLEANSE: 'Complete Cleanse with the acting unit controlling its selected non-HOME objective: 2 VP for one, 5 VP for two or more.',
  OFFICIAL_DEFEND_STRONGHOLD: 'Control your HOME: 3 VP; neither enemy has a unit in your deployment: +2 VP.',
  OFFICIAL_DISPLAY_OF_MIGHT: 'Your qualifying NML unit count exceeds each enemy army separately: 2 VP at your turn end, 5 VP at the assigned timing rival’s turn end.',
  OFFICIAL_ENGAGE_ON_ALL_FRONTS: 'Qualifying units wholly in 3/4 quarters, more than 6″ from centre: Tactical 3/5 VP; Fixed 2/4 VP.',
  OFFICIAL_FORWARD_POSITION: 'Control the Target Rival’s HOME, or both CENTER and the neutral objective between your deployment zones: 5 VP.',
  OFFICIAL_NO_PRISONERS: 'Your army destroys target units this turn: 2 VP each, up to 5 VP.',
  OFFICIAL_OUTFLANK: 'Qualifying unit within 6″ of an edge and wholly outside own Territory: 3 VP; two near opposite parallel edges, at least one wholly outside: 5 VP.',
  OFFICIAL_OVERWHELMING_FORCE: 'Your army destroys target units that began this turn in range of an objective: 3 VP each, up to 5 VP.',
  OFFICIAL_PLUNDER: 'Complete Plunder in a terrain footprint wholly outside your Territory: 5 VP.',
  OFFICIAL_SECURE_NO_MANS_LAND: 'Control at least two non-HOME objectives in No Man’s Land: 5 VP.',
}

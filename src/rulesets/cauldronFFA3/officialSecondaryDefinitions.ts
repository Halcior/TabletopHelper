import type { OfficialSecondaryId, SecondaryDefinition } from './secondaryTypes'

export type OfficialTiming = 'own' | 'opponent' | 'either'
export type OfficialSecondaryDefinition = SecondaryDefinition & {
  id: OfficialSecondaryId
  scoreAt: OfficialTiming
  fixed?: boolean
  /** Tactical-only replacement. Defend Stronghold must be replaced in round one. */
  redraw?: 'optional' | 'round-one-optional' | 'round-one-required' | 'no-target' | 'cleanse-conflict' | 'plunder-conflict'
  /** A card with a variable award offers these values when the condition is met. */
  awards: readonly number[]
  usesSecondaryRival: boolean
  enemyScope: 'rival' | 'all-enemies' | 'none'
}

const definitions: Omit<OfficialSecondaryDefinition, 'usesSecondaryRival' | 'enemyScope'>[] = [
  { id: 'OFFICIAL_A_GRIEVOUS_BLOW', name: 'A Grievous Blow', vp: 5, category: 'ELIMINATION', description: 'Tactical: 5 VP if one or more enemy units with Starting Strength 13+ were destroyed this turn. Fixed: 4 VP for each such unit destroyed this turn. If no eligible target exists when drawn, you may replace this card.', timing: ['END_TURN', 'ON_DRAW'], evaluationMode: 'REQUIRES_CONFIRMATION', scoreAt: 'either', fixed: true, redraw: 'no-target', awards: [5] },
  { id: 'OFFICIAL_A_TEMPTING_TARGET', name: 'A Tempting Target', vp: 5, category: 'OBJECTIVE', description: 'When drawn, your opponent selects an objective in No Man’s Land that is not their home objective. Score 5 VP if you control the selected objective at the end of your turn.', timing: ['ON_DRAW', 'END_TURN'], evaluationMode: 'TARGET_SELECTION', scoreAt: 'own', awards: [5] },
  { id: 'OFFICIAL_ASSASSINATION', name: 'Assassination', vp: 5, category: 'ELIMINATION', description: 'Tactical: 5 VP if an enemy CHARACTER model was destroyed this turn, or if all enemy CHARACTER models in the battle have been destroyed. Fixed: 3 VP per enemy CHARACTER model destroyed this turn, plus 1 VP for each of those models with Wounds 4+.', timing: ['END_TURN'], evaluationMode: 'REQUIRES_CONFIRMATION', scoreAt: 'either', fixed: true, awards: [5] },
  { id: 'OFFICIAL_BEACON', name: 'Beacon', vp: 5, category: 'POSITION', description: 'When drawn, choose one of your units on the battlefield or embarked within a TRANSPORT there. At the end of an opponent’s turn (or the end of round 5), score 3 VP if that unit is on the battlefield outside your deployment zone, or 5 VP if outside your territory.', timing: ['ON_DRAW', 'END_TURN'], evaluationMode: 'REQUIRES_CONFIRMATION', scoreAt: 'opponent', awards: [3, 5] },
  { id: 'OFFICIAL_BEHIND_ENEMY_LINES', name: 'Behind Enemy Lines', vp: 5, category: 'POSITION', description: 'At the end of your turn score 3 VP per unit wholly within your opponent’s deployment zone, up to 5 VP. AIRCRAFT and Battle-shocked units do not count. In round 1 you may replace this card when drawn.', timing: ['ON_DRAW', 'END_TURN'], evaluationMode: 'REQUIRES_CONFIRMATION', scoreAt: 'own', redraw: 'round-one-optional', awards: [3, 5] },
  { id: 'OFFICIAL_BRING_IT_DOWN', name: 'Bring It Down', vp: 5, category: 'ELIMINATION', description: 'Tactical: 5 VP if an enemy model with Wounds 10+ was destroyed this turn. Fixed: 4 VP per such model destroyed this turn. If there is no eligible target when drawn, you may replace this card.', timing: ['END_TURN', 'ON_DRAW'], evaluationMode: 'REQUIRES_CONFIRMATION', scoreAt: 'either', fixed: true, redraw: 'no-target', awards: [5] },
  { id: 'OFFICIAL_BURDEN_OF_TRUST', name: 'Burden of Trust', vp: 5, category: 'OBJECTIVE', description: 'When drawn or at the start of your turn, assign one of your units to guard each objective you control. At the end of an opponent’s turn (or round 5), score 2 VP per objective you still control with its assigned unit in range, up to 5 VP.', timing: ['ON_DRAW', 'END_TURN'], evaluationMode: 'REQUIRES_CONFIRMATION', scoreAt: 'opponent', awards: [2, 4, 5] },
  { id: 'OFFICIAL_CENTRE_GROUND', name: 'Centre Ground', vp: 5, category: 'POSITION', description: 'At the end of your turn, have a unit within 3″ of the battlefield centre (excluding AIRCRAFT and Battle-shocked units) and no enemy unit within 3″: 3 VP. Score 5 VP if no enemy is within 6″.', timing: ['END_TURN'], evaluationMode: 'REQUIRES_CONFIRMATION', scoreAt: 'own', awards: [3, 5] },
  { id: 'OFFICIAL_CLEANSE', name: 'Cleanse', vp: 5, category: 'MISSION_ACTION', description: 'In your Shooting phase, start Cleanse with one unit in range of a non-home objective; each unit must choose a different objective. The action completes at the end of your turn if that unit controls its objective. Score 2 VP for one completed Cleanse or 5 VP for two or more. If Plunder is active when drawn, you may replace this card.', timing: ['MISSION_ACTION', 'END_TURN', 'ON_DRAW'], evaluationMode: 'REQUIRES_CONFIRMATION', scoreAt: 'own', redraw: 'plunder-conflict', awards: [2, 5] },
  { id: 'OFFICIAL_DEFEND_STRONGHOLD', name: 'Defend Stronghold', vp: 5, category: 'OBJECTIVE', description: 'From round 2, at the end of an opponent’s turn (or the end of round 5), score 3 VP if you control your home objective, plus 2 VP if no enemy unit is in your deployment zone. Replace this card when drawn in round 1.', timing: ['ON_DRAW', 'END_TURN'], evaluationMode: 'REQUIRES_CONFIRMATION', scoreAt: 'opponent', redraw: 'round-one-required', awards: [3, 5] },
  { id: 'OFFICIAL_DISPLAY_OF_MIGHT', name: 'Display of Might', vp: 5, category: 'POSITION', description: 'Have more of your units than enemy units wholly within No Man’s Land, excluding AIRCRAFT and Battle-shocked units. At the end of your turn score 2 VP; at the end of an opponent’s turn score 5 VP.', timing: ['END_TURN'], evaluationMode: 'REQUIRES_CONFIRMATION', scoreAt: 'either', awards: [2, 5] },
  { id: 'OFFICIAL_ENGAGE_ON_ALL_FRONTS', name: 'Engage on All Fronts', vp: 5, category: 'POSITION', description: 'At the end of your turn have qualifying units wholly in three or four battlefield quarters, more than 6″ from the centre. AIRCRAFT and Battle-shocked units do not count. Tactical: 3/5 VP for three/four quarters. Fixed: 2/4 VP.', timing: ['END_TURN'], evaluationMode: 'REQUIRES_CONFIRMATION', scoreAt: 'own', fixed: true, awards: [3, 5] },
  { id: 'OFFICIAL_FORWARD_POSITION', name: 'Forward Position', vp: 5, category: 'OBJECTIVE', description: 'At the end of your turn score 5 VP if you control the opponent’s home objective and/or every expansion objective. In round 1 you may replace this card when drawn.', timing: ['ON_DRAW', 'END_TURN'], evaluationMode: 'REQUIRES_CONFIRMATION', scoreAt: 'own', redraw: 'round-one-optional', awards: [5] },
  { id: 'OFFICIAL_NO_PRISONERS', name: 'No Prisoners', vp: 5, category: 'ELIMINATION', description: 'At the end of either player’s turn, score 2 VP for each enemy unit destroyed during that turn, up to 5 VP.', timing: ['END_TURN'], evaluationMode: 'REQUIRES_CONFIRMATION', scoreAt: 'either', awards: [2, 4, 5] },
  { id: 'OFFICIAL_OUTFLANK', name: 'Outflank', vp: 5, category: 'POSITION', description: 'At the end of your turn, score 3 VP if one of your units is within 6″ of a battlefield edge outside your territory. Score 5 VP if two units are near opposite parallel edges and at least one is outside your territory. AIRCRAFT and Battle-shocked units do not count.', timing: ['END_TURN'], evaluationMode: 'REQUIRES_CONFIRMATION', scoreAt: 'own', awards: [3, 5] },
  { id: 'OFFICIAL_OVERWHELMING_FORCE', name: 'Overwhelming Force', vp: 5, category: 'ELIMINATION', description: 'At the end of either player’s turn, score 3 VP for each enemy unit destroyed this turn that began the turn in range of an objective, up to 5 VP.', timing: ['END_TURN'], evaluationMode: 'REQUIRES_CONFIRMATION', scoreAt: 'either', awards: [3, 5] },
  { id: 'OFFICIAL_PLUNDER', name: 'Plunder', vp: 5, category: 'MISSION_ACTION', description: 'In your Shooting phase, start Plunder with one unit within a terrain area outside your territory (one unit per turn). The action completes immediately; score 5 VP at the end of your turn. If Cleanse is active when drawn, you may replace this card.', timing: ['MISSION_ACTION', 'END_TURN', 'ON_DRAW'], evaluationMode: 'REQUIRES_CONFIRMATION', scoreAt: 'own', redraw: 'cleanse-conflict', awards: [5] },
  { id: 'OFFICIAL_SECURE_NO_MANS_LAND', name: 'Secure No Man’s Land', vp: 5, category: 'OBJECTIVE', description: 'At the end of your turn, score 5 VP if you control at least two objectives in No Man’s Land that are not home objectives.', timing: ['END_TURN'], evaluationMode: 'REQUIRES_CONFIRMATION', scoreAt: 'own', awards: [5] },
]

const rivalTargets: readonly OfficialSecondaryId[] = [
  'OFFICIAL_A_GRIEVOUS_BLOW', 'OFFICIAL_A_TEMPTING_TARGET', 'OFFICIAL_ASSASSINATION',
  'OFFICIAL_BEHIND_ENEMY_LINES', 'OFFICIAL_BRING_IT_DOWN', 'OFFICIAL_FORWARD_POSITION',
  'OFFICIAL_NO_PRISONERS', 'OFFICIAL_OVERWHELMING_FORCE',
]
const allEnemies: readonly OfficialSecondaryId[] = [
  'OFFICIAL_BURDEN_OF_TRUST', 'OFFICIAL_CENTRE_GROUND', 'OFFICIAL_DEFEND_STRONGHOLD', 'OFFICIAL_DISPLAY_OF_MIGHT',
]
export const OFFICIAL_SECONDARY_DEFINITIONS = Object.freeze(definitions.map((definition): OfficialSecondaryDefinition => Object.freeze({
  ...definition,
  usesSecondaryRival: rivalTargets.includes(definition.id) || definition.scoreAt !== 'own',
  enemyScope: allEnemies.includes(definition.id) ? 'all-enemies' : rivalTargets.includes(definition.id) ? 'rival' : 'none',
})))
export const OFFICIAL_SECONDARY_IDS = Object.freeze(OFFICIAL_SECONDARY_DEFINITIONS.map((definition) => definition.id))
export const OFFICIAL_FIXED_IDS = Object.freeze(OFFICIAL_SECONDARY_DEFINITIONS.filter((definition) => definition.fixed).map((definition) => definition.id))
export const OFFICIAL_SECONDARY_BY_ID = Object.freeze(Object.fromEntries(OFFICIAL_SECONDARY_DEFINITIONS.map((definition) => [definition.id, definition])) as Record<OfficialSecondaryId, OfficialSecondaryDefinition>)

const FFA_DESCRIPTIONS: Record<OfficialSecondaryId, string> = {
  OFFICIAL_A_GRIEVOUS_BLOW: 'Tactical: 5 VP if your army destroyed a Secondary Rival unit with Starting Strength 13+ this turn. Fixed: 4 VP per qualifying unit. A no-target replacement checks only the assigned Rival.',
  OFFICIAL_A_TEMPTING_TARGET: 'When drawn, the assigned Secondary Rival chooses CENTER or the neutral objective between your two deployment zones. Keep that choice; score 5 VP if you control it at your turn end.',
  OFFICIAL_ASSASSINATION: 'Only CHARACTER models of this card’s Secondary Rival count, and your army must destroy them. Tactical: 5 VP for a kill this turn, or if your army has destroyed all of that Rival’s CHARACTER models. Fixed: 3 VP per CHARACTER killed this turn, +1 each with Wounds 4+.',
  OFFICIAL_BEACON: 'When drawn, choose one own unit on the battlefield or embarked in a TRANSPORT there; the choice is locked. At the assigned Rival’s turn end (or the end of round 5): 3 VP outside your deployment zone, or 5 VP wholly outside your own Territory. Territory boundaries count as inside.',
  OFFICIAL_BEHIND_ENEMY_LINES: 'At your turn end, score 3 VP per qualifying unit wholly within the assigned Secondary Rival’s deployment zone, up to 5 VP. AIRCRAFT and Battle-shocked units do not count. Optional round-1 replacement.',
  OFFICIAL_BRING_IT_DOWN: 'Tactical: 5 VP if your army destroyed a Secondary Rival model with Wounds 10+ this turn. Fixed: 4 VP per such model. A no-target replacement checks only the assigned Rival.',
  OFFICIAL_BURDEN_OF_TRUST: 'When drawn or at the start of your turn, save one own guarding unit per controlled objective. At the assigned Rival’s turn end (or the end of round 5), score 2 VP per objective still controlled with its assigned unit in range, up to 5 VP. Either enemy can take control away.',
  OFFICIAL_CENTRE_GROUND: 'At your turn end, have a qualifying unit within 3″ of CENTER and no unit of either enemy within 3″: 3 VP. Score 5 VP if both enemy armies have no unit within 6″. AIRCRAFT and Battle-shocked own units do not qualify.',
  OFFICIAL_CLEANSE: 'In your Shooting phase, assign a qualifying unit in range to each chosen non-HOME objective; different units choose different objectives. At your turn end, confirm that each acting unit controls its objective. One completion: 2 VP; two or more: 5 VP. All four neutral objectives are eligible. Optional replacement if Plunder is active.',
  OFFICIAL_DEFEND_STRONGHOLD: 'From round 2, at the assigned Rival’s turn end (or the end of round 5), score 3 VP if you control your HOME, +2 VP if neither enemy has a unit in your deployment zone. Must be replaced when drawn in round 1.',
  OFFICIAL_DISPLAY_OF_MIGHT: 'Count qualifying units wholly in NML for each army separately, excluding AIRCRAFT and Battle-shocked units. Your count must exceed each enemy’s count: YourCount > max(EnemyA, EnemyB). Score 2 VP at your turn end or 5 VP at the assigned Rival’s turn end.',
  OFFICIAL_ENGAGE_ON_ALL_FRONTS: 'Use the standard four battlefield quarters. At your turn end, have qualifying units wholly in three/four quarters and more than 6″ from the centre: Tactical 3/5 VP, Fixed 2/4 VP. Exclude AIRCRAFT and Battle-shocked units.',
  OFFICIAL_FORWARD_POSITION: 'At your turn end, score 5 VP if you control the assigned Secondary Rival’s HOME, or both CENTER and the neutral objective between your two deployment zones. Optional round-1 replacement.',
  OFFICIAL_NO_PRISONERS: 'At your or the assigned Secondary Rival’s turn end, score 2 VP per unit of that Rival destroyed by your army during that turn, up to 5 VP. Kills by the third player do not count.',
  OFFICIAL_OUTFLANK: 'At your turn end: 3 VP for a qualifying unit within 6″ of an edge and wholly outside your own Territory; 5 VP for two qualifying units near opposite parallel edges with at least one wholly outside. Territory boundaries count as inside. Exclude AIRCRAFT and Battle-shocked units.',
  OFFICIAL_OVERWHELMING_FORCE: 'At your or the assigned Rival’s turn end, score 3 VP per unit of that Rival destroyed by your army this turn which began the turn in range of an objective, up to 5 VP. Confirm the objective condition for each recorded kill.',
  OFFICIAL_PLUNDER: 'In your Shooting phase, one qualifying unit within a terrain area can start Plunder. The entire terrain footprint must be wholly outside your own Territory; touching/crossing its boundary is inside. The action completes immediately and scores 5 VP at your turn end. Optional replacement if Cleanse is active.',
  OFFICIAL_SECURE_NO_MANS_LAND: 'At your turn end, score 5 VP if you control at least two non-HOME objectives in NML. AB-NEUTRAL, AC-NEUTRAL, BC-NEUTRAL and CENTER all count. NML is the battlefield outside every deployment zone; Territory is a separate layer.',
}

export function officialFfaDescription(cardId: OfficialSecondaryId): string {
  return FFA_DESCRIPTIONS[cardId]
}

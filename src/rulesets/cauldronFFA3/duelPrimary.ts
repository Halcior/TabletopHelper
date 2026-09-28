import { dispatchBattleEvents } from '../../domain/battle/engine'
import type { BattleSession } from '../../domain/battle/types'
import { cauldronEvent, getCauldronEventData } from './events'
import { getCauldronConfig } from './sessionConfig'

export const DISPOSITIONS = ['take-and-hold', 'purge-the-foe', 'reconnaissance', 'priority-assets', 'disruption'] as const
export type ForceDisposition = typeof DISPOSITIONS[number]
export const DISPOSITION_NAMES: Record<ForceDisposition, string> = {
  'take-and-hold': 'Take and Hold', 'purge-the-foe': 'Purge the Foe',
  reconnaissance: 'Reconnaissance', 'priority-assets': 'Priority Assets', disruption: 'Disruption',
}

// Rows are your Force Disposition; columns are your opponent's. The two players
// independently read their own row, so an asymmetric pairing yields two cards.
export const DUEL_PRIMARY_MATRIX: Record<ForceDisposition, Record<ForceDisposition, string>> = {
  'take-and-hold': { 'take-and-hold': 'Battlefield Dominance', 'purge-the-foe': 'Immovable Object', disruption: 'Determined Acquisition', reconnaissance: 'Purge and Secure', 'priority-assets': 'Inescapable Dominion' },
  'purge-the-foe': { 'take-and-hold': 'Unstoppable Force', 'purge-the-foe': 'Meatgrinder', disruption: 'Punishment', reconnaissance: 'Consecrate', 'priority-assets': "Destroyer's Wrath" },
  reconnaissance: { 'take-and-hold': 'Reconnaissance Sweep', 'purge-the-foe': 'Triangulation', disruption: 'Surveil the Foe', reconnaissance: 'Gather Intel', 'priority-assets': 'Search and Scour' },
  'priority-assets': { 'take-and-hold': 'Secure Asset', 'purge-the-foe': 'Vital Link', disruption: 'Extract Relic', reconnaissance: 'Vanguard Operation', 'priority-assets': 'Sabotage' },
  disruption: { 'take-and-hold': 'Death Trap', 'purge-the-foe': 'Delaying Action', disruption: 'Outmanoeuvre', reconnaissance: 'Smoke and Mirrors', 'priority-assets': 'Locate and Deny' },
}

type Window = 'command' | 'turn' | 'either' | 'battle'
export type DuelCondition = {
  id: string
  label: string
  vp: number
  window: Window
  from?: number
  through?: number
  count?: boolean
  group?: string
  cumulativeWith?: string
}
export type DuelMission = { name: string; conditions: DuelCondition[]; rule?: string; action?: string; url: string }
const C = (id: string, label: string, vp: number, window: Window, options: Partial<DuelCondition> = {}): DuelCondition => ({ id, label, vp, window, ...options })
const T = 'turn' as const, P = 'command' as const, B = 'battle' as const, E = 'either' as const
const r2 = { from: 2 }, count = { count: true }, r2count = { from: 2, count: true }
const common4 = C('hold', 'Control at least one objective other than your HOME.', 4, P, r2)
const enemyHome = (vp: number) => C('enemy-home-battle', 'Control the opponent’s HOME objective.', vp, B)
const definitions: Record<string, { checks: DuelCondition[]; rule?: string; action?: string }> = {
  'Battlefield Dominance': { checks: [C('early-more', 'Control more objectives than your opponent.', 2, T, { through: 2 }), C('held', 'Each objective you control.', 3, P, r2count), C('outside-home', 'Each of those objectives other than your HOME, if you also control your HOME. Add to held objective points.', 2, P, { ...r2count, cumulativeWith: 'held' })] },
  'Determined Acquisition': { checks: [C('gained', 'Each newly controlled objective since the start of this turn, excluding your HOME.', 2, T, count), C('held', 'Each objective you control.', 3, P, r2count), C('enemy-territory', 'Each of those objectives in opponent territory. Add to held objective points.', 3, P, { ...r2count, cumulativeWith: 'held' })] },
  'Immovable Object': { checks: [C('central', 'Control at least one central objective.', 3, T), C('held', 'Each controlled objective other than your HOME.', 5, P, { ...r2count, through: 4 }), C('held-fifth', 'Each controlled objective other than your HOME.', 5, T, { ...count, from: 5 })] },
  'Inescapable Dominion': { checks: [C('three-turn', 'Control at least three objectives.', 4, T), C('two-command', 'Control at least two objectives.', 5, P, r2), C('more-command', 'Control more objectives than your opponent.', 4, P, r2), enemyHome(5)] },
  'Purge and Secure': { checks: [C('kill-near', 'Enemy unit destroyed by your unit within objective range.', 3, T, { group: 'kill' }), C('kill-start', 'Enemy unit that began this turn within objective range was destroyed.', 3, T, { group: 'kill' }), C('held', 'Each controlled objective other than your HOME.', 4, P, r2count), C('gained', 'Control an objective newly gained this turn other than your HOME.', 3, T, r2)] },
  Consecrate: { rule: 'A unit that destroys a unit becomes a consecration unit. At the end of your turn it may consecrate one objective in its range other than your HOME that is not already consecrated. Place an operation marker there; that unit stops being a consecration unit.', checks: [C('one-two', 'One or two objectives consecrated.', 3, T, { group: 'consecrated' }), C('three', 'At least three objectives consecrated.', 6, T, { group: 'consecrated' }), common4, C('more', 'Control more objectives than your opponent.', 4, P, r2), C('enemy-home', 'Opponent HOME objective is consecrated.', 5, B)] },
  "Destroyer's Wrath": { checks: [C('kill', 'At least one enemy unit destroyed this turn.', 3, T), common4, C('more', 'Control more objectives than your opponent.', 6, P, r2), C('trade', 'Enemy units destroyed this turn exceed friendly units destroyed in the previous turn.', 4, T, r2)] },
  Meatgrinder: { checks: [C('kill', 'At least one enemy unit destroyed this turn.', 3, T), common4, C('trade', 'Enemy units destroyed this turn exceed friendly units destroyed in the previous turn.', 5, T, r2), C('enemy-home', 'Control opponent HOME objective.', 5, T, r2)] },
  Punishment: { rule: 'At the start of your turn condemn 1–3 enemy units on the battlefield in objective range and/or units that destroyed your units last turn. If none qualify, condemn one enemy unit on the battlefield. The designation lasts until the start of your next turn.', checks: [C('condemned', 'At least one condemned unit left the battlefield this turn (own or opponent turn).', 5, E), common4, C('more', 'Control more objectives than your opponent.', 5, P, r2), enemyHome(8)] },
  'Unstoppable Force': { checks: [C('kill', 'At least one enemy unit destroyed this turn.', 3, T), C('held', 'Each controlled objective other than your HOME.', 4, P, r2count), C('gained', 'Control at least one newly gained objective other than your HOME.', 3, T, r2), C('central-battle', 'Control at least one central objective.', 5, B)] },
  'Gather Intel': { action: 'Extract Intelligence: from round 2, start in Shooting with a unit in range of a non-HOME objective without your marker. Unlimited units, each at a distinct objective. At turn end, if that unit controls the objective, place your marker.', checks: [C('central-first', 'Control at least one central objective.', 6, T, { through: 1 }), common4, C('extractions', 'Each unit that completed Extract Intelligence this turn.', 7, T, r2count), C('three-markers', 'At least three of your operation markers on the battlefield.', 5, B), C('home-marker', 'Your marker within range of opponent HOME.', 5, B)] },
  'Reconnaissance Sweep': { checks: [C('three-quarters', 'At least three friendly units, each wholly in a different table quarter and over 6″ from centre.', 3, T, { group: 'quarters' }), C('four-quarters', 'At least four such units in all four table quarters.', 6, T, { group: 'quarters' }), C('kills', 'Each enemy unit destroyed this turn.', 1, T, count), C('hold', 'Control at least one objective other than your HOME.', 3, P, r2)] },
  'Search and Scour': { checks: [C('central', 'Control at least one central objective.', 3, T), C('terrain-kill', 'Enemy unit that started this turn in a terrain area was destroyed.', 2, T), C('held', 'Each controlled objective other than your HOME.', 4, P, r2count), C('clear-territory', 'No enemy unit is wholly within your territory.', 5, B)] },
  'Surveil the Foe': { rule: 'When your unit ends a move in range of an objective with enemy operation markers, remove them.', action: 'Surveil the Foe: in Shooting, any friendly unit can immediately surveil a visible enemy within 18″ that was not surveilled this turn. Unlimited uses.', checks: [C('surveil', 'Surveil an enemy this turn; fails if every surveilled enemy is in range of an objective with any operation marker.', 4, T), common4, C('more', 'Control more objectives than your opponent.', 4, P, r2), C('no-markers', 'No opponent operation markers remain on the battlefield.', 5, T, r2)] },
  Triangulation: { action: 'Triangulate: from round 2, once per turn start in Shooting with a unit in range of a non-HOME objective. At turn end, if the unit controls it, place your operation marker.', checks: [common4, C('one', 'Exactly one objective triangulated.', 3, T, { ...r2, group: 'triangulation' }), C('two', 'Exactly two objectives triangulated.', 6, T, { ...r2, group: 'triangulation' }), C('three', 'At least three objectives triangulated.', 10, T, { ...r2, group: 'triangulation' }), C('four-held', 'Control at least four objectives.', 10, B)] },
  'Extract Relic': { action: 'Sensor Sweep: once per turn in Shooting with a unit in range of a central objective. It completes at turn end if that unit controls the objective; remove one operation marker. Cannot start if only one marker remains.', checks: [C('sweep', 'A friendly unit performed a sensor sweep this turn.', 4, T), C('kill', 'Enemy unit that began the turn in objective range was destroyed.', 3, T), C('last-marker', 'Exactly one opponent marker remains in a terrain area with your unit and no enemy units.', 4, T), common4, C('last-marker-battle', 'Exactly one opponent marker remains in a terrain area with your unit and no enemy units.', 5, B)] },
  Sabotage: { action: 'Sabotage: in Shooting, unlimited friendly units in range of distinct non-HOME objectives can start. Each completes at turn end if that unit controls its objective.', checks: [C('actions', 'Each friendly unit completing Sabotage this turn.', 3, T, count), C('enemy-territory', 'Each of those units in range of an objective in opponent territory; additive.', 2, T, { ...count, cumulativeWith: 'actions' }), common4] },
  'Secure Asset': { action: 'Secure Asset: once per turn in Shooting with a friendly unit in range of a non-HOME objective. It completes at turn end if the unit controls that objective.', checks: [C('action', 'A unit secured the asset this turn.', 4, T), C('kill', 'Enemy unit that started this turn in range of a central objective was destroyed.', 2, T), common4, C('three', 'Control at least three objectives.', 4, P, r2)] },
  'Vanguard Operation': { action: 'Vanguard Operation: once per turn in Shooting with a unit in a terrain area in opponent territory. Completes at turn end if no enemy unit is in that terrain area.', checks: [C('action', 'A unit performed a Vanguard Operation this turn.', 4, T), C('kill', 'At least one enemy unit destroyed this turn.', 2, T), common4, enemyHome(10)] },
  'Vital Link': { action: 'Maintain Control: once per turn in Shooting with a friendly unit in range of a central objective. At turn end, if that unit controls it, place your operation marker.', checks: [C('central', 'Control at least one central objective.', 2, T), C('markers', 'Each of your markers in range of one of those controlled central objectives; additive.', 1, T, { ...count, cumulativeWith: 'central' }), common4, C('central-command', 'One of those controlled non-HOME objectives is central; additive.', 4, P, { ...r2, cumulativeWith: 'hold' }), enemyHome(10)] },
  'Death Trap': { action: 'Booby Trap: in Shooting, unlimited units in distinct untrapped terrain areas outside your deployment zone may immediately trap them. A unit can start in range of a non-HOME objective or inside that terrain area. Place an operation marker.', checks: [C('traps', 'Each terrain area trapped this turn.', 2, T, count), C('objective-traps', 'Each of those terrain areas that is an objective; additive.', 3, T, { ...count, cumulativeWith: 'traps' }), C('kill', 'Enemy unit that began this turn in a trapped terrain area was destroyed. Trap need not still be active at death.', 3, T), common4] },
  'Delaying Action': { checks: [C('kills', 'Each enemy unit destroyed this turn.', 2, T, count), C('hold', 'Control at least one objective other than HOME objectives.', 4, P, r2), C('central-expansion', 'Control a central objective and an expansion objective.', 3, T, r2)] },
  'Locate and Deny': { rule: 'At battle start place five operation markers in terrain areas outside your deployment zone; if fewer exist, place one in each available area.', action: 'Sensor Sweep: once per turn in Shooting with a unit in range of a central objective. It completes at turn end if the unit controls it; remove one operation marker. Cannot start when only one remains.', checks: [C('kill', 'Enemy unit that began the turn in objective range was destroyed.', 4, T), C('last-marker', 'Exactly one of your markers remains in a terrain area with your unit and no enemy units.', 4, T), common4, C('last-marker-battle', 'Exactly one of your markers remains in a terrain area with your unit and no enemy units.', 5, B)] },
  Outmanoeuvre: { checks: [C('enemy-home', 'Control opponent HOME objective.', 10, T), C('held-first', 'Each controlled objective other than your HOME.', 4, T, { ...count, through: 1 }), C('held-middle', 'Each controlled objective other than your HOME.', 5, P, { ...count, from: 2, through: 3 }), C('held-late', 'Each controlled objective other than your HOME.', 6, T, { ...count, from: 4 })] },
  'Smoke and Mirrors': { action: 'Decoy: in Shooting, unlimited units in range of distinct non-HOME objectives that are not decoyed can start. At turn end, if each unit controls its objective, place your operation marker.', checks: [C('decoyed', 'Each decoyed objective.', 2, T, count), C('enemy-territory', 'Each of those decoyed objectives in opponent territory; additive.', 2, T, { ...count, cumulativeWith: 'decoyed' }), common4, C('four-decoyed', 'At least four objectives decoyed.', 10, B)] },
}

const slug = (name: string) => name.toLowerCase().replaceAll("'", '').replaceAll(' ', '-')
export const DUEL_MISSIONS: Record<string, DuelMission> = Object.fromEntries(Object.entries(definitions).map(([name, value]) => [name, {
  name, conditions: value.checks, rule: value.rule, action: value.action,
  url: `https://gdmissions.app/11th/primary-missions/${DISPOSITIONS.find((disposition) => Object.values(DUEL_PRIMARY_MATRIX[disposition]).includes(name))}/${slug(name)}`,
}]))

export function isDuelPrimary(session: BattleSession): boolean {
  return getCauldronConfig(session).primaryDeck === 'chapter-approved-duel'
}

export function getDuelMission(session: BattleSession, playerId: string): DuelMission {
  const config = getCauldronConfig(session)
  const opponentId = session.state.turnOrder.find((id) => id !== playerId)
  const own = config.playerConfigs[playerId]?.forceDisposition
  const opponent = opponentId && config.playerConfigs[opponentId]?.forceDisposition
  if (!isDuelPrimary(session) || !own || !opponent) throw new Error('The two duel dispositions must be set.')
  return DUEL_MISSIONS[DUEL_PRIMARY_MATRIX[own][opponent]]
}

export type DuelReviewWindow = 'command' | 'turn' | 'battle'
export type DuelPrimaryCommit = { playerId: string; round: number; activePlayerId: string; window: DuelReviewWindow; selections: Record<string, number>; pointsAwarded: number }
export function duelPrimaryCommits(session: BattleSession): DuelPrimaryCommit[] {
  return getCauldronEventData<DuelPrimaryCommit>(session, 'DUEL_PRIMARY_REVIEWED')
}
export function getDuelPrimaryCommit(session: BattleSession, playerId: string, window: DuelReviewWindow): DuelPrimaryCommit | undefined {
  return duelPrimaryCommits(session).find((entry) => entry.round === session.state.round && entry.playerId === playerId
    && entry.activePlayerId === session.state.activePlayerId && entry.window === window)
}
export function hasDuelOwnTurnCommit(session: BattleSession, playerId: string): boolean {
  return duelPrimaryCommits(session).some((entry) => entry.round === session.state.round && entry.playerId === playerId
    && entry.activePlayerId === playerId && entry.window === 'turn')
}
export function getDuelConditions(session: BattleSession, playerId: string, window: DuelReviewWindow): DuelCondition[] {
  const round = session.state.round
  const own = session.state.activePlayerId === playerId
  return getDuelMission(session, playerId).conditions.filter((condition) => (
    round >= (condition.from ?? 1) && round <= (condition.through ?? 5)
    && (window === 'battle' ? condition.window === 'battle'
      : window === 'command' ? own && condition.window === 'command' && round < 5
        : (own && (condition.window === 'turn' || (round === 5 && condition.window === 'command')))
          || condition.window === 'either')
  ))
}
export function duelPrimaryPreview(session: BattleSession, playerId: string, window: DuelReviewWindow, selections: Record<string, number>) {
  const conditions = getDuelConditions(session, playerId, window)
  const groups = new Set<string>()
  for (const [key, value] of Object.entries(selections)) {
    const condition = conditions.find((entry) => entry.id === key)
    if (!condition || !Number.isInteger(value) || value < 0 || value > (condition.count ? 20 : 1)) throw new Error('Invalid Primary condition count.')
    if (condition.group && value > 0) {
      if (groups.has(condition.group)) throw new Error('Choose only one alternative in each OR group.')
      groups.add(condition.group)
    }
  }
  for (const condition of conditions) if (condition.cumulativeWith && (selections[condition.id] ?? 0) > (selections[condition.cumulativeWith] ?? 0)) {
    throw new Error('An additive condition cannot exceed its base condition.')
  }
  const raw = conditions.reduce((sum, condition) => sum + condition.vp * (selections[condition.id] ?? 0), 0)
  const scoredInRound = duelPrimaryCommits(session).filter((entry) => entry.playerId === playerId && entry.round === session.state.round)
    .reduce((sum, entry) => sum + entry.pointsAwarded, 0)
  const score = session.state.players[playerId]?.score.primary ?? 0
  return { raw, awarded: Math.max(0, Math.min(raw, 15 - scoredInRound, 45 - score)), scoredInRound }
}

export function reviewDuelPrimary(session: BattleSession, playerId: string, window: DuelReviewWindow, selections: Record<string, number>): BattleSession {
  if (!isDuelPrimary(session) || session.state.status !== 'active') throw new Error('An active 11th edition duel is required.')
  const active = session.state.activePlayerId === playerId
  if (window === 'command' && (!active || session.state.phase !== 'COMMAND' || session.state.round < 2 || session.state.round === 5)
    || window === 'turn' && session.state.phase !== 'END_TURN'
    || window === 'battle' && (session.state.phase !== 'END_TURN' || session.state.round !== 5 || session.state.activePlayerId !== session.state.turnOrder.at(-1) || !session.state.turnOrder.every((id) => hasDuelOwnTurnCommit(session, id)))) {
    throw new Error('This Primary scoring window is not open.')
  }
  if (window === 'turn' && !active && !getDuelConditions(session, playerId, window).some((entry) => entry.window === 'either')) {
    throw new Error('This player has no opponent-turn Primary scoring.')
  }
  if (getDuelPrimaryCommit(session, playerId, window)) throw new Error('This Primary window has already been reviewed.')
  const { awarded } = duelPrimaryPreview(session, playerId, window, selections)
  const entry: DuelPrimaryCommit = { playerId, round: session.state.round, activePlayerId: session.state.activePlayerId, window, selections, pointsAwarded: awarded }
  return dispatchBattleEvents(session, [
    cauldronEvent('DUEL_PRIMARY_REVIEWED', entry),
    ...(awarded ? [{ type: 'SCORE_ADJUSTED' as const, payload: { playerId, category: 'primary' as const, delta: awarded } }] : []),
  ], { actorPlayerId: playerId })
}

export function hasDuelBattleReady(session: BattleSession, playerId: string): boolean {
  return getCauldronEventData<{ playerId: string }>(session, 'DUEL_BATTLE_READY').some((entry) => entry.playerId === playerId)
}
export function duelBattleReadyVp(session: BattleSession, playerId: string): number {
  return getCauldronEventData<{ playerId: string; ready: boolean }>(session, 'DUEL_BATTLE_READY')
    .some((entry) => entry.playerId === playerId && entry.ready) ? 10 : 0
}
export function confirmDuelBattleReady(session: BattleSession, playerId: string, ready: boolean): BattleSession {
  if (!isDuelPrimary(session) || session.state.phase !== 'END_TURN' || session.state.round !== 5
    || session.state.activePlayerId !== session.state.turnOrder.at(-1)
    || !session.state.turnOrder.every((id) => getDuelPrimaryCommit(session, id, 'battle'))
    || hasDuelBattleReady(session, playerId)) throw new Error('Battle Ready is confirmed once for each player at the end of the battle.')
  return dispatchBattleEvents(session, [cauldronEvent('DUEL_BATTLE_READY', { playerId, ready }),
    ...(ready ? [{ type: 'SCORE_ADJUSTED' as const, payload: { playerId, category: 'adjustment' as const, delta: 10 } }] : []),
  ], { actorPlayerId: session.state.activePlayerId })
}

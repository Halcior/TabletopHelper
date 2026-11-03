import type { BattleSession } from '../../domain/battle/types'
import type { CauldronGameInput } from '../../rulesets/cauldronFFA3/types'
import { getCauldronConfig } from '../../rulesets/cauldronFFA3/sessionConfig'
import { createCauldronGame } from '../../rulesets/cauldronFFA3/session'
import { dispatchBattleEvent } from '../../domain/battle/engine'
import { defaultBattlefieldGeometry } from '../../domain/battlefield/layouts'
import type { BattlefieldGeometry } from '../../domain/battlefield/types'
import { createBattleClock, OFF_CLOCK, type ClockConfig } from '../battleClock/model'
import { createPortableUuid } from '../../multiplayer/uuid'

export type RematchPreset = {
 schemaVersion: 1; id: string; ownerId: string; name: string
 input: CauldronGameInput
 clock: ClockConfig
 geometry: BattlefieldGeometry
 sourceArmyIds: Record<string, string>
 sourceId?: string
 online?: boolean
}
/** Whitelist setup fields. Runtime state/events/hands/clock budgets never enter a preset. */
export function rematchPreset(session: BattleSession, ownerId: string): RematchPreset {
 const c = getCauldronConfig(session)
 const sourceArmyIds: Record<string, string> = {}
 const armies = Object.values(session.setup.armies).map(army => {
  const id = createPortableUuid(); sourceArmyIds[id] = army.id
  return { ...structuredClone(army), id }
 })
 const mapped = (id?: string) => Object.keys(sourceArmyIds).find(key => sourceArmyIds[key] === id) ?? ''
 const order = session.setup.doubles?.forces.flatMap(force => [force.captainPlayerId, ...force.memberPlayerIds.filter(id => id !== force.captainPlayerId)]) ?? session.setup.players.map(player => player.id)
 const players = order.map(id => {
  const p = session.setup.players.find(player => player.id === id)!
  const config = c.playerConfigs[p.id]
  if (!config) throw new Error('Historical setup has no participant configuration.')
  return { id: p.id, name: p.name, armyId: mapped(p.armyId), deploymentZone: config.deploymentZone, turnPosition: config.turnPosition, operationalPlanId: config.initialOperationalPlanId, officialPrimaryId: config.officialPrimaryId, forceDisposition: config.forceDisposition }
 })
 return { schemaVersion: 1, id: createPortableUuid(), ownerId, name: session.setup.players.map(p => p.name).join(' · '), sourceId: session.setup.battlefieldSourceId,
 clock: structuredClone(session.setup.battleClock ?? OFF_CLOCK), geometry: structuredClone(session.state.battlefield ?? defaultBattlefieldGeometry(session.setup)), sourceArmyIds,
 input: { armies, players, guidanceLevel: session.setup.guidanceLevel, mode: c.mode ?? (session.setup.doubles ? 'doubles2v2' : players.length === 2 ? 'duel' : 'ffa3'), doubles: structuredClone(session.setup.doubles), objectiveLayout: c.objectiveLayout, primaryDeck: c.primaryDeck, secondaryDeck: c.secondaryDeck, officialPrimaryBalance: c.officialPrimaryBalance, ffaCpPolicy: (c.mode === 'ffa3' || players.length === 3) ? c.ffaCpPolicy ?? 'legacy-turn' : undefined, officialSecondaryStrategy: c.officialSecondaryStrategy, officialSecondaryStrategies: structuredClone(c.officialSecondaryStrategies), fixedSecondarySelections: structuredClone(c.fixedSecondarySelections), officialLayout: c.officialLayout, battlefieldAttackerHomeZone: session.setup.battlefieldAttackerHomeZone } }
}
export type RematchOptions = { geometry?: BattlefieldGeometry; sourceId?: string; ffaCpPolicy?: CauldronGameInput['ffaCpPolicy']; officialPrimaryBalance?: CauldronGameInput['officialPrimaryBalance'] }
export function freshBattle(input: CauldronGameInput, clock: ClockConfig = OFF_CLOCK, options: RematchOptions = {}, now = Date.now()): BattleSession {
 let session = createCauldronGame({ ...structuredClone(input), gameId: createPortableUuid(), createdAt: new Date(now).toISOString(), ffaCpPolicy: options.ffaCpPolicy ?? input.ffaCpPolicy, officialPrimaryBalance: options.officialPrimaryBalance ?? input.officialPrimaryBalance })
 if (options.sourceId) session.setup.battlefieldSourceId = options.sourceId
 if (options.geometry) session = dispatchBattleEvent(session, { type: 'BATTLEFIELD_LAYOUT_CHANGED', payload: { geometry: structuredClone(options.geometry) } }, { undoable: false })
 if (clock.preset !== 'off') { session.setup.battleClock = structuredClone(clock); session.battleClock = createBattleClock(session.setup, clock, now) }
 return session
}
export function freshPresetBattle(preset: RematchPreset, now = Date.now()) {
 return freshBattle(preset.input, preset.clock, { geometry: preset.geometry, sourceId: preset.sourceId }, now)
}
export function rosterDifference(saved: RematchPreset['input']['armies'][number], current?: RematchPreset['input']['armies'][number]) {
 if (!current) return 'Original roster missing. The recorded snapshot remains available.'
 return JSON.stringify({ ...saved, id: '', localMediaId: undefined }) === JSON.stringify({ ...current, id: '', localMediaId: undefined }) ? 'Original roster unchanged.' : 'Roster changed. Review points, models and equipment before choosing a version.'
}

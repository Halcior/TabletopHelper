import { describe, expect, it } from 'vitest'
import { deserializeBattleSession, dispatchBattleEvent, dispatchBattleEvents, serializeBattleSession, undoLastAction } from '../../domain/battle/engine'
import type { Army } from '../../domain/army/types'
import type { BattleSession } from '../../domain/battle/types'
import { authorizeSharedMutation } from '../../multiplayer/sharedEventPolicy'
import { testArmy } from './cauldronTestUtils'
import {
  assignOfficialGuards, canScoreOfficialSecondary, discardOfficialAtEndTurn, noteOfficialTarget,
  officialAwards, officialRedrawReason, replaceOfficialSecondary, scoreOfficialSecondary, startOfficialSecondaryAction,
} from './officialSecondary'
import { OFFICIAL_SECONDARY_BY_ID, OFFICIAL_SECONDARY_IDS } from './officialSecondaryDefinitions'
import {
  getOfficialSecondaryRival, officialKillLedger, officialNmlObjectives, officialTemptingTargets,
} from './officialSecondaryFFA'
import { getCurrentRivalPlayerId } from './rivalRotation'
import { createSecondaryRefillEvents, getSecondaryState, officialDrawEvents } from './secondary'
import { advanceCauldronPhase, createCauldronGame } from './session'
import { secondaryStrategyFor } from './sessionConfig'
import type { OfficialSecondaryId } from './secondaryTypes'

function game(first: OfficialSecondaryId[], options: { fixed?: boolean; armies?: (armies: Army[]) => void } = {}): BattleSession {
  const armies = ['a', 'b', 'c'].map((id) => testArmy(`army-${id}`))
  for (const army of armies) army.units[0].startingModels = 13
  options.armies?.(armies)
  const order = [...first, ...OFFICIAL_SECONDARY_IDS.filter((id) => !first.includes(id))]
  return createCauldronGame({
    gameId: 'ffa-secondary-test', guidanceLevel: 'fast', secondaryDeck: 'chapter-approved', armies,
    officialSecondaryStrategy: options.fixed ? 'fixed' : undefined,
    secondaryDeckOrders: Object.fromEntries(['p-a', 'p-b', 'p-c'].map((id) => [id, order])),
    fixedSecondarySelections: options.fixed ? Object.fromEntries(['p-a', 'p-b', 'p-c'].map((id) => [id, [first[0], first[1]]])) : undefined,
    players: armies.map((army, index) => ({
      id: `p-${'abc'[index]}`, name: `Player ${'ABC'[index]}`, armyId: army.id,
      deploymentZone: 'ABC'[index] as 'A' | 'B' | 'C', turnPosition: (index + 1) as 1 | 2 | 3,
      operationalPlanId: 'WYNISZCZENIE',
    })),
  })
}

function window(session: BattleSession, round: number, playerId: string, end = true): BattleSession {
  return dispatchBattleEvents(session, [
    ...(session.state.round !== round ? [{ type: 'ROUND_STARTED' as const, payload: { round } }] : []),
    { type: 'TURN_STARTED', payload: { playerId } },
    ...(end ? [{ type: 'PHASE_CHANGED' as const, payload: { phase: 'END_TURN' as const } }] : []),
  ])
}

function control(session: BattleSession, objectiveId: string, playerId: string | null = 'p-a') {
  return dispatchBattleEvent(session, { type: 'OBJECTIVE_CONTROL_CHANGED', payload: { objectiveId, controllerPlayerId: playerId } })
}

function kill(session: BattleSession, unitId: string, target = 'p-b', killer: string | null = 'p-a') {
  return dispatchBattleEvent(session, { type: 'UNIT_DESTROYED', payload: { playerId: target, unitId, destroyedByPlayerId: killer } })
}

describe('FFA Secondary Balance Patch', () => {
  it('draws the first cards at each actual own Command and requires when-drawn choices before progression', () => {
    let session = game(['OFFICIAL_BEACON', 'OFFICIAL_NO_PRISONERS'])
    expect(getSecondaryState(session)['p-b'].active).toEqual([])
    expect(getSecondaryState(session)['p-c'].active).toEqual([])
    expect(() => advanceCauldronPhase(session)).toThrow(/when-drawn/)
    session = noteOfficialTarget(session, 'p-a', 'OFFICIAL_BEACON', 'infantry')
    expect(advanceCauldronPhase(session).state.phase).toBe('MOVEMENT')
    const refill = createSecondaryRefillEvents(session, 'p-c', 1)
    expect(refill).toHaveLength(2)
    const drawn = dispatchBattleEvents(session, refill)
    expect(getSecondaryState(drawn)['p-c'].active[0].secondaryRivalPlayerId).toBe('p-a')
    // A legacy setup hand is retained, with no duplicate first Command draw.
    expect(createSecondaryRefillEvents(drawn, 'p-c', 1)).toEqual([])
  })

  it('an eliminated army drawing Beacon can continue instead of being stuck choosing a nonexistent unit', () => {
    let session = game(['OFFICIAL_BEACON', 'OFFICIAL_NO_PRISONERS'])
    for (const unitId of ['infantry', 'tank', 'remainder']) session = kill(session, unitId, 'p-a', 'p-c')
    expect(advanceCauldronPhase(session).state.phase).toBe('MOVEMENT')
    expect(officialAwards(window(session, 1, 'p-b'), 'p-a', 'OFFICIAL_BEACON', { unitWhollyOutsideOwnTerritory: true })).toEqual([])
  })
  it('keeps the draw-time Rival after rotation, and binds newly refilled cards to the new Rival', () => {
    let session = game(['OFFICIAL_BEACON', 'OFFICIAL_NO_PRISONERS'])
    session = noteOfficialTarget(session, 'p-a', 'OFFICIAL_BEACON', 'infantry')
    session = window(session, 2, 'p-a', false)
    session = dispatchBattleEvents(session, createSecondaryRefillEvents(session, 'p-a', 2))
    expect(getCurrentRivalPlayerId(session, 'p-a')).toBe('p-c')
    expect(getOfficialSecondaryRival(session, 'p-a', 'OFFICIAL_BEACON')).toBe('p-b')
    expect(getSecondaryState(session)['p-a'].active.find((card) => card.cardId === 'OFFICIAL_BEACON')).toMatchObject({
      secondaryRivalPlayerId: 'p-b', cardSpecificState: { officialTargetUnitId: 'infantry' },
    })
    for (const card of getSecondaryState(session)['p-a'].active.filter((card) => card.drawnRound === 2)) {
      if (OFFICIAL_SECONDARY_BY_ID[card.cardId as OfficialSecondaryId].usesSecondaryRival) expect(card.secondaryRivalPlayerId).toBe('p-c')
    }
  })

  it('scores Beacon only at the saved Rival turn end after rotation and keeps its unit locked', () => {
    let session = noteOfficialTarget(game(['OFFICIAL_BEACON', 'OFFICIAL_NO_PRISONERS']), 'p-a', 'OFFICIAL_BEACON', 'infantry')
    expect(() => noteOfficialTarget(session, 'p-a', 'OFFICIAL_BEACON', 'tank')).toThrow(/locked/)
    expect(canScoreOfficialSecondary(window(session, 2, 'p-c'), 'p-a', 'OFFICIAL_BEACON')).toBe(false)
    session = window(session, 2, 'p-b')
    expect(canScoreOfficialSecondary(session, 'p-a', 'OFFICIAL_BEACON')).toBe(true)
    expect(officialAwards(session, 'p-a', 'OFFICIAL_BEACON', { secondaryRivalPlayerId: 'p-c', beaconOutsideOwnDeployment: true })).toEqual([])
    const scored = scoreOfficialSecondary(session, 'p-a', 'OFFICIAL_BEACON', 3, { beaconOutsideOwnDeployment: true })
    expect(scored.state.players['p-a'].score.secondary).toBe(3)
  })

  it('a Beacon drawn after its Rival turn waits for the next Rival turn, with a round-5 fallback', () => {
    let session = window(game(['OFFICIAL_CENTRE_GROUND', 'OFFICIAL_OUTFLANK']), 2, 'p-c', false)
    session = dispatchBattleEvents(session, officialDrawEvents(session, 'p-c', ['OFFICIAL_BEACON'], 1, 2, 1))
    // C's even-round Rival is B, whose turn has already passed in A/B/C order.
    expect(getOfficialSecondaryRival(session, 'p-c', 'OFFICIAL_BEACON')).toBe('p-b')
    expect(canScoreOfficialSecondary(window(session, 2, 'p-c'), 'p-c', 'OFFICIAL_BEACON')).toBe(false)
    expect(canScoreOfficialSecondary(window(session, 3, 'p-a'), 'p-c', 'OFFICIAL_BEACON')).toBe(false)
    expect(canScoreOfficialSecondary(window(session, 3, 'p-b'), 'p-c', 'OFFICIAL_BEACON')).toBe(true)
    expect(canScoreOfficialSecondary(window(session, 5, 'p-c'), 'p-c', 'OFFICIAL_BEACON')).toBe(true)
  })

  it('a third-player unit blocks Centre Ground and both enemies must be checked', () => {
    const session = window(game(['OFFICIAL_CENTRE_GROUND', 'OFFICIAL_OUTFLANK']), 1, 'p-a')
    const input = { ownUnitWithin3OfCenter: true, enemyCenterDistanceByPlayer: { 'p-b': 'outside-6' as const, 'p-c': 'within-3' as const } }
    expect(officialAwards(session, 'p-a', 'OFFICIAL_CENTRE_GROUND', input)).toEqual([])
    expect(() => scoreOfficialSecondary(session, 'p-a', 'OFFICIAL_CENTRE_GROUND', 5, input)).toThrow(/valid VP/)
    expect(officialAwards(session, 'p-a', 'OFFICIAL_CENTRE_GROUND', { ownUnitWithin3OfCenter: true, enemyCenterDistanceByPlayer: { 'p-b': 'outside-6' } })).toEqual([])
    expect(officialAwards(session, 'p-a', 'OFFICIAL_CENTRE_GROUND', { ...input, enemyCenterDistanceByPlayer: { 'p-b': 'outside-6', 'p-c': 'within-6' } })).toEqual([3])
    expect(officialAwards(session, 'p-a', 'OFFICIAL_CENTRE_GROUND', { ...input, enemyCenterDistanceByPlayer: { 'p-b': 'outside-6', 'p-c': 'outside-6' } })).toEqual([5])
  })

  it('a third-player unit blocks the Defend Stronghold bonus without removing HOME points', () => {
    let session = window(control(game(['OFFICIAL_CENTRE_GROUND', 'OFFICIAL_OUTFLANK']), 'A-HOME'), 2, 'p-a', false)
    session = dispatchBattleEvents(session, officialDrawEvents(session, 'p-a', ['OFFICIAL_DEFEND_STRONGHOLD'], 1, 2, 2))
    session = window(session, 2, 'p-c')
    expect(officialAwards(session, 'p-a', 'OFFICIAL_DEFEND_STRONGHOLD', { enemyInOwnDeploymentByPlayer: { 'p-c': false, 'p-b': true } })).toEqual([3])
    expect(officialAwards(session, 'p-a', 'OFFICIAL_DEFEND_STRONGHOLD', { enemyInOwnDeploymentByPlayer: { 'p-c': false, 'p-b': false } })).toEqual([5])
    expect(officialAwards(control(session, 'A-HOME', 'p-b'), 'p-a', 'OFFICIAL_DEFEND_STRONGHOLD', { enemyInOwnDeploymentByPlayer: { 'p-c': false, 'p-b': false } })).toEqual([])
  })

  it.each([
    ['OFFICIAL_A_GRIEVOUS_BLOW', 'infantry', 5],
    ['OFFICIAL_ASSASSINATION', 'remainder', 5],
    ['OFFICIAL_BRING_IT_DOWN', 'tank', 5],
    ['OFFICIAL_NO_PRISONERS', 'infantry', 2],
    ['OFFICIAL_OVERWHELMING_FORCE', 'infantry', 3],
  ] as const)('%s requires an owner-attributed kill against the assigned Rival', (cardId, unitId, vp) => {
    const session = window(game([cardId, 'OFFICIAL_OUTFLANK']), 1, 'p-a')
    const input = { overwhelmingForceUnitIds: [unitId] }
    for (const invalid of [kill(session, unitId, 'p-b', 'p-c'), kill(session, unitId, 'p-c', 'p-a'), kill(session, unitId, 'p-b', null)]) {
      expect(officialAwards(invalid, 'p-a', cardId, input)).toEqual([])
      expect(() => scoreOfficialSecondary(invalid, 'p-a', cardId, vp, input)).toThrow(/valid VP/)
    }
    const valid = kill(session, unitId)
    expect(officialAwards(valid, 'p-a', cardId, input)).toEqual([vp])
    expect(scoreOfficialSecondary(valid, 'p-a', cardId, vp, input).state.players['p-a'].score.secondary).toBe(vp)
    expect(officialAwards(undoLastAction(valid), 'p-a', cardId, input)).toEqual([])
  })

  it('Assassination ignores non-CHARACTER kills and does not credit all-CHARACTER kills by a third player', () => {
    const session = window(game(['OFFICIAL_ASSASSINATION', 'OFFICIAL_OUTFLANK']), 1, 'p-a')
    expect(officialAwards(kill(session, 'tank'), 'p-a', 'OFFICIAL_ASSASSINATION')).toEqual([])
    const killedByThird = window(kill(session, 'remainder', 'p-b', 'p-c'), 2, 'p-a')
    expect(officialAwards(killedByThird, 'p-a', 'OFFICIAL_ASSASSINATION')).toEqual([])
    const owned = window(kill(session, 'remainder'), 2, 'p-a')
    expect(officialAwards(owned, 'p-a', 'OFFICIAL_ASSASSINATION')).toEqual([5])
  })

  it('counts partial model kills for model cards, deduplicates deaths, and forgets previous-turn unit kills', () => {
    let session = window(game(['OFFICIAL_BRING_IT_DOWN', 'OFFICIAL_NO_PRISONERS']), 1, 'p-a')
    session = dispatchBattleEvent(session, { type: 'UNIT_WOUNDS_CHANGED', payload: { playerId: 'p-b', unitId: 'tank', woundsRemaining: 0, destroyedByPlayerId: 'p-a' } })
    session = kill(session, 'tank')
    expect(officialKillLedger(session)).toHaveLength(1)
    expect(officialAwards(session, 'p-a', 'OFFICIAL_BRING_IT_DOWN')).toEqual([5])
    expect(officialAwards(session, 'p-a', 'OFFICIAL_NO_PRISONERS')).toEqual([2])
    expect(officialAwards(window(session, 1, 'p-b'), 'p-a', 'OFFICIAL_NO_PRISONERS')).toEqual([])
    const characters = window(game(['OFFICIAL_ASSASSINATION', 'OFFICIAL_OUTFLANK'], { armies: (armies) => { armies[1].units[2].startingModels = 2 } }), 1, 'p-a')
    const partial = dispatchBattleEvent(characters, { type: 'UNIT_MODEL_DESTROYED', payload: { playerId: 'p-b', unitId: 'remainder', amount: 1, destroyedByPlayerId: 'p-a' } })
    expect(partial.state.players['p-b'].units.remainder.destroyed).toBe(false)
    expect(officialAwards(partial, 'p-a', 'OFFICIAL_ASSASSINATION')).toEqual([5])
  })

  it.each([
    [3, 2, 2, true], [3, 4, 0, false], [3, 3, 1, false], [1, 0, 0, true],
  ])('Display of Might uses own=%i > max(%i,%i)', (own, b, c, success) => {
    const session = window(game(['OFFICIAL_DISPLAY_OF_MIGHT', 'OFFICIAL_OUTFLANK']), 1, 'p-a')
    const input = { qualifyingNmlUnitsByPlayer: { 'p-a': own, 'p-b': b, 'p-c': c } }
    expect(officialAwards(session, 'p-a', 'OFFICIAL_DISPLAY_OF_MIGHT', input)).toEqual(success ? [2] : [])
    expect(officialAwards(window(session, 2, 'p-b'), 'p-a', 'OFFICIAL_DISPLAY_OF_MIGHT', input)).toEqual(success ? [5] : [])
    expect(officialAwards(session, 'p-a', 'OFFICIAL_DISPLAY_OF_MIGHT', { qualifyingNmlUnitsByPlayer: { 'p-a': own, 'p-b': b } })).toEqual([])
  })

  it('Tempting Target offers CENTER plus the shared pairwise neutral, and locks the selected objective', () => {
    const session = game(['OFFICIAL_A_TEMPTING_TARGET', 'OFFICIAL_OUTFLANK'])
    expect(officialTemptingTargets(session, 'p-a')).toEqual(['AB-NEUTRAL', 'CENTER'])
    expect(officialTemptingTargets(session, 'p-b')).toEqual(['BC-NEUTRAL', 'CENTER'])
    expect(officialTemptingTargets(session, 'p-c')).toEqual(['AC-NEUTRAL', 'CENTER'])
    expect(() => noteOfficialTarget(session, 'p-a', 'OFFICIAL_A_TEMPTING_TARGET', 'BC-NEUTRAL')).toThrow(/pairwise/)
    const chosen = noteOfficialTarget(session, 'p-a', 'OFFICIAL_A_TEMPTING_TARGET', 'AB-NEUTRAL')
    expect(() => noteOfficialTarget(chosen, 'p-a', 'OFFICIAL_A_TEMPTING_TARGET', 'CENTER')).toThrow(/locked/)
    expect(officialAwards(window(control(chosen, 'AB-NEUTRAL'), 2, 'p-a'), 'p-a', 'OFFICIAL_A_TEMPTING_TARGET')).toEqual([5])
    expect(officialTemptingTargets(window(chosen, 2, 'p-a'), 'p-a')).toEqual(['AB-NEUTRAL', 'CENTER'])
  })

  it('Forward Position uses Rival HOME or the shared neutral plus CENTER, retaining that front after rotation', () => {
    const session = window(game(['OFFICIAL_FORWARD_POSITION', 'OFFICIAL_OUTFLANK']), 2, 'p-a')
    expect(officialAwards(control(session, 'C-HOME'), 'p-a', 'OFFICIAL_FORWARD_POSITION')).toEqual([])
    expect(officialAwards(control(session, 'B-HOME'), 'p-a', 'OFFICIAL_FORWARD_POSITION')).toEqual([5])
    expect(officialAwards(control(control(session, 'AC-NEUTRAL'), 'CENTER'), 'p-a', 'OFFICIAL_FORWARD_POSITION')).toEqual([])
    expect(officialAwards(control(session, 'AB-NEUTRAL'), 'p-a', 'OFFICIAL_FORWARD_POSITION')).toEqual([])
    expect(officialAwards(control(control(session, 'AB-NEUTRAL'), 'CENTER'), 'p-a', 'OFFICIAL_FORWARD_POSITION')).toEqual([5])
  })

  it('Outflank and Beacon require wholly outside Territory for their outside-Territory awards', () => {
    let session = noteOfficialTarget(game(['OFFICIAL_OUTFLANK', 'OFFICIAL_BEACON']), 'p-a', 'OFFICIAL_BEACON', 'infantry')
    const edge = { outflankUnitNearEdge: true, outflankOppositeEdges: true }
    expect(officialAwards(window(session, 1, 'p-a'), 'p-a', 'OFFICIAL_OUTFLANK', { ...edge, unitWhollyOutsideOwnTerritory: false })).toEqual([])
    expect(officialAwards(window(session, 1, 'p-a'), 'p-a', 'OFFICIAL_OUTFLANK', { ...edge, unitWhollyOutsideOwnTerritory: true })).toEqual([5])
    session = window(session, 1, 'p-b')
    expect(officialAwards(session, 'p-a', 'OFFICIAL_BEACON', { beaconOutsideOwnDeployment: true, unitWhollyOutsideOwnTerritory: false })).toEqual([3])
    expect(officialAwards(session, 'p-a', 'OFFICIAL_BEACON', { unitWhollyOutsideOwnTerritory: true })).toEqual([5])
    expect(officialAwards(kill(session, 'infantry', 'p-a', 'p-b'), 'p-a', 'OFFICIAL_BEACON', { unitWhollyOutsideOwnTerritory: true })).toEqual([])
  })

  it('Plunder requires the entire footprint outside Territory at start, not only the unit', () => {
    const session = dispatchBattleEvent(game(['OFFICIAL_PLUNDER', 'OFFICIAL_OUTFLANK']), { type: 'PHASE_CHANGED', payload: { phase: 'SHOOTING' } })
    expect(() => startOfficialSecondaryAction(session, 'p-a', 'OFFICIAL_PLUNDER', 'infantry', 'Ruins crossing boundary')).toThrow(/entire terrain footprint/)
    expect(() => startOfficialSecondaryAction(session, 'p-a', 'OFFICIAL_PLUNDER', 'infantry', 'Ruins touching boundary', { terrainWhollyOutsideOwnTerritory: false })).toThrow(/entire terrain footprint/)
    const started = startOfficialSecondaryAction(session, 'p-a', 'OFFICIAL_PLUNDER', 'infantry', 'Ruins B', { terrainWhollyOutsideOwnTerritory: true })
    expect(() => startOfficialSecondaryAction(started, 'p-a', 'OFFICIAL_PLUNDER', 'tank', 'Ruins C', { terrainWhollyOutsideOwnTerritory: true })).toThrow(/one unit/)
    const ended = dispatchBattleEvent(started, { type: 'PHASE_CHANGED', payload: { phase: 'END_TURN' } })
    expect(officialAwards(ended, 'p-a', 'OFFICIAL_PLUNDER')).toEqual([5])
  })

  it('Secure NML recognizes all four neutral objectives and does not count HOME', () => {
    const session = window(game(['OFFICIAL_SECURE_NO_MANS_LAND', 'OFFICIAL_OUTFLANK']), 1, 'p-a')
    const neutrals = ['AB-NEUTRAL', 'AC-NEUTRAL', 'BC-NEUTRAL', 'CENTER']
    expect(officialNmlObjectives(session)).toEqual(neutrals)
    for (const id of neutrals) {
      const other = neutrals.find((candidate) => candidate !== id)!
      expect(officialAwards(control(control(session, id), other), 'p-a', 'OFFICIAL_SECURE_NO_MANS_LAND')).toEqual([5])
      expect(officialAwards(control(control(session, id), 'A-HOME'), 'p-a', 'OFFICIAL_SECURE_NO_MANS_LAND')).toEqual([])
    }
  })

  it('Burden saves guard/objective assignments; either enemy can take control and only saved guards count', () => {
    let session = control(control(game(['OFFICIAL_BURDEN_OF_TRUST', 'OFFICIAL_OUTFLANK']), 'A-HOME'), 'AB-NEUTRAL')
    session = assignOfficialGuards(session, 'p-a', { 'A-HOME': 'infantry', 'AB-NEUTRAL': 'tank' })
    expect(() => assignOfficialGuards(session, 'p-a', { 'A-HOME': 'tank', 'AB-NEUTRAL': 'infantry' })).toThrow(/already saved/)
    session = window(session, 2, 'p-b')
    const input = { guardingObjectiveIdsInRange: ['A-HOME', 'AB-NEUTRAL'] }
    expect(officialAwards(session, 'p-a', 'OFFICIAL_BURDEN_OF_TRUST', input)).toEqual([4])
    expect(officialAwards(control(session, 'AB-NEUTRAL', 'p-c'), 'p-a', 'OFFICIAL_BURDEN_OF_TRUST', input)).toEqual([2])
    expect(officialAwards(kill(session, 'tank', 'p-a', 'p-c'), 'p-a', 'OFFICIAL_BURDEN_OF_TRUST', input)).toEqual([2])
    expect(officialAwards(session, 'p-a', 'OFFICIAL_BURDEN_OF_TRUST', { guardingObjectiveIdsInRange: ['A-HOME'] })).toEqual([2])
  })

  it('Cleanse uses any of the neutral fronts and requires acting-unit completion and control', () => {
    let session = dispatchBattleEvent(game(['OFFICIAL_CLEANSE', 'OFFICIAL_OUTFLANK']), { type: 'PHASE_CHANGED', payload: { phase: 'SHOOTING' } })
    expect(() => startOfficialSecondaryAction(session, 'p-a', 'OFFICIAL_CLEANSE', 'infantry', 'B-HOME')).toThrow(/non-HOME/)
    session = startOfficialSecondaryAction(session, 'p-a', 'OFFICIAL_CLEANSE', 'infantry', 'BC-NEUTRAL')
    session = control(session, 'BC-NEUTRAL')
    session = dispatchBattleEvent(session, { type: 'PHASE_CHANGED', payload: { phase: 'END_TURN' } })
    expect(officialAwards(session, 'p-a', 'OFFICIAL_CLEANSE')).toEqual([])
    expect(officialAwards(session, 'p-a', 'OFFICIAL_CLEANSE', { completedCleanseObjectiveIds: ['BC-NEUTRAL'] })).toEqual([2])
    expect(officialAwards(control(session, 'BC-NEUTRAL', 'p-c'), 'p-a', 'OFFICIAL_CLEANSE', { completedCleanseObjectiveIds: ['BC-NEUTRAL'] })).toEqual([])
  })

  it('no-target replacements check only the pinned Rival army, including after Current Rival changes', () => {
    const session = game(['OFFICIAL_A_GRIEVOUS_BLOW', 'OFFICIAL_BRING_IT_DOWN'], { armies: (armies) => {
      armies[1].units[0].startingModels = 4
      armies[1].units[1].stats!.wounds = 8
      armies[1].units[2].stats!.wounds = 3
    } })
    expect(officialRedrawReason(session, 'p-a', 'OFFICIAL_A_GRIEVOUS_BLOW')).toMatch(/assigned Secondary Rival/)
    expect(officialRedrawReason(session, 'p-a', 'OFFICIAL_BRING_IT_DOWN')).toMatch(/assigned Secondary Rival/)
    expect(officialRedrawReason(game(['OFFICIAL_A_GRIEVOUS_BLOW', 'OFFICIAL_BRING_IT_DOWN']), 'p-a', 'OFFICIAL_BRING_IT_DOWN')).toBeUndefined()
  })

  it('replacement binds a new card to Current Rival while a discarded card retains its old Rival', () => {
    let session = game(['OFFICIAL_BEHIND_ENEMY_LINES', 'OFFICIAL_OUTFLANK', 'OFFICIAL_BEACON'])
    session = window(session, 2, 'p-a', false)
    session = dispatchBattleEvent(session, { type: 'CP_GAINED', payload: { playerId: 'p-a', amount: 1 } })
    session = replaceOfficialSecondary(session, 'p-a', 'OFFICIAL_BEHIND_ENEMY_LINES', true)
    expect(getOfficialSecondaryRival(session, 'p-a', 'OFFICIAL_BEACON')).toBe('p-c')
    expect(getSecondaryState(session)['p-a'].discarded[0].secondaryRivalPlayerId).toBe('p-b')
  })

  it('Fixed retains its initial Rival and calculates only attributed qualifying kills', () => {
    let session = window(game(['OFFICIAL_A_GRIEVOUS_BLOW', 'OFFICIAL_ASSASSINATION'], { fixed: true }), 2, 'p-a')
    session = kill(kill(session, 'infantry', 'p-b', 'p-c'), 'remainder', 'p-b', 'p-a')
    expect(getOfficialSecondaryRival(session, 'p-a', 'OFFICIAL_ASSASSINATION')).toBe('p-b')
    expect(officialAwards(session, 'p-a', 'OFFICIAL_A_GRIEVOUS_BLOW')).toEqual([])
    expect(officialAwards(session, 'p-a', 'OFFICIAL_ASSASSINATION')).toEqual([4])
    const scored = scoreOfficialSecondary(session, 'p-a', 'OFFICIAL_ASSASSINATION', 4)
    expect(getSecondaryState(scored)['p-a'].active).toHaveLength(2)
    expect(() => scoreOfficialSecondary(scored, 'p-a', 'OFFICIAL_ASSASSINATION', 4)).toThrow(/already scored/)
  })

  it('save/reload retains Rival, locked choice, archives and shared opponent-turn scoring', () => {
    let session = noteOfficialTarget(game(['OFFICIAL_BEACON', 'OFFICIAL_NO_PRISONERS']), 'p-a', 'OFFICIAL_BEACON', 'infantry')
    session = deserializeBattleSession(serializeBattleSession(window(session, 2, 'p-b')))
    expect(getOfficialSecondaryRival(session, 'p-a', 'OFFICIAL_BEACON')).toBe('p-b')
    expect(getSecondaryState(session)['p-a'].active[0].cardSpecificState?.officialTargetUnitId).toBe('infantry')
    const scored = scoreOfficialSecondary(session, 'p-a', 'OFFICIAL_BEACON', 3, { beaconOutsideOwnDeployment: true })
    expect(authorizeSharedMutation(session, scored, { roomId: 'room', roomCode: 'ABC123', battleId: session.setup.gameId, clientId: 'a', playerId: 'p-a', isHost: true }).allowed).toBe(true)
    const loaded = deserializeBattleSession(serializeBattleSession(scored))
    expect(getSecondaryState(loaded)['p-a'].completed[0].secondaryRivalPlayerId).toBe('p-b')
    expect(getSecondaryState(loaded)['p-a'].scoreHistory[0].secondaryRivalPlayerId).toBe('p-b')
  })

  it('legacy saves without secondaryRivalPlayerId still load, using Current Rival, and keep N1/N2/N3 IDs', () => {
    const session = window(game(['OFFICIAL_BEACON', 'OFFICIAL_A_TEMPTING_TARGET']), 2, 'p-a')
    const stored = JSON.parse(serializeBattleSession(session)) as BattleSession
    for (const event of stored.state.events) if (event.type === 'RULESET_EVENT' && event.payload.action === 'SECONDARY_DRAWN') delete (event.payload.data as { secondaryRivalPlayerId?: string }).secondaryRivalPlayerId
    const aliases: Record<string, string> = { 'AB-NEUTRAL': 'N1', 'AC-NEUTRAL': 'N2', 'BC-NEUTRAL': 'N3' }
    stored.setup.objectives = stored.setup.objectives.map((objective) => ({ ...objective, id: aliases[objective.id] ?? objective.id, name: aliases[objective.id] ?? objective.name }))
    const loaded = deserializeBattleSession(JSON.stringify(stored))
    expect(getSecondaryState(loaded)['p-a'].active[0].secondaryRivalPlayerId).toBeUndefined()
    expect(getOfficialSecondaryRival(loaded, 'p-a', 'OFFICIAL_BEACON')).toBe('p-c')
    expect(officialTemptingTargets(loaded, 'p-a')).toEqual(['N2', 'CENTER'])
    expect(officialNmlObjectives(loaded)).toEqual(['N1', 'N2', 'N3', 'CENTER'])
  })

  it('defaults to Tactical and does not bind Rival-independent cards', () => {
    const session = game(['OFFICIAL_OUTFLANK', 'OFFICIAL_CENTRE_GROUND'])
    expect(secondaryStrategyFor(session, 'p-a')).toBe('tactical')
    expect(getSecondaryState(session)['p-a'].active.every((card) => card.secondaryRivalPlayerId === undefined)).toBe(true)
    expect(session.setup.objectives.map((objective) => objective.id)).toEqual(['A-HOME', 'B-HOME', 'C-HOME', 'AB-NEUTRAL', 'AC-NEUTRAL', 'BC-NEUTRAL', 'CENTER'])
    const discarded = discardOfficialAtEndTurn(window(session, 1, 'p-a'), 'p-a', ['OFFICIAL_OUTFLANK'])
    expect(getSecondaryState(discarded)['p-a'].discarded).toHaveLength(1)
  })
})

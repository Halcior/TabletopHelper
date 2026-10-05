import { expect, it } from 'vitest'
import { deserializeBattleSession, dispatchBattleEvent, dispatchBattleEvents, serializeBattleSession } from '../../domain/battle/engine'
import { testArmy } from './cauldronTestUtils'
import { getCauldronEventData } from './events'
import {
  acknowledgeOfficialWindow, canScoreOfficialSecondary, discardOfficialAtEndTurn,
  officialAwards, officialPendingReviewPlayers, scoreOfficialSecondary,
  assignOfficialGuards, noteOfficialTarget,
} from './officialSecondary'
import { OFFICIAL_SECONDARY_IDS } from './officialSecondaryDefinitions'
import { officialTemptingTargets } from './officialSecondaryFFA'
import { createPrimaryTurnCommitEvents, getPrimaryTurnCommit } from './primary'
import { getCurrentRivalPlayerId } from './rivalRotation'
import { confirmCauldronEndRound } from './roundEnd'
import { getRoundSecondaryVp, getSecondaryState } from './secondary'
import { advanceCauldronPhase, createCauldronGame, isCauldronEndOfRound } from './session'
import type { OfficialSecondaryId } from './secondaryTypes'
import type { OfficialPrimaryId } from './types'

it('completes five rounds of FFA 3 + 11th Primary + Tactical with caps, Rival rotation and saved-state replay', () => {
  const armies = ['a', 'b', 'c'].map((id) => testArmy(`army-${id}`))
  const missions: OfficialPrimaryId[] = ['battlefield-dominance', 'meatgrinder', 'outmanoeuvre']
  let session = createCauldronGame({
    gameId: 'official-ffa-flow', guidanceLevel: 'fast', armies,
    primaryDeck: 'chapter-approved-ffa', objectiveLayout: 'expanded-7',
    secondaryDeck: 'chapter-approved', officialSecondaryStrategy: 'tactical',
    secondaryDeckOrders: Object.fromEntries(['p-a', 'p-b', 'p-c'].map((id) => [id, OFFICIAL_SECONDARY_IDS])),
    players: armies.map((army, index) => ({
      id: `p-${'abc'[index]}`, name: `Player ${index + 1}`, armyId: army.id,
      deploymentZone: 'ABC'[index] as 'A' | 'B' | 'C', turnPosition: (index + 1) as 1 | 2 | 3,
      operationalPlanId: 'WYNISZCZENIE', officialPrimaryId: missions[index],
    })),
  })
  for (const [objectiveId, controllerPlayerId] of Object.entries({
    'A-HOME': 'p-a', 'B-HOME': 'p-b', 'C-HOME': 'p-c', 'AB-NEUTRAL': 'p-a', 'AC-NEUTRAL': 'p-b', 'BC-NEUTRAL': 'p-c', CENTER: 'p-a',
  })) session = dispatchBattleEvent(session, { type: 'OBJECTIVE_CONTROL_CHANGED', payload: { objectiveId, controllerPlayerId } })

  for (let battleRound = 1; battleRound <= 5; battleRound += 1) {
    for (const playerId of ['p-a', 'p-b', 'p-c']) {
      expect(session.state.round).toBe(battleRound)
      expect(session.state.activePlayerId).toBe(playerId)
      expect(session.state.phase).toBe('COMMAND')
      for (const card of getSecondaryState(session)[playerId].active) {
        if (card.cardId === 'OFFICIAL_BEACON' && !card.cardSpecificState?.officialTargetUnitId) session = noteOfficialTarget(session, playerId, card.cardId, 'infantry')
        if (card.cardId === 'OFFICIAL_A_TEMPTING_TARGET' && !card.cardSpecificState?.officialTargetObjectiveId) session = noteOfficialTarget(session, playerId, card.cardId, officialTemptingTargets(session, playerId)[0])
        if (card.cardId === 'OFFICIAL_BURDEN_OF_TRUST') session = assignOfficialGuards(session, playerId, Object.fromEntries(Object.values(session.state.objectives).filter((objective) => objective.controllerPlayerId === playerId).map((objective) => [objective.id, 'infantry'])))
      }
      while (session.state.phase !== 'END_TURN') session = advanceCauldronPhase(session)
      const rivalPlayerId = getCurrentRivalPlayerId(session, playerId)
      session = dispatchBattleEvents(session, createPrimaryTurnCommitEvents(session, playerId, {
        officialPrimary: { rivalPlayerId, enemyUnitsDestroyedThisTurn: 2, friendlyUnitsDestroyedSinceLastTurn: 1 },
      }))
      const primary = getPrimaryTurnCommit(session, playerId)!
      expect(primary.review.official?.rivalPlayerId).toBe(rivalPlayerId)
      expect(primary.pointsAwarded).toBeLessThanOrEqual(15)
      expect(createPrimaryTurnCommitEvents(session, playerId)).toEqual([])

      for (const commanderId of session.state.turnOrder) {
        const cards = [...getSecondaryState(session)[commanderId].active]
        for (const card of cards) {
          const cardId = card.cardId as OfficialSecondaryId
          if (canScoreOfficialSecondary(session, commanderId, cardId)) {
            const confirmation = {
              ownUnitWithin3OfCenter: true,
              enemyCenterDistanceByPlayer: Object.fromEntries(session.state.turnOrder.filter((id) => id !== commanderId).map((id) => [id, 'outside-6' as const])),
              enemyInOwnDeploymentByPlayer: Object.fromEntries(session.state.turnOrder.filter((id) => id !== commanderId).map((id) => [id, false])),
              qualifyingNmlUnitsByPlayer: Object.fromEntries(session.state.turnOrder.map((id) => [id, id === commanderId ? 3 : 2])),
              beaconOutsideOwnDeployment: true, unitWhollyOutsideOwnTerritory: true,
              behindEnemyLinesUnitCount: 2, qualifyingQuarterCount: 4,
              outflankUnitNearEdge: true, outflankOppositeEdges: true,
              guardingObjectiveIdsInRange: Object.keys(card.cardSpecificState?.officialGuardAssignments ?? {}),
            }
            const awards = officialAwards(session, commanderId, cardId, confirmation)
            if (awards.length > 0) session = scoreOfficialSecondary(session, commanderId, cardId, awards.at(-1)!, confirmation)
          }
        }
      }
      const leftovers = getSecondaryState(session)[playerId].active.map((card) => card.cardId as OfficialSecondaryId)
      if (leftovers.length > 0) session = discardOfficialAtEndTurn(session, playerId, leftovers)
      for (const commanderId of officialPendingReviewPlayers(session)) session = acknowledgeOfficialWindow(session, commanderId)
      expect(officialPendingReviewPlayers(session)).toEqual([])
      for (const commanderId of session.state.turnOrder) {
        expect(getRoundSecondaryVp(session, commanderId)).toBeLessThanOrEqual(15)
        expect(session.state.players[commanderId].score.primary).toBeLessThanOrEqual(45)
        expect(session.state.players[commanderId].score.secondary).toBeLessThanOrEqual(45)
      }
      const saved = serializeBattleSession(session)
      session = deserializeBattleSession(saved)
      expect(getPrimaryTurnCommit(session, playerId)).toEqual(primary)
      session = isCauldronEndOfRound(session) ? confirmCauldronEndRound(session) : advanceCauldronPhase(session)
    }
  }
  expect(session.state.status).toBe('completed')
  expect(session.state.players['p-a'].score.primary).toBe(45)
  expect(session.state.players['p-b'].score.primary).toBe(45)
  expect(session.state.players['p-c'].score.primary).toBe(30)
  expect(getCauldronEventData(session, 'PRIMARY_TURN_COMMITTED')).toHaveLength(15)
  expect(getCauldronEventData(session, 'WYNISZCZENIE_COMMITTED')).toHaveLength(0)
  for (const playerId of session.state.turnOrder) {
    expect(session.state.players[playerId].score.secondary).toBeGreaterThan(0)
    expect(getSecondaryState(session)[playerId].active).toHaveLength(0)
  }
})

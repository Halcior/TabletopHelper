import { describe, expect, it } from 'vitest'
import { testArmy } from '../../rulesets/cauldronFFA3/cauldronTestUtils'
import { createCauldronGame } from '../../rulesets/cauldronFFA3/session'
import { dispatchBattleEvent } from './engine'
import { doublesObjectiveController, doublesScorekeeperId, doublesTeamMembers } from './doubles'
import { officialBoardDefinition } from '../battlefield/layouts'
import { getSecondaryState } from '../../rulesets/cauldronFFA3/secondary'
import { doublesSecondaryUnitChoices, startOfficialSecondaryAction } from '../../rulesets/cauldronFFA3/officialSecondary'
import { cauldronEvent } from '../../rulesets/cauldronFFA3/events'
import { getDuelMission } from '../../rulesets/cauldronFFA3/duelPrimary'
import type { DoublesSetup } from './types'
import { authorizeSharedMutation } from '../../multiplayer/sharedEventPolicy'
import type { SharedMembership } from '../../multiplayer/types'
import { getAvailableStratagems } from '../stratagems/timingEngine'
import type { StratagemDefinition } from '../stratagems/types'

const forces: DoublesSetup = {
  rulesVersion: 'GW-Doubles-1.0',
  forces: [
    { id: 'alpha', name: 'Alpha Force', memberPlayerIds: ['a', 'b'], captainPlayerId: 'a',
      forceDisposition: 'take-and-hold', forceType: 'convenience',
      warlord: { playerId: 'b', unitId: 'remainder' } },
    { id: 'bravo', name: 'Bravo Force', memberPlayerIds: ['c', 'd'], captainPlayerId: 'c',
      forceDisposition: 'purge-the-foe', forceType: 'convenience',
      warlord: { playerId: 'c', unitId: 'remainder' } },
  ],
}

function battle() {
  const armies = ['a', 'b', 'c', 'd'].map((id) => testArmy(`army-${id}`))
  return createCauldronGame({
    armies,
    mode: 'doubles2v2',
    doubles: forces,
    primaryDeck: 'chapter-approved-duel',
    secondaryDeck: 'chapter-approved',
    officialLayout: 2,
    guidanceLevel: 'fast',
    players: armies.map((army, index) => ({
      id: 'abcd'[index],
      name: `Commander ${index + 1}`,
      armyId: army.id,
      deploymentZone: index < 2 ? 'A' as const : 'B' as const,
      turnPosition: index < 2 ? 1 as const : 2 as const,
      operationalPlanId: 'WYNISZCZENIE' as const,
    })),
  })
}

describe('GW Doubles team foundation', () => {
  it('keeps four independent armies but exactly two team turns and two tactical decks', () => {
    const session = battle()
    expect(session.setup.players).toHaveLength(4)
    expect(Object.keys(session.state.players)).toHaveLength(4)
    expect(session.state.turnOrder).toEqual(['a', 'c'])
    expect(session.setup.doubles?.rulesVersion).toBe('GW-Doubles-1.0')
    expect(Object.keys(session.state.players.b.units)).toHaveLength(3)
    expect(doublesTeamMembers(session.setup, 'b')).toEqual(['a', 'b'])
    expect(doublesScorekeeperId(session.setup, 'b')).toBe('a')
    expect(getDuelMission(session, 'a').name).toBe('Immovable Object')
    expect(officialBoardDefinition(session.setup)?.variant).toBe('B')
    const secondaries = getSecondaryState(session)
    expect(secondaries.a.deck.length + secondaries.a.active.length + secondaries.a.discarded.length).toBe(18)
    expect(secondaries.c.deck.length + secondaries.c.active.length + secondaries.c.discarded.length).toBe(18)
    expect(secondaries.b.deck).toEqual([])
    expect(secondaries.d.deck).toEqual([])
  })

  it('routes both partners CP and VP to their one shared force score', () => {
    let session = battle()
    session = dispatchBattleEvent(session, { type: 'CP_GAINED', payload: { playerId: 'b', amount: 2 } })
    session = dispatchBattleEvent(session, { type: 'CP_SPENT', payload: { playerId: 'a', amount: 1 } })
    session = dispatchBattleEvent(session, { type: 'SCORE_ADJUSTED', payload: { playerId: 'b', category: 'primary', delta: 5 } })
    expect(session.state.players.a.cp).toBe(1)
    expect(session.state.players.b.cp).toBe(0)
    expect(session.state.players.a.score.primary).toBe(5)
    expect(session.state.players.b.score.primary).toBe(0)
  })

  it('sums both partner OC values and normalizes manual owner to the force', () => {
    let session = battle()
    session = dispatchBattleEvent(session, { type: 'OBJECTIVE_OC_CHANGED', payload: { objectiveId: 'CENTER-1', playerId: 'b', oc: 3 } })
    session = dispatchBattleEvent(session, { type: 'OBJECTIVE_OC_CHANGED', payload: { objectiveId: 'CENTER-1', playerId: 'c', oc: 2 } })
    expect(session.state.objectives['CENTER-1'].controllerPlayerId).toBe('a')
    session = dispatchBattleEvent(session, { type: 'OBJECTIVE_OC_CHANGED', payload: { objectiveId: 'CENTER-1', playerId: 'd', oc: 1 } })
    expect(session.state.objectives['CENTER-1'].controllerPlayerId).toBeNull()
    session = dispatchBattleEvent(session, { type: 'OBJECTIVE_CONTROL_CHANGED', payload: { objectiveId: 'CENTER-1', controllerPlayerId: 'd' } })
    expect(session.state.objectives['CENTER-1'].controllerPlayerId).toBe('c')
    expect(doublesObjectiveController(session.setup, session.state.objectives['CENTER-1'].playerOC)).toBeNull()
  })


  it('allows either partner to start a shared Cleanse while enforcing one target per force', () => {
    let session = battle()
    session = dispatchBattleEvent(session, cauldronEvent('SECONDARY_DRAWN', {
      playerId: 'a', cardId: 'OFFICIAL_CLEANSE', round: 1, turn: 1,
    }))
    session = dispatchBattleEvent(session, { type: 'PHASE_CHANGED', payload: { phase: 'SHOOTING' } })
    const options = doublesSecondaryUnitChoices(session, 'a')
    const partner = options.find((entry) => entry.playerId === 'b' && entry.unitId === 'tank')
    expect(partner).toBeDefined()
    expect(options.some((entry) => entry.playerId === 'c')).toBe(false)
    const neutral = 'CENTER-1'
    session = startOfficialSecondaryAction(session, 'a', 'OFFICIAL_CLEANSE', partner!.value, neutral)
    const action = [...session.state.events].reverse().find((event) => event.type === 'RULESET_EVENT' && event.payload.action === 'SECONDARY_OFFICIAL_ACTION_STARTED')
    expect(action && 'data' in action.payload && (action.payload.data as { unit?: string }).unit).toBe(partner!.value)
    expect(() => startOfficialSecondaryAction(session, 'a', 'OFFICIAL_CLEANSE', options.find((entry) => entry.playerId === 'a')!.value, neutral)).toThrow(/different objective/)
    expect(() => startOfficialSecondaryAction(session, 'a', 'OFFICIAL_CLEANSE', JSON.stringify(['c', 'tank']), 'CENTER-2')).toThrow(/eligible unit/)
  })


  it('authorizes both allied phones for shared turn and CP, without granting access to teammate units', () => {
    const before = battle()
    const seat = (playerId: string): SharedMembership => ({
      roomId: 'room-test', roomCode: 'TEAM24', battleId: before.setup.gameId,
      clientId: `client-${playerId}`, playerId, isHost: false,
    })
    const teamTurn = dispatchBattleEvent(before, { type: 'PHASE_CHANGED', payload: { phase: 'MOVEMENT' } }, { actorPlayerId: 'b' })
    expect(authorizeSharedMutation(before, teamTurn, seat('b')).allowed).toBe(true)
    expect(authorizeSharedMutation(before, teamTurn, seat('d')).allowed).toBe(false)
    const sharedCp = dispatchBattleEvent(before, { type: 'CP_GAINED', payload: { playerId: 'a', amount: 1 } }, { actorPlayerId: 'b' })
    expect(authorizeSharedMutation(before, sharedCp, seat('b')).allowed).toBe(true)
    const teammateDamage = dispatchBattleEvent(before, { type: 'UNIT_MODEL_DESTROYED', payload: { playerId: 'a', unitId: 'infantry', amount: 1 } }, { actorPlayerId: 'b' })
    expect(authorizeSharedMutation(before, teammateDamage, seat('b')).allowed).toBe(false)
    const enemyDamage = dispatchBattleEvent(before, { type: 'UNIT_MODEL_DESTROYED', payload: { playerId: 'd', unitId: 'infantry', amount: 1, destroyedByPlayerId: 'b' } }, { actorPlayerId: 'b' })
    expect(authorizeSharedMutation(before, enemyDamage, seat('b')).allowed).toBe(true)
  })


  it('enforces shared team CP and once-per-phase Stratagem usage across teammates', () => {
    let session = battle()
    session = dispatchBattleEvent(session, { type: 'CP_GAINED', payload: { playerId: 'b', amount: 2 } })
    const definition: StratagemDefinition = {
      id: 'test-team-stratagem', name: 'Team test', kind: 'STRATAGEM', cpCost: 1,
      description: 'Test a single shared resource and usage limit.', ownerScope: 'ACTIVE_PLAYER',
      phases: ['ANY'], triggers: ['PHASE_START'], reaction: false,
      usageLimits: ['ONCE_PER_PHASE'], source: 'Test',
    }
    const available = (playerId: string) => getAvailableStratagems({
      playerId, gameState: session.state, trigger: 'PHASE_START', definitions: [definition],
    })[0]
    expect(available('a').canUse).toBe(true)
    expect(available('b').canUse).toBe(true)
    expect(available('c')).toBeUndefined()
    session = dispatchBattleEvent(session, { type: 'STRATAGEM_USED', payload: {
      playerId: 'b', stratagemId: definition.id, stratagemName: definition.name, cpCost: 1,
    } })
    expect(available('a').canUse).toBe(false)
    expect(available('b').canUse).toBe(false)
    expect(session.state.timing.stratagemUsage['a::test-team-stratagem']?.usedThisPhase).toBe(1)
  })

  it('rejects malformed team memberships instead of silently creating extra turns', () => {
    const invalid = structuredClone(forces)
    invalid.forces[1].memberPlayerIds = ['b', 'd']
    expect(() => createCauldronGame({
      mode: 'doubles2v2', doubles: invalid, armies: ['a','b','c','d'].map((id) => testArmy(`army-${id}`)),
      primaryDeck: 'chapter-approved-duel', secondaryDeck: 'chapter-approved', guidanceLevel: 'fast',
      players: ['a','b','c','d'].map((id, index) => ({
        id, name: id, armyId: `army-${id}`, deploymentZone: index < 2 ? 'A' as const : 'B' as const,
        turnPosition: index < 2 ? 1 as const : 2 as const, operationalPlanId: 'WYNISZCZENIE' as const,
      })),
    })).toThrow(/Doubles force|exactly one force/)
  })
})

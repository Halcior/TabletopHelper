import { describe, expect, it } from 'vitest'
import { dispatchBattleEvent } from '../battle/engine'
import { advanceCauldronPhase } from '../../rulesets/cauldronFFA3'
import { testCauldronGame } from '../../rulesets/cauldronFFA3/cauldronTestUtils'
import { selectCurrentTimingCheckpoint } from './timingContext'

describe('current timing checkpoint', () => {
  it('treats the freshly entered phase as PHASE_START', () => {
    const command = testCauldronGame()
    expect(selectCurrentTimingCheckpoint(command)?.triggers).toEqual(['PHASE_START'])

    const movement = advanceCauldronPhase(command)
    expect(selectCurrentTimingCheckpoint(movement)?.triggers).toEqual(['PHASE_START'])
  })

  it('keeps Command phase start timing while recording the mandatory CP gain', () => {
    const session = dispatchBattleEvent(testCauldronGame(), {
      type: 'CP_GAINED',
      payload: { playerId: 'p-a', amount: 1 },
    }, { actorPlayerId: 'p-a' })

    expect(selectCurrentTimingCheckpoint(session)?.triggers).toEqual(['PHASE_START'])
  })

  it('uses objective control as an exact persisted timing checkpoint', () => {
    const session = dispatchBattleEvent(advanceCauldronPhase(testCauldronGame()), {
      type: 'OBJECTIVE_CONTROL_CHANGED',
      payload: { objectiveId: 'N1', controllerPlayerId: 'p-a' },
    }, { actorPlayerId: 'p-a' })
    const checkpoint = selectCurrentTimingCheckpoint(session)

    expect(checkpoint?.triggers).toEqual(['OBJECTIVE_CONTROL_CHANGED'])
    expect(checkpoint?.context).toMatchObject({ objectiveId: 'N1', actingPlayerId: 'p-a' })
  })

  it('distinguishes a lost model from a destroyed unit and exposes the triggering subject', () => {
    let session = advanceCauldronPhase(testCauldronGame())
    session = dispatchBattleEvent(session, {
      type: 'UNIT_MODEL_DESTROYED',
      payload: { playerId: 'p-b', unitId: 'infantry', amount: 1, destroyedByPlayerId: 'p-a' },
    }, { actorPlayerId: 'p-b' })
    let checkpoint = selectCurrentTimingCheckpoint(session)

    expect(checkpoint?.triggers).toEqual(['MODEL_DESTROYED'])
    expect(checkpoint?.context).toMatchObject({
      actingPlayerId: 'p-a',
      triggerSubjectPlayerId: 'p-b',
      triggerSubjectUnitId: 'infantry',
      targetKeywords: [],
    })

    session = dispatchBattleEvent(session, {
      type: 'UNIT_DESTROYED',
      payload: { playerId: 'p-b', unitId: 'infantry', destroyedByPlayerId: 'p-a' },
    }, { actorPlayerId: 'p-b' })
    checkpoint = selectCurrentTimingCheckpoint(session)
    expect(checkpoint?.triggers).toEqual(['MODEL_DESTROYED', 'UNIT_DESTROYED'])
  })

  it('records a failed battle-shock test when the physical state becomes Battle-shocked', () => {
    const session = dispatchBattleEvent(advanceCauldronPhase(testCauldronGame()), {
      type: 'UNIT_BATTLESHOCK_CHANGED',
      payload: { playerId: 'p-b', unitId: 'infantry', battleShocked: true },
    }, { actorPlayerId: 'p-b' })

    expect(selectCurrentTimingCheckpoint(session)?.triggers).toEqual([
      'BATTLESHOCK_RESOLVED',
      'BATTLESHOCK_FAILED',
    ])
  })

  it('does not misread clearing Battle-shock as a passed test', () => {
    let session = dispatchBattleEvent(advanceCauldronPhase(testCauldronGame()), {
      type: 'UNIT_BATTLESHOCK_CHANGED',
      payload: { playerId: 'p-b', unitId: 'infantry', battleShocked: true },
    }, { actorPlayerId: 'p-b' })
    session = dispatchBattleEvent(session, {
      type: 'UNIT_BATTLESHOCK_CHANGED',
      payload: { playerId: 'p-b', unitId: 'infantry', battleShocked: false },
    }, { actorPlayerId: 'p-b' })

    expect(selectCurrentTimingCheckpoint(session)).toBeNull()
  })

  it('does not keep claiming phase-start timing after an unrelated recorded action', () => {
    const session = dispatchBattleEvent(advanceCauldronPhase(testCauldronGame()), {
      type: 'SCORE_ADJUSTED',
      payload: { playerId: 'p-a', category: 'adjustment', delta: 1 },
    }, { actorPlayerId: 'p-a' })

    expect(selectCurrentTimingCheckpoint(session)).toBeNull()
  })
})

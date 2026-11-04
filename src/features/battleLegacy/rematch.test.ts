import { expect, it } from 'vitest'
import { testCauldronGame } from '../../rulesets/cauldronFFA3/cauldronTestUtils'
import { dispatchBattleEvent, completeBattle } from '../../domain/battle/engine'
import { rematchPreset, freshPresetBattle, rosterDifference } from './rematch'
import { createBattleClock, clockConfig, commandClock } from '../battleClock/model'

it('copies setup and rosters but no old CP, VP, damage, cards, events, positions or clock budget', () => {
 let source = testCauldronGame()
 source.setup.battleClock = clockConfig('casual')
 source.battleClock = commandClock(createBattleClock(source.setup, source.setup.battleClock, 1000)!, { type: 'resume' }, 1000)
 source = dispatchBattleEvent(source, { type: 'SCORE_ADJUSTED', payload: { playerId: 'p-a', category: 'adjustment', delta: 60 } })
 source = dispatchBattleEvent(source, { type: 'CP_GAINED', payload: { playerId: 'p-a', amount: 8 } })
 source = dispatchBattleEvent(source, { type: 'UNIT_DESTROYED', payload: { playerId: 'p-b', unitId: 'tank' } })
 source = completeBattle(source)
 const old = JSON.stringify(source)
 const preset = rematchPreset(source, 'guest')
 expect(preset).not.toHaveProperty('state'); expect(preset.input).not.toHaveProperty('secondaryDeckOrders')
 const next = freshPresetBattle(preset, 3000), second = freshPresetBattle(preset, 3000)
 expect(next.setup.gameId).not.toBe(source.setup.gameId); expect(next.setup.gameId).not.toBe(second.setup.gameId)
 expect(next.state.status).toBe('active'); expect(next.state.round).toBe(1)
 expect(next.state.players['p-a'].score.adjustment).toBe(0); expect(next.state.players['p-a'].cp).toBe(0)
 expect(next.state.players['p-b'].units.tank.destroyed).toBe(false); expect(next.state.unitTracking).toBeUndefined()
 expect(next.state.events.every(event => !source.state.events.some(old => old.id === event.id))).toBe(true)
 expect(next.battleClock).toMatchObject({ running: false, startedAt: null, revision: 0 })
 expect(next.battleClock?.budgets.every(b => b.usedMs === 0 && b.manualPasses === 0)).toBe(true)
 expect(JSON.stringify(source)).toBe(old)
 expect(next.setup.armies[next.setup.players[0].armyId!].units).toEqual(source.setup.armies[source.setup.players[0].armyId!].units)
})
it('detects deleted and changed rosters without substituting them silently', () => {
 const preset = rematchPreset(testCauldronGame(), 'guest'), saved = preset.input.armies[0]
 expect(rosterDifference(saved)).toMatch(/missing/)
 expect(rosterDifference(saved, { ...saved, id: 'different' })).toMatch(/unchanged/)
 expect(rosterDifference(saved, { ...saved, totalPoints: 999 })).toMatch(/changed/)
})

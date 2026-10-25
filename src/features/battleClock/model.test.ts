import { describe, expect, it } from 'vitest'
import { advancePhase, createBattleSession, deserializeBattleSession, serializeBattleSession } from '../../domain/battle/engine'
import { buildBattleReport, battleReportMarkdown } from '../../domain/battle/battleReport'
import { buildBattleChronicle } from '../../domain/battle/chronicle'
import { withClockSnapshot, clockConfig, clockWarning, commandClock, createBattleClock, formatClock, projectClock, reconcileClock, timeStatistics } from './model'
import type { BattleSession } from '../../domain/battle/types'

function battle(count = 2): BattleSession {
  const s = createBattleSession({ rulesetId:'core', players:Array.from({length:count}, (_,i) => ({id:`p${i}`,name:`Commander ${i}`})) })
  s.setup.battleClock = clockConfig('custom', 1)
  s.battleClock = createBattleClock(s.setup, s.setup.battleClock, 1000)
  return s
}

describe('Battle Clock 2.0', () => {
  it('does not alter the frozen setup or events of a disabled shared game', () => {
    const s = battle(); delete s.setup.battleClock; delete s.battleClock
    const restored = withClockSnapshot(s, {config:clockConfig('off'),clock:null,serverNow:1000,applied:true})
    expect(restored.setup).toEqual(s.setup)
    expect('battleClock' in restored.setup).toBe(false)
    expect(restored.state.events).toBe(s.state.events)
  })
  it('keeps the clock optional and validates custom budgets', () => {
    const s = battle()
    expect(createBattleClock(s.setup,clockConfig('off'),1000)).toBeUndefined()
    expect(clockConfig('casual').limitMs).toBe(7_200_000)
    expect(clockConfig('competitive').limitMs).toBe(5_400_000)
    for (const value of [0, -1, NaN, Infinity, 10081]) expect(() => clockConfig('custom',value)).toThrow()
    expect(clockConfig('custom',1/60).limitMs).toBe(1000)
  })
  it('plays exactly five full 1v1 rounds using the real turn engine, without tick writes or log noise', () => {
    let s = battle(), now = 1000
    s.battleClock = commandClock(s.battleClock!,{type:'resume'},now)
    for (let i=0;i<60;i++) {
      now += 1000
      const next = advancePhase(s)
      s = {...next, battleClock:reconcileClock(s.battleClock,next,now)}
    }
    expect(s.state.status).toBe('completed')
    expect(s.state.events.filter(e=>e.type==='TURN_STARTED')).toHaveLength(10)
    const stats = timeStatistics(s.battleClock,now+100_000)
    expect(stats.map(b=>b.usedMs)).toEqual([30000,30000])
    for (const b of stats) expect(b.rounds).toEqual({1:6000,2:6000,3:6000,4:6000,5:6000})
    expect(s.battleClock?.running).toBe(false)
    expect(buildBattleChronicle(s).some(e=>/clock/i.test(e.description))).toBe(false)
    expect(buildBattleReport(s).timeStatistics).toEqual(stats)
    expect(battleReportMarkdown(buildBattleReport(s))).toContain('## Time Statistics')
  })
  it('passes for Overwatch independently of the turn, survives phase changes and resets for the next turn', () => {
    let s = battle()
    s.battleClock=commandClock(s.battleClock!,{type:'resume'},1000)
    s.battleClock=commandClock(s.battleClock,{type:'pass',targetId:'p1'},2000)
    expect(s.state.activePlayerId).toBe('p0')
    for (let i=0;i<5;i++) {
      const next=advancePhase(s)
      s={...next,battleClock:reconcileClock(s.battleClock,next,3000+i*1000)}
      expect(s.battleClock!.activeBudgetId).toBe('p1')
    }
    // Hand it back before the turn boundary; next turn still selects p1.
    s.battleClock=commandClock(s.battleClock!,{type:'pass',targetId:'p0'},8000)
    const next=advancePhase(s)
    s={...next,battleClock:reconcileClock(s.battleClock,next,9000)}
    expect(s.state.activePlayerId).toBe('p1')
    expect(s.battleClock!.activeBudgetId).toBe('p1')
    expect(timeStatistics(s.battleClock,10000).map(b=>b.usedMs)).toEqual([2000,7000])
  })
  it('supports repeated Fight handoffs, ignoring self and invalid targets', () => {
    let clock = commandClock(battle().battleClock!,{type:'resume'},1000)
    for(let i=1;i<=8;i++) clock=commandClock(clock,{type:'pass',targetId:i%2?'p1':'p0'},1000+i*1000)
    expect(timeStatistics(clock,10000).map(b=>b.usedMs)).toEqual([5000,4000])
    expect(clock.budgets.map(b=>b.manualPasses)).toEqual([4,4])
    expect(commandClock(clock,{type:'pass',targetId:'p0'},11000)).toBe(clock)
    expect(commandClock(clock,{type:'pass',targetId:'stranger'},11000)).toBe(clock)
  })
  it('supports explicit FFA targets and independent budgets', () => {
    let clock=commandClock(battle(3).battleClock!,{type:'resume'},1000)
    clock=commandClock(clock,{type:'pass',targetId:'p2'},2000)
    clock=commandClock(clock,{type:'pass',targetId:'p1'},5000)
    expect(timeStatistics(clock,10000).map(b=>b.usedMs)).toEqual([1000,5000,3000])
  })
  it('shares one budget between team members without an allied handoff', () => {
    const s=battle(4)
    s.setup.doubles={rulesVersion:'GW-Doubles-1.0',forces:[
      {id:'alpha',name:'Alpha',memberPlayerIds:['p0','p1'],captainPlayerId:'p0',forceType:'unified',forceDisposition:'take-and-hold',warlord:{playerId:'p0',unitId:'x'}},
      {id:'bravo',name:'Bravo',memberPlayerIds:['p2','p3'],captainPlayerId:'p2',forceType:'unified',forceDisposition:'purge-the-foe',warlord:{playerId:'p2',unitId:'y'}},
    ]}
    const clock=commandClock(createBattleClock(s.setup,clockConfig('casual'),1000)!,{type:'resume'},1000)
    expect(clock.budgets).toHaveLength(2)
    const next={...s,state:{...s.state,activePlayerId:'p1'}}
    expect(reconcileClock(clock,next,2000)).toBe(clock)
    expect(reconcileClock(clock,{...next,state:{...next.state,activePlayerId:'p2'}},3000)?.activeBudgetId).toBe('bravo')
  })
  it('pauses, resumes, reloads and reconnects without losing or duplicating elapsed time', () => {
    const s=battle()
    let clock=commandClock(s.battleClock!,{type:'resume'},1000)
    clock=commandClock(clock,{type:'pause'},6000)
    expect(timeStatistics(clock,100000)[0].usedMs).toBe(5000)
    clock=commandClock(clock,{type:'resume'},100000)
    s.battleClock=clock
    const restored=deserializeBattleSession(serializeBattleSession(s))
    expect(restored.battleClock).toEqual(clock)
    expect(timeStatistics(restored.battleClock,105000)[0].usedMs).toBe(10000)
    expect(timeStatistics(restored.battleClock,105000)[0].usedMs).toBe(10000)
    expect(projectClock(clock,500).budgets[0].usedMs).toBe(5000)
  })
  it('records overtime without changing game status or blocking actions', () => {
    const s=battle(); s.battleClock=commandClock(s.battleClock!,{type:'resume'},1000)
    const stats=timeStatistics(s.battleClock,92000)
    expect(stats[0].remainingMs).toBe(0)
    expect(stats[0].overtimeMs).toBe(31000)
    expect(advancePhase(s).state.phase).toBe('MOVEMENT')
    expect(clockWarning(900000)).toBe('quarter')
    expect(clockWarning(300000)).toBe('five')
    expect(clockWarning(60000)).toBe('one')
    expect(clockWarning(0)).toBe('expired')
    expect(formatClock(7200000)).toBe('2:00:00')
  })
})

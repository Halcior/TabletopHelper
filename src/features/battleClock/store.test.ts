import 'fake-indexeddb/auto'
import * as databaseApi from '../../persistence/database'
import type { BattleSession } from '../../domain/battle/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBattleSession } from '../../domain/battle/engine'
import { useBattleStore } from '../../stores/battleStore'
import { setSharedRuntimeMembership } from '../../multiplayer/sharedRuntime'
import { clockConfig, createBattleClock, timeStatistics } from './model'
import { getBattle } from '../../persistence/database'

beforeEach(() => {
  setSharedRuntimeMembership(null)
  const session = createBattleSession({rulesetId:'core',players:[{id:'a',name:'A'},{id:'b',name:'B'}]})
  session.setup.battleClock=clockConfig('competitive')
  session.battleClock=createBattleClock(session.setup,session.setup.battleClock,1000)
  useBattleStore.setState({session,error:null})
})
afterEach(()=>{vi.restoreAllMocks();setSharedRuntimeMembership(null)})

describe('clock integration in the existing battle store',()=>{
  it('preserves manual clock ownership across phase actions and switches on the real next turn',()=>{
    const now=vi.spyOn(Date,'now').mockReturnValue(1000)
    useBattleStore.getState().clockCommand({type:'resume'})
    now.mockReturnValue(2000)
    useBattleStore.getState().clockCommand({type:'pass',targetId:'b'})
    useBattleStore.getState().nextPhase()
    expect(useBattleStore.getState().session?.battleClock?.activeBudgetId).toBe('b')
    expect(useBattleStore.getState().session?.state.activePlayerId).toBe('a')
    now.mockReturnValue(3000)
    useBattleStore.getState().clockCommand({type:'pass',targetId:'a'})
    for(let i=0;i<5;i++) useBattleStore.getState().nextPhase()
    expect(useBattleStore.getState().session?.state.activePlayerId).toBe('b')
    expect(useBattleStore.getState().session?.battleClock?.activeBudgetId).toBe('b')
  })
  it('settles and durably saves final statistics without adding clock events',async()=>{
    const now=vi.spyOn(Date,'now').mockReturnValue(1000)
    useBattleStore.getState().clockCommand({type:'resume'})
    const count=useBattleStore.getState().session!.state.events.length
    now.mockReturnValue(11000)
    useBattleStore.getState().endBattle()
    const session=useBattleStore.getState().session!
    expect(session.state.events).toHaveLength(count+1)
    expect(session.battleClock?.endedAt).toBe(11000)
    expect(timeStatistics(session.battleClock,100000)[0].usedMs).toBe(10000)
    await vi.waitFor(async()=>expect((await getBattle(session.setup.gameId))?.battleClock).toEqual(session.battleClock))
  })
  it('keeps the restored server snapshot if it wins a race with an older disk load', async () => {
    const restored=createBattleSession({gameId:'restored-shared-clock',rulesetId:'core',players:[{id:'a',name:'Restored commander'},{id:'b',name:'B'}]})
    const stale={...restored,setup:{...restored.setup,players:[{id:'a',name:'Provisional commander'},{id:'b',name:'B'}]}}
    let resolveStored!: (session:BattleSession) => void
    vi.spyOn(databaseApi,'getBattle').mockImplementationOnce(()=>new Promise(resolve=>{resolveStored=resolve}))
    const loading=useBattleStore.getState().loadBattle(restored.setup.gameId)
    useBattleStore.setState({session:restored})
    resolveStored(stale)
    await loading
    expect(useBattleStore.getState().session).toBe(restored)
    expect(useBattleStore.getState().loading).toBe(false)
  })
  it('never accepts a local command as authority for an online battle',()=>{
    const session=useBattleStore.getState().session!
    setSharedRuntimeMembership({battleId:session.setup.gameId,roomCode:'ABC234',roomId:'room',clientId:'client',playerId:'a',isHost:true})
    useBattleStore.getState().clockCommand({type:'resume'})
    expect(useBattleStore.getState().session!.battleClock).toBe(session.battleClock)
    expect(session.battleClock?.running).toBe(false)
  })
})

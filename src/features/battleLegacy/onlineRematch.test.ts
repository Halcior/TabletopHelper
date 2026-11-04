import { expect, it, vi } from 'vitest'
import { useSharedSessionStore } from '../../multiplayer/sharedSessionStore'
import { configureRematchClock } from './onlineRematch'
import { clockConfig } from '../battleClock/model'
it('waits for the initial connected clock snapshot and configures exactly once', async () => {
 const before=useSharedSessionStore.getState(), command=vi.fn(async()=>true)
 const membership={roomId:'room',roomCode:'ABCD',clientId:'client',battleId:'new',playerId:'a',isHost:true}
 try {
  useSharedSessionStore.setState({membership,connectionStatus:'connecting',clockSnapshot:null,clockCommand:command})
  const waiting=configureRematchClock(membership,clockConfig('casual'))
  expect(command).not.toHaveBeenCalled()
  useSharedSessionStore.setState({connectionStatus:'connected',clockSnapshot:{config:clockConfig('off'),clock:null,serverNow:1000,applied:true}})
  await waiting;expect(command).toHaveBeenCalledTimes(1)
 } finally {useSharedSessionStore.setState(before)}
})
it('refuses to configure a replacement room', async()=>{
 const before=useSharedSessionStore.getState(),command=vi.fn(async()=>true)
 const membership={roomId:'room',roomCode:'ABCD',clientId:'client',battleId:'new',playerId:'a',isHost:true}
 try {
  useSharedSessionStore.setState({membership,connectionStatus:'connecting',clockSnapshot:null,clockCommand:command})
  const waiting=configureRematchClock(membership,clockConfig('casual'))
  useSharedSessionStore.setState({membership:{...membership,roomId:'replacement'}})
  await expect(waiting).rejects.toThrow(/changed/);expect(command).not.toHaveBeenCalled()
 } finally {useSharedSessionStore.setState(before)}
})

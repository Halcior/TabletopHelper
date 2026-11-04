import { useSharedSessionStore } from '../../multiplayer/sharedSessionStore'
import type { SharedMembership } from '../../multiplayer/types'
import type { ClockConfig } from '../battleClock/model'

/** Hosting returns before the first clock-bearing poll. Bind the wait to this room/seat. */
export async function configureRematchClock(membership: SharedMembership, config: ClockConfig, timeoutMs = 12000) {
 await new Promise<void>((resolve, reject) => {
  let unsubscribe = () => {}
  const finish = (error?: Error) => { clearTimeout(timer); unsubscribe(); error ? reject(error) : resolve() }
  const check = () => {
   const state = useSharedSessionStore.getState()
   if (state.membership?.roomId !== membership.roomId || state.membership.clientId !== membership.clientId) return finish(new Error('The waiting room changed.'))
   if (state.connectionStatus === 'offline' || state.connectionStatus === 'error') return finish(new Error('Review the clock in the waiting room.'))
   if (state.connectionStatus === 'connected' && state.clockSnapshot) finish()
  }
  const timer = setTimeout(() => finish(new Error('Review the clock in the waiting room.')), timeoutMs)
  unsubscribe = useSharedSessionStore.subscribe(check)
  check()
 })
 if (!await useSharedSessionStore.getState().clockCommand({ type:'configure', config })) throw new Error('Review the clock in the waiting room.')
}

import { useEffect, useState } from 'react'
import { countOnlineSeats } from '../../multiplayer/presence'
import { useSharedSessionStore } from '../../multiplayer/sharedSessionStore'
import { useBattleStore } from '../../stores/battleStore'

export function useSharedPresence(battleId: string) {
  const [now, setNow] = useState(Date.now)
  const membership = useSharedSessionStore(state => state.membership)
  const participants = useSharedSessionStore(state => state.participants)
  const room = useSharedSessionStore(state => state.inspection?.room)
  const battleSetup = useBattleStore(state => state.session?.setup)
  useEffect(() => {
    if (membership?.battleId !== battleId) return
    const timer = window.setInterval(() => setNow(Date.now()), 2_000)
    return () => window.clearInterval(timer)
  }, [battleId, membership?.battleId])

  const setup = battleSetup?.gameId === battleId ? battleSetup : room?.battleId === battleId ? room.sessionSnapshot.setup : undefined
  const playerIds = setup?.players.map(player => player.id) ?? []
  return { onlineCount: countOnlineSeats(playerIds, participants, now), seatCount: playerIds.length, now }
}

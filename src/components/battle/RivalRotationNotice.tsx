import { useEffect, useRef, useState } from 'react'
import type { BattleSession } from '../../domain/battle/types'
import { getCurrentRivalPlayerId } from '../../rulesets/cauldronFFA3/rivalRotation'
import { rivalIdentity } from './rivalPresentation'
import './rivalClarity.css'

/** Only an appended round transition can produce feedback, never restore/undo. */
export function rivalRotationChange(previous: BattleSession, current: BattleSession, playerId: string) {
  if (previous.setup.gameId !== current.setup.gameId || current.state.round <= previous.state.round) return undefined
  if (!previous.state.events.every((event, index) => current.state.events[index]?.id === event.id)) return undefined
  const event = current.state.events.slice(previous.state.events.length).reverse().find((entry) => entry.type === 'ROUND_STARTED' && entry.payload.round === current.state.round)
  if (!event || getCurrentRivalPlayerId(previous, playerId) === getCurrentRivalPlayerId(current, playerId)) return undefined
  return { gameId: current.setup.gameId, eventId: event.id, round: current.state.round, playerId, rivalId: getCurrentRivalPlayerId(current, playerId) }
}

export function RivalRotationNotice({ session, playerId }: { session: BattleSession; playerId: string }) {
  const previous = useRef(session)
  const seen = useRef(new Set<string>())
  const [notice, setNotice] = useState<ReturnType<typeof rivalRotationChange>>()
  useEffect(() => {
    const change = rivalRotationChange(previous.current, session, playerId)
    previous.current = session
    if (!change) return
    const key = `ffa-rival-rotation:${session.setup.gameId}:${playerId}:${change.eventId}`
    if (seen.current.has(key)) return
    seen.current.add(key)
    // Storage may be unavailable in private/offline browsers; the mount baseline
    // and in-memory set still keep refresh and ordinary rerenders quiet.
    try {
      if (window.sessionStorage.getItem(key)) return
      window.sessionStorage.setItem(key, 'seen')
    } catch { /* feedback is optional */ }
    setNotice(change)
  }, [session, playerId])
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(undefined), 15_000)
    return () => window.clearTimeout(timer)
  }, [notice])
  if (!notice || notice.gameId !== session.setup.gameId || notice.playerId !== playerId || notice.round !== session.state.round) return null
  return <aside className="rival-rotation" role="status" aria-label="Rival rotation">
    <span className="eyebrow">Rival rotation — Round {notice.round}</span>
    <p>Your Current Rival is now {rivalIdentity(session, notice.rivalId)}. Previously drawn Secondary cards retain their assigned targets.</p>
  </aside>
}

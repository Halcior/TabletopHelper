import { useEffect, useState } from 'react'
import { useSharedSessionStore } from '../../multiplayer/sharedSessionStore'
import { ClockSettings } from './ClockSettings'
import { clockCopy } from './copy'
import { OFF_CLOCK, type ClockConfig } from './model'
import './battleClock.css'

export function LobbyClockSettings() {
  const { membership, roomStartedAt, clockSnapshot, clockCommand, forceSync } = useSharedSessionStore()
  const [config, setConfig] = useState<ClockConfig>(OFF_CLOCK)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const c = clockCopy()
  useEffect(() => { if (clockSnapshot) setConfig(clockSnapshot.config) }, [clockSnapshot?.config.preset, clockSnapshot?.config.limitMs, membership?.roomId])
  if (!membership || roomStartedAt) return null
  async function save() {
    if (busy) return
    setBusy(true); setMessage('')
    try {
      await clockCommand({ type:'configure', config })
      await forceSync()
      setMessage(c.saved)
    } catch (error) { setMessage(error instanceof Error ? error.message : c.error) }
    finally { setBusy(false) }
  }
  return <section className="panel" aria-label="Lobby Battle Clock" lang="pl">
    <form onSubmit={event => { event.preventDefault(); void save() }}>
    <ClockSettings value={config} onChange={setConfig} disabled={!membership.isHost || busy || !clockSnapshot} />
    {membership.isHost ? <button type="submit" className="button button--gold" disabled={busy || !clockSnapshot}>{busy ? c.saving : c.save}</button> : <small>{c.hostOnly}</small>}
    </form>
    {message && <p role="status">{message}</p>}
  </section>
}

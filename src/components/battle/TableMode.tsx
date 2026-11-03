import { t as tr } from '../../features/i18n/locale'
import { totalScore } from '../../domain/battle/selectors'
import { useEffect, useRef, useState } from 'react'
import type { BattleSession } from '../../domain/battle/types'
import { buildBattleChronicle } from '../../domain/battle/chronicle'
import { doublesForceForPlayer } from '../../domain/battle/doubles'
import { useSharedSessionStore } from '../../multiplayer/sharedSessionStore'
import { formatClock, timeStatistics } from '../../features/battleClock/model'
import { clockCopy } from '../../features/battleClock/copy'
import { t } from '../../features/i18n/locale'
import { BattlefieldBoard } from './BattlefieldBoard'
import { PlayerFactionMarks } from '../../features/factionVisuals/components'
import './tableMode.css'

/** Explicit public allowlist: no free-text notes, card hands or pending choices. */
export function publicTableEvents(session: BattleSession) {
  return buildBattleChronicle(session).filter(entry => entry.highlight
    && ['kills', 'combat', 'objectives', 'flow'].includes(entry.category))
    .slice(-6).reverse().map(({ id, round, description }) => ({ id, round, description }))
}

export function TableMode({ session, onClose }: { session: BattleSession; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  const { membership, clockAnchor, connectionStatus } = useSharedSessionStore()
  const shared = membership?.battleId === session.setup.gameId
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const update = () => setNow(shared && clockAnchor
      ? clockAnchor.serverNow + performance.now() - clockAnchor.monotonicAt : Date.now())
    update()
    const timer = setInterval(update, 250)
    return () => clearInterval(timer)
  }, [shared, clockAnchor])
  const stale = shared && (connectionStatus !== 'connected' || !clockAnchor || performance.now() - clockAnchor.monotonicAt > 5000)
  const rows = timeStatistics(session.battleClock, now)
  const players = session.setup.players.filter(player => !session.setup.doubles || session.state.turnOrder.includes(player.id))
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await root.current?.requestFullscreen()
      setError('')
    } catch { setError(t('Fullscreen is unavailable in this browser.')) }
  }
  return <div className="table-mode" ref={root} aria-label={t('Table Mode · read only')}>
    <header className="table-mode__header"><div><span className="eyebrow">{t('Table Mode')} · {t('Read only')}</span>
      <h1>{t('Round')} {session.state.round} / {session.state.maxRounds} · {t(session.state.phase.replace('_', ' '))}</h1>
      <p>{session.state.status === 'active' ? <>{t('Active')}: <strong>{session.state.players[session.state.activePlayerId]?.name}</strong></> : t(session.state.status === 'completed' ? 'Battle complete' : 'Battle abandoned')}</p>
    </div><div className="table-mode__actions"><button onClick={() => void fullscreen()}>{t('Fullscreen')}</button><button className="button--gold" onClick={onClose}>{t('Back to battle')}</button></div></header>
    {error && <p role="status">{tr(error)}</p>}
    <section className="table-mode__scores" aria-label={t('Public scores')}>{players.map(player => {
      const state = session.state.players[player.id]
      return <article key={player.id} className={player.id === session.state.activePlayerId ? 'is-active' : ''}>
        <h2><PlayerFactionMarks session={session} playerId={player.id} />{doublesForceForPlayer(session.setup, player.id)?.name ?? player.name}</h2>
        <div><strong>{totalScore(state)} <small>{tr("VP")}</small></strong><span>{state.cp} {tr(" CP")}</span></div>
      </article>
    })}</section>
    {rows.length > 0 && <section className="table-mode__clocks" aria-label={t('Battle Clock')}><span>{tr(clockCopy().title)} · {session.battleClock?.running ? clockCopy().running : clockCopy().paused}</span>
      {rows.map(row => <p key={row.id} className={row.id === session.battleClock?.activeBudgetId ? 'is-active' : ''}><strong>{row.name}</strong><time>{formatClock(row.remainingMs)}</time></p>)}
      {stale && <small role="status">{clockCopy().offline}</small>}
    </section>}
    <div className="table-mode__body"><section className="table-mode__board" aria-label={t('Battlefield overview')}><BattlefieldBoard session={session} dispatch={() => {}} readOnly /></section>
      <aside className="table-mode__events"><h2>{t('Public events')}</h2>{publicTableEvents(session).map(entry => <p key={entry.id}><small>{t('Round')} {entry.round}</small>{t(entry.description)}</p>)}
        {publicTableEvents(session).length === 0 && <p>{t('No public highlights yet.')}</p>}
      </aside></div>
  </div>
}

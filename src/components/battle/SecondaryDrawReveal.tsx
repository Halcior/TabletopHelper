import { useEffect, useMemo, useState } from 'react'
import { getPlayerTurnNumber } from '../../domain/battle/missionActions'
import type { BattleSession } from '../../domain/battle/types'
import { getActiveSecondaryViews, getSecondaryState, isMulliganAvailable } from '../../rulesets/cauldronFFA3/secondary'
import type { SecondaryId } from '../../rulesets/cauldronFFA3/secondaryTypes'
import { useSharedSessionStore } from '../../multiplayer/sharedSessionStore'

function revealStorageKey(session: BattleSession, playerId: string, turnNumber: number): string {
  return `secondary-reveal:${session.setup.gameId}:${playerId}:${turnNumber}`
}

export function SecondaryDrawReveal({
  session,
  playerId,
  onMulligan,
}: {
  session: BattleSession
  playerId: string
  onMulligan: (playerId: string, cardId: SecondaryId) => void
}) {
  const membership = useSharedSessionStore((state) => state.membership)
  const turnNumber = getPlayerTurnNumber(session, playerId)
  const secondary = getSecondaryState(session)[playerId]
  const views = getActiveSecondaryViews(session, playerId)
  const [open, setOpen] = useState(false)
  const [stage, setStage] = useState<'summary' | 'choose' | 'replacement'>('summary')
  const [beforeMulliganIds, setBeforeMulliganIds] = useState<SecondaryId[]>([])

  const newCardIds = useMemo(() => new Set(
    (secondary?.active ?? [])
      .filter((card) => card.drawnRound === session.state.round && card.drawnTurn === turnNumber)
      .map((card) => card.cardId),
  ), [secondary?.active, session.state.round, turnNumber])
  const newCards = views.filter((card) => newCardIds.has(card.cardId))
  const replacementIds = new Set(views.map((card) => card.cardId).filter((id) => !beforeMulliganIds.includes(id)))
  const mulliganAvailable = isMulliganAvailable(session, playerId)
  const storageKey = revealStorageKey(session, playerId, turnNumber)

  const sharedForThisBattle = membership?.battleId === session.setup.gameId
  const thisPhoneOwnsPlayer = !sharedForThisBattle || membership?.playerId === playerId
  const eligibleNow = session.state.status === 'active'
    && session.state.activePlayerId === playerId
    && session.state.phase === 'COMMAND'
    && thisPhoneOwnsPlayer
    && newCards.length > 0

  useEffect(() => {
    if (!eligibleNow) {
      setOpen(false)
      setStage('summary')
      setBeforeMulliganIds([])
      return
    }
    if (window.sessionStorage.getItem(storageKey) === 'seen') return
    setStage('summary')
    setBeforeMulliganIds([])
    setOpen(true)
  }, [eligibleNow, storageKey])

  function finish() {
    window.sessionStorage.setItem(storageKey, 'seen')
    setOpen(false)
    setStage('summary')
    setBeforeMulliganIds([])
  }

  function chooseMulligan(cardId: SecondaryId) {
    if (!mulliganAvailable) return
    setBeforeMulliganIds(views.map((card) => card.cardId))
    onMulligan(playerId, cardId)
    setStage('replacement')
  }

  if (!open || !eligibleNow) return null

  return <div className="secondary-draw-reveal" role="presentation">
    <div className="secondary-draw-reveal__scrim" />
    <section className="secondary-draw-reveal__dialog" role="dialog" aria-modal="true" aria-labelledby="secondary-reveal-title">
      <div className="secondary-draw-reveal__header">
        <span className="secondary-draw-reveal__kicker">Command phase · new objectives</span>
        <h2 id="secondary-reveal-title">{stage === 'replacement' ? 'Replacement Secondary drawn' : 'Your Secondary Missions'}</h2>
        <p>{stage === 'replacement'
          ? 'Your free mulligan has been used. Check the replacement before continuing.'
          : `Round ${session.state.round} · these are the missions you are playing this turn.`}</p>
      </div>

      <div className="secondary-draw-reveal__cards">
        {views.map((card, index) => {
          const highlighted = stage === 'replacement' ? replacementIds.has(card.cardId) : newCardIds.has(card.cardId)
          return <article
            className={`secondary-draw-reveal__card${highlighted ? ' secondary-draw-reveal__card--new' : ''}`}
            key={card.cardId}
            style={{ animationDelay: `${Math.min(index, 2) * 110}ms` }}
          >
            <div className="secondary-draw-reveal__card-top">
              <span>{highlighted && stage === 'replacement' ? 'Replacement' : 'Secondary'}</span>
              <strong>{card.vp} VP</strong>
            </div>
            <h3>{card.name}</h3>
            <p>{card.objective}</p>
            <small>{card.progress}</small>
            {stage === 'choose' && <button className="button button--danger" type="button" onClick={() => chooseMulligan(card.cardId)}>
              Mulligan this card
            </button>}
          </article>
        })}
      </div>

      {stage === 'summary' && <div className="secondary-draw-reveal__decision">
        <div>
          <strong>{mulliganAvailable ? 'Free mulligan available' : 'No mulligan available'}</strong>
          <span>{mulliganAvailable ? 'You may replace one of these cards now. The replacement is drawn immediately.' : 'Continue with the cards shown above.'}</span>
        </div>
        <div className="secondary-draw-reveal__actions">
          <button className="button button--gold" type="button" onClick={finish}>Keep cards</button>
          {mulliganAvailable && <button className="button" type="button" onClick={() => setStage('choose')}>Use mulligan</button>}
        </div>
      </div>}

      {stage === 'choose' && <div className="secondary-draw-reveal__footer">
        <button className="button" type="button" onClick={() => setStage('summary')}>Back</button>
        <span>Select exactly one card to replace.</span>
      </div>}

      {stage === 'replacement' && <div className="secondary-draw-reveal__actions secondary-draw-reveal__actions--finish">
        <button className="button button--gold" type="button" onClick={finish}>Start turn</button>
      </div>}
    </section>
  </div>
}

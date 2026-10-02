import type { BattleSession } from '../../domain/battle/types'
import {
  evaluateOperationalPlan,
  getOperationalPlanState,
  getPrimaryAwardedInRound,
  getPrimaryTurnCommit,
  isOfficialPrimary,
  OFFICIAL_PRIMARY_MISSIONS,
  getOfficialPrimaryId,
  type PlanConfirmation,
  isDuelPrimary,
  getDuelPrimaryCommit,
  duelPrimaryCommits,
  hasDuelBattleReady,
} from '../../rulesets/cauldronFFA3'
import { useBattleStore } from '../../stores/battleStore'
import { DuelPrimaryPanel } from './DuelPrimaryPanel'

export function EndRoundReview({
  session,
  onCancel,
  onConfirm,
  sharedBattle = false,
}: {
  session: BattleSession
  onCancel: () => void
  onConfirm: (confirmations: Record<string, PlanConfirmation>) => void
  sharedBattle?: boolean
}) {
  if (isDuelPrimary(session)) return <DuelEndRoundReview session={session} onCancel={onCancel} onConfirm={onConfirm} sharedBattle={sharedBattle} />
  const officialPrimary = isOfficialPrimary(session)
  return (
    <main className="battle-content round-review">
      <div className="round-review__intro">
        <span className="eyebrow">End Battle Round {session.state.round}</span>
        <h1>{officialPrimary ? 'Primary round review' : 'Wyniszczenie review'}</h1>
        <p>{officialPrimary ? 'Each player’s own Primary was locked at the end of their turn. No Operational Plans score in this mode.' : 'Objective Primary was already locked at the end of each player’s own turn. Only Wyniszczenie is resolved here.'}</p>
      </div>
      <div className="round-review-grid">{session.state.turnOrder.map((playerId) => {
        const player = session.state.players[playerId]
        const turnCommit = getPrimaryTurnCommit(session, playerId, session.state.round)
        const planId = officialPrimary ? null : getOperationalPlanState(session, playerId).planId
        const evaluation = planId === 'WYNISZCZENIE'
          ? evaluateOperationalPlan(session, playerId, session.state.round)
          : null
        const pending = session.state.round >= 2 && evaluation?.status === 'COMPLETED'
        const currentRoundVp = getPrimaryAwardedInRound(session, playerId, session.state.round)
        const potentialTotal = Math.min(15, currentRoundVp + (pending ? 5 : 0))
        return <section className="panel primary-review-card" key={playerId}>
          <div className="primary-review-card__header"><div><span className="eyebrow">Zone {player.deploymentZone}</span><h2>{player.name}</h2></div><strong>{potentialTotal} VP</strong></div>
          <div className="primary-condition">
            <span className="condition-mark complete">✓</span>
            <span>Primary locked after own turn</span><strong>+{turnCommit?.pointsAwarded ?? 0}</strong>
          </div>
          {officialPrimary ? <p className="context-note">{OFFICIAL_PRIMARY_MISSIONS[getOfficialPrimaryId(session, playerId)].name} · up to 15 VP this round, 45 VP total.</p> : planId === 'WYNISZCZENIE' ? <div className="review-plan">
            <strong>Wyniszczenie</strong>
            <span className={`plan-status plan-status--${evaluation?.status.toLowerCase()}`}>{evaluation?.status.replace('_', ' ')}</span>
            <p>{evaluation?.reason}</p>
            {evaluation?.progress && <div className="review-plan-progress"><strong>{evaluation.progress.current}</strong><span> / {evaluation.progress.target} {evaluation.progress.unit}</span></div>}
            <div className="primary-condition"><span className={pending ? 'condition-mark complete' : 'condition-mark'}>{pending ? '✓' : '×'}</span><span>Deferred Plan VP</span><strong>+{pending ? 5 : 0}</strong></div>
          </div> : <p className="context-note">{getOperationalPlanState(session, playerId).planId.replaceAll('_', ' ')} was already resolved in this player&apos;s own end-turn review.</p>}
        </section>
      })}</div>
      <div className="review-actions">
        <button onClick={onCancel}>Back to battle</button>
        <button className="button--gold" onClick={() => onConfirm({})}>
          {session.state.round === session.state.maxRounds ? 'Confirm & end battle' : 'Confirm end round'}
        </button>
      </div>
    </main>
  )
}

function DuelEndRoundReview({ session, onCancel, onConfirm, sharedBattle }: {
  session: BattleSession
  onCancel: () => void
  onConfirm: (confirmations: Record<string, PlanConfirmation>) => void
  sharedBattle: boolean
}) {
  const confirmDuelBattleReady = useBattleStore((state) => state.confirmDuelBattleReady)
  const last = session.state.round === session.state.maxRounds
  const battleReviewsDone = !last || session.state.turnOrder.every((id) => getDuelPrimaryCommit(session, id, 'battle'))
  const readyDone = !last || session.state.turnOrder.every((id) => hasDuelBattleReady(session, id))
  const previous = duelPrimaryCommits(session).filter((entry) => entry.round === session.state.round)
  return <main className="battle-content round-review">
    <div className="round-review__intro"><span className="eyebrow">Battle Round {session.state.round}</span><h1>{last ? 'End of battle' : 'Primary round summary'}</h1><p>Each Primary was confirmed at its own Command or turn-end window. Both players may earn at most 15 Primary VP this round and 45 over the battle.</p></div>
    <div className="round-review-grid">{session.state.turnOrder.map((id) => <section className="panel primary-review-card" key={id}><h2>{session.state.players[id].name}</h2><strong>{previous.filter((entry) => entry.playerId === id).reduce((total, entry) => total + entry.pointsAwarded, 0)} / 15 VP this round</strong><p>{session.state.players[id].score.primary} / 45 VP Primary</p></section>)}</div>
    {last && <>
      {session.state.turnOrder.map((id) => <DuelPrimaryPanel key={id} session={session} playerId={id} window="battle" editable={!sharedBattle || id === session.state.activePlayerId} />)}
      {battleReviewsDone && <section className="panel turn-review-section"><h2>Battle Ready · +10 VP</h2><p>Confirm the painting standard for each army, including a “no” when it does not qualify.</p>{session.state.turnOrder.map((id) => <div className="centre-oc-row" key={id}><strong>{session.state.players[id].name}</strong>{hasDuelBattleReady(session, id) ? <span>✓ Confirmed</span> : <div className="review-actions"><button type="button" onClick={() => confirmDuelBattleReady(id, false)}>Not Battle Ready · 0</button><button type="button" onClick={() => confirmDuelBattleReady(id, true)}>Battle Ready · +10 VP</button></div>}</div>)}</section>}
    </>}
    <div className="review-actions"><button type="button" onClick={onCancel}>Back to battle</button><button className="button--gold" type="button" disabled={!battleReviewsDone || !readyDone} onClick={() => onConfirm({})}>{last ? 'Confirm & end battle' : 'Confirm end round'}</button></div>
  </main>
}

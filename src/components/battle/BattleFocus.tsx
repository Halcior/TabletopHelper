import type { BattleSession } from '../../domain/battle/types'
import { getActiveSecondaryViews } from '../../rulesets/cauldronFFA3/secondary'
import { OFFICIAL_SECONDARY_BY_ID } from '../../rulesets/cauldronFFA3/officialSecondaryDefinitions'
import type { OfficialSecondaryId } from '../../rulesets/cauldronFFA3/secondaryTypes'
import { SecondaryScope } from './RivalClarity'
import { FFA_SCORING_BRIEF, secondaryScope } from './rivalPresentation'
import './battleExperience.css'

const PHASE_COPY = {
  COMMAND: 'Review new missions and required choices before moving.',
  MOVEMENT: 'Position units for your missions. Record objective control when it changes.',
  SHOOTING: 'Record losses after saves. Start eligible Mission Actions in the mission cards.',
  CHARGE: 'Check charges at the table; use the map as a reference.',
  FIGHT: 'Record the models actually lost, with the attacking unit when known.',
  END_TURN: 'Review scoring and unresolved actions, then hand over the turn.',
} as const

export function BattleFocus({ session, playerId, onDamage, onObjectives, onCards, onReview }: {
  session: BattleSession; playerId: string; onDamage: () => void; onObjectives: () => void; onCards: () => void; onReview?: () => void
}) {
  const phase = session.state.phase
  const compactMissions = ['MOVEMENT', 'CHARGE', 'FIGHT'].includes(phase)
  const cards = compactMissions ? getActiveSecondaryViews(session, playerId).filter(card => {
    const definition = OFFICIAL_SECONDARY_BY_ID[card.cardId as OfficialSecondaryId]
    return !definition || (phase === 'FIGHT' ? definition.category === 'ELIMINATION' : definition.category !== 'ELIMINATION')
  }) : []
  return <section className="panel battle-focus" aria-label="Battle Focus">
    <div className="section-heading"><div><span className="eyebrow">Battle Focus · {session.state.players[playerId]?.name}</span><h2>{phase.replace('_', ' ').toLowerCase()} phase</h2></div></div>
    <p className="context-note">{PHASE_COPY[phase]}</p>
    <div className="battle-focus__actions">
      <button type="button" className={phase === 'SHOOTING' || phase === 'FIGHT' ? 'button--gold' : ''} onClick={onDamage}>Quick damage</button>
      <button type="button" onClick={onObjectives}>{phase === 'MOVEMENT' ? 'Map & objectives' : 'Objectives'}</button>
      <button type="button" onClick={onCards}>Mission cards</button>
      {phase === 'END_TURN' && onReview && <button type="button" onClick={onReview}>Review scoring</button>}
    </div>
    {cards.length > 0 && <div className="battle-focus__missions">{cards.map(card => <article key={card.cardId}><strong>{card.name}</strong><SecondaryScope session={session} playerId={playerId} cardId={card.cardId} /><p>{secondaryScope(session, playerId, card.cardId) ? FFA_SCORING_BRIEF[card.cardId as OfficialSecondaryId] : card.objective}</p></article>)}</div>}
  </section>
}

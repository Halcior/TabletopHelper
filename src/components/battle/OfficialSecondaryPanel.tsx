import { useState } from 'react'
import type { BattleSession } from '../../domain/battle/types'
import { getCauldronConfig, secondaryStrategyFor } from '../../rulesets/cauldronFFA3/sessionConfig'
import { OFFICIAL_SECONDARY_BY_ID } from '../../rulesets/cauldronFFA3/officialSecondaryDefinitions'
import {
  canScoreOfficialSecondary, officialActionCount, officialAwards, officialRedrawReason,
  officialWindowAcknowledged, officialWindowNeedsReview,
} from '../../rulesets/cauldronFFA3/officialSecondary'
import { getGameSecondaryVp, getRoundSecondaryVp, getSecondaryState } from '../../rulesets/cauldronFFA3/secondary'
import type { OfficialSecondaryId } from '../../rulesets/cauldronFFA3/secondaryTypes'
import { useBattleStore } from '../../stores/battleStore'

export function OfficialSecondaryPanel({ session, playerId, editable }: { session: BattleSession; playerId: string; editable: boolean }) {
  const [selectedVp, setSelectedVp] = useState<Record<string, number>>({})
  const [selectedDiscard, setSelectedDiscard] = useState<OfficialSecondaryId[]>([])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [actionDrafts, setActionDrafts] = useState<Record<string, { unit: string; target: string }>>({})
  const { scoreOfficialSecondary, replaceOfficialSecondary, discardOfficialAtEndTurn, noteOfficialTarget, startOfficialSecondaryAction, acknowledgeOfficialWindow } = useBattleStore()
  const state = getSecondaryState(session)[playerId]
  const config = getCauldronConfig(session)
  const fixed = secondaryStrategyFor(session, playerId) === 'fixed'
  const ownTurn = session.state.activePlayerId === playerId
  const command = session.state.phase === 'COMMAND' && ownTurn
  const endTurn = session.state.phase === 'END_TURN'
  const canDiscard = editable && !fixed && ownTurn && endTurn && state.active.length > 0
  const newOrdersUsed = session.state.events.some((event) => event.type === 'RULESET_EVENT'
    && event.payload.action === 'SECONDARY_NEW_ORDERS_USED'
    && (event.payload.data as { playerId?: string })?.playerId === playerId)
  const player = session.state.players[playerId]
  if (!player || !state) return null

  function updateAction(cardId: OfficialSecondaryId, field: 'unit' | 'target', value: string) {
    setActionDrafts((current) => ({ ...current, [cardId]: { ...(current[cardId] ?? { unit: '', target: '' }), [field]: value } }))
  }

  return <section className="panel secondary-panel official-secondary-panel">
    <div className="section-heading secondary-heading">
      <div><span className="eyebrow">Chapter Approved 2026–27 · {fixed ? 'Fixed' : 'Tactical'}</span><h2>{player.name} · Secondary Missions</h2></div>
      <div className="secondary-score"><strong>{getRoundSecondaryVp(session, playerId)} / 15</strong><span>round</span><small>{getGameSecondaryVp(session, playerId)} / 45 game</small></div>
    </div>
    {config.mode === 'ffa3' && <p className="context-note">FFA adaptation: “opponent” and “enemy” mean your current Rival, including their units, home objective and deployment zone. Confirm battlefield zones and physical distances at the table.</p>}
    <p className="context-note">{fixed
      ? 'Your two Fixed cards stay active. Each can score up to 20 VP during the battle; enter its award once per eligible turn.'
      : 'Draw two new cards every own Command phase even if you already hold cards. There is no free mulligan; New Orders can replace one card for 1 CP once per battle, and some cards have When Drawn replacements. Scored cards leave your hand. At the end of your turn, you may discard one or more cards to gain 1 CP total.'}</p>
    <div className="secondary-deck-counts">
      <div><strong>{state.active.length}</strong><span>Active</span></div>
      <div><strong>{state.deck.length}</strong><span>Deck</span></div>
      <div><strong>{state.completed.length}</strong><span>Scored</span></div>
      <div><strong>{state.discarded.length}</strong><span>Discarded</span></div>
    </div>
    <div className="secondary-card-grid">
      {state.active.map((card) => {
        const cardId = card.cardId as OfficialSecondaryId
        const definition = OFFICIAL_SECONDARY_BY_ID[cardId]
        const redraw = editable && command ? officialRedrawReason(session, playerId, cardId) : undefined
        const canScore = editable && canScoreOfficialSecondary(session, playerId, cardId)
        const awards = officialAwards(session, playerId, cardId)
        const chosenAward = awards.includes(selectedVp[cardId]) ? selectedVp[cardId] : awards[0]
        const scoredOnCard = state.scoreHistory.filter((entry) => entry.cardId === cardId).reduce((sum, entry) => sum + entry.pointsAwarded, 0)
        const actualAward = Math.max(0, Math.min(chosenAward, 15 - getRoundSecondaryVp(session, playerId), 45 - getGameSecondaryVp(session, playerId), fixed ? 20 - scoredOnCard : 5))
        const note = card.cardSpecificState?.lastConfirmation
        const targetCard = ['OFFICIAL_A_TEMPTING_TARGET', 'OFFICIAL_BEACON', 'OFFICIAL_BURDEN_OF_TRUST'].includes(cardId)
        const missionAction = cardId === 'OFFICIAL_CLEANSE' || cardId === 'OFFICIAL_PLUNDER'
        const actionDraft = actionDrafts[cardId] ?? { unit: '', target: '' }
        return <article className="secondary-card secondary-card--input_required secondary-card--official" key={cardId}>
          <div className="secondary-card__heading"><div className="secondary-card__identity"><div><span>{fixed ? 'Fixed' : 'Tactical'} · {definition.scoreAt === 'either' ? 'either turn' : definition.scoreAt === 'own' ? 'your turn' : 'Rival turn'}</span><h3>{definition.name}</h3></div></div><div className="secondary-card__vp"><strong>{fixed ? '20' : '5'}</strong><span>max VP</span></div></div>
          <p className="secondary-card__objective">{definition.description}</p>
          {fixed && <p className="secondary-card__progress">{scoredOnCard} / 20 VP scored on this card</p>}
          {targetCard && <div className="official-secondary-input"><label>{cardId === 'OFFICIAL_A_TEMPTING_TARGET' ? 'Objective selected by the Rival' : cardId === 'OFFICIAL_BEACON' ? 'Chosen unit' : 'Units guarding objectives'}<input value={notes[cardId] ?? note ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [cardId]: event.target.value }))} disabled={!editable} placeholder="Record the choice at the table" /></label>{editable && <button type="button" disabled={!(notes[cardId] ?? '').trim()} onClick={() => noteOfficialTarget(playerId, cardId, notes[cardId])}>Save choice</button>}</div>}
          {missionAction && <div className="official-secondary-input"><strong>{officialActionCount(session, playerId, cardId)} action(s) started this turn</strong>{editable && command === false && ownTurn && session.state.phase === 'SHOOTING' && <>
            <label>Acting unit<input value={actionDraft.unit} onChange={(event) => updateAction(cardId, 'unit', event.target.value)} placeholder="Unit name" /></label>
            <label>{cardId === 'OFFICIAL_CLEANSE' ? 'Non-home objective' : 'Terrain area outside your territory'}<input value={actionDraft.target} onChange={(event) => updateAction(cardId, 'target', event.target.value)} placeholder="Location on the table" /></label>
            <button type="button" disabled={!actionDraft.unit.trim() || !actionDraft.target.trim()} onClick={() => { startOfficialSecondaryAction(playerId, cardId, actionDraft.unit, actionDraft.target); setActionDrafts((current) => ({ ...current, [cardId]: { unit: '', target: '' } })) }}>Start action in Shooting phase</button>
          </>}</div>}
          {redraw && <div className="official-secondary-input"><small>{redraw}. Check the condition before replacing.</small><button type="button" onClick={() => replaceOfficialSecondary(playerId, cardId)}>Replace this card</button></div>}
          {editable && command && !fixed && !newOrdersUsed && state.deck.length > 0 && player.cp > 0 && <button type="button" onClick={() => replaceOfficialSecondary(playerId, cardId, true)}>New Orders · replace for 1 CP (once per battle)</button>}
          {canScore && <div className="official-secondary-input"><label>Confirmed award<select value={chosenAward} onChange={(event) => setSelectedVp((current) => ({ ...current, [cardId]: Number(event.target.value) }))}>{awards.map((vp) => <option key={vp} value={vp}>{vp} VP</option>)}</select></label><button className="button--gold" type="button" onClick={() => scoreOfficialSecondary(playerId, cardId, chosenAward)}>Condition met · score {actualAward} VP</button><small>{actualAward < chosenAward ? `Limited from ${chosenAward} VP by the round, game, or Fixed-card cap. ` : ''}Check the full condition on the table before scoring.</small></div>}
          {canDiscard && <label className="review-check-row"><input type="checkbox" checked={selectedDiscard.includes(cardId)} onChange={(event) => setSelectedDiscard((current) => event.target.checked ? [...current, cardId] : current.filter((id) => id !== cardId))} /><span>Discard at the end of this turn</span></label>}
        </article>
      })}
    </div>
    {state.active.length === 0 && <p className="context-note">No active cards. {fixed ? 'Check the selected Fixed cards in setup.' : 'Draw two cards in your next Command phase while the deck lasts.'}</p>}
    {canDiscard && selectedDiscard.length > 0 && <div className="review-actions"><button type="button" onClick={() => { discardOfficialAtEndTurn(playerId, selectedDiscard); setSelectedDiscard([]) }}>Discard {selectedDiscard.length} card(s) · gain 1 CP</button></div>}
    {editable && endTurn && officialWindowNeedsReview(session, playerId) && <div className="review-actions"><button type="button" onClick={() => acknowledgeOfficialWindow(playerId)}>Finished reviewing {session.state.players[session.state.activePlayerId].name}’s turn · no more cards to score</button></div>}
    {editable && endTurn && officialWindowAcknowledged(session, playerId) && <p className="secondary-feedback" role="status">✓ This turn’s Secondary review is complete.</p>}
    {state.scoreHistory.length > 0 && <details className="turn-review-details"><summary>Scoring history</summary><ul className="secondary-history">{state.scoreHistory.map((entry, index) => <li key={`${entry.round}-${entry.cardId}-${index}`}><span>Round {entry.round} · {entry.cardName}</span><strong>+{entry.pointsAwarded} VP</strong></li>)}</ul></details>}
  </section>
}

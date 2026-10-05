import { useState } from 'react'
import type { BattleSession } from '../../domain/battle/types'
import { secondaryStrategyFor } from '../../rulesets/cauldronFFA3/sessionConfig'
import { OFFICIAL_SECONDARY_BY_ID, officialFfaDescription } from '../../rulesets/cauldronFFA3/officialSecondaryDefinitions'
import {
  canScoreOfficialSecondary, officialActionCount, officialAwards, officialRedrawReason,
  officialWindowAcknowledged, officialWindowNeedsReview,
  officialTurnKey,
} from '../../rulesets/cauldronFFA3/officialSecondary'
import {
  getOfficialSecondaryRival, isOfficialFfa, officialHomeId,
  officialNmlObjectives, officialPlayerUnits, officialRivalKills, officialTemptingTargets,
} from '../../rulesets/cauldronFFA3/officialSecondaryFFA'
import { getGameSecondaryVp, getRoundSecondaryVp, getSecondaryState } from '../../rulesets/cauldronFFA3/secondary'
import type { OfficialSecondaryConfirmation, OfficialSecondaryId } from '../../rulesets/cauldronFFA3/secondaryTypes'
import { useBattleStore } from '../../stores/battleStore'
import { OfficialSecondaryConfirmationFields } from './OfficialSecondaryConfirmationFields'

export function OfficialSecondaryPanel({ session, playerId, editable }: { session: BattleSession; playerId: string; editable: boolean }) {
  const [selectedVp, setSelectedVp] = useState<Record<string, number>>({})
  const [selectedDiscard, setSelectedDiscard] = useState<OfficialSecondaryId[]>([])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [actionDrafts, setActionDrafts] = useState<Record<string, { unit: string; target: string; terrainWhollyOutsideOwnTerritory?: boolean }>>({})
  const [confirmations, setConfirmations] = useState<Record<string, OfficialSecondaryConfirmation>>({})
  const [guardDraft, setGuardDraft] = useState<Record<string, string>>({})
  const { scoreOfficialSecondary, replaceOfficialSecondary, discardOfficialAtEndTurn, noteOfficialTarget, startOfficialSecondaryAction, acknowledgeOfficialWindow, assignOfficialGuards } = useBattleStore()
  const state = getSecondaryState(session)[playerId]
  const ffa = isOfficialFfa(session)
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
    {ffa && <p className="context-note">FFA balance patch: each Rival card keeps the Rival assigned when drawn. Physical enemy presence checks both other armies; only kills by your own army against the assigned Rival count. Primary still uses Current Rival. NML is outside all deployment zones; fixed Territories A/B/C are a separate layer. Territory boundaries count as inside; “outside” requires wholly outside. Confirm distances and footprints at the table.</p>}
    {ffa && fixed && <p className="context-note">Fixed is experimental in FFA because matchups affect target availability. Tactical is recommended.</p>}
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
        const confirmationKey = `${officialTurnKey(session)}:${cardId}`
        const rivalId = definition.usesSecondaryRival ? getOfficialSecondaryRival(session, playerId, cardId) : undefined
        const confirmation = { ...confirmations[confirmationKey], ...(rivalId ? { secondaryRivalPlayerId: rivalId } : {}) }
        const awards = officialAwards(session, playerId, cardId, confirmation)
        const chosenAward = awards.includes(selectedVp[cardId]) ? selectedVp[cardId] : awards[0] ?? 0
        const scoredOnCard = state.scoreHistory.filter((entry) => entry.cardId === cardId).reduce((sum, entry) => sum + entry.pointsAwarded, 0)
        const actualAward = Math.max(0, Math.min(chosenAward, 15 - getRoundSecondaryVp(session, playerId), 45 - getGameSecondaryVp(session, playerId), fixed ? 20 - scoredOnCard : 5))
        const note = card.cardSpecificState?.lastConfirmation
        const targetCard = ['OFFICIAL_A_TEMPTING_TARGET', 'OFFICIAL_BEACON', 'OFFICIAL_BURDEN_OF_TRUST'].includes(cardId)
        const missionAction = cardId === 'OFFICIAL_CLEANSE' || cardId === 'OFFICIAL_PLUNDER'
        const actionDraft = actionDrafts[cardId] ?? { unit: '', target: '' }
        return <article className="secondary-card secondary-card--input_required secondary-card--official" key={cardId}>
          <div className="secondary-card__heading"><div className="secondary-card__identity"><div><span>{fixed ? 'Fixed' : 'Tactical'} · {definition.scoreAt === 'either' ? 'either turn' : definition.scoreAt === 'own' ? 'your turn' : 'Rival turn'}</span><h3>{definition.name}</h3></div></div><div className="secondary-card__vp"><strong>{fixed ? '20' : '5'}</strong><span>max VP</span></div></div>
          {ffa && rivalId && <p className="secondary-card__progress">Target Rival: {session.state.players[rivalId]?.name} · {officialHomeId(session, rivalId)}</p>}
          {ffa && definition.enemyScope === 'all-enemies' && <small>Enemy scope: All opponents</small>}
          <p className="secondary-card__objective">{ffa ? officialFfaDescription(cardId) : definition.description}</p>
          {fixed && <p className="secondary-card__progress">{scoredOnCard} / 20 VP scored on this card</p>}
          {targetCard && !ffa && cardId !== 'OFFICIAL_BEACON' && <div className="official-secondary-input"><label>{cardId === 'OFFICIAL_A_TEMPTING_TARGET' ? 'Objective selected by the Rival' : 'Units guarding objectives'}<input value={notes[cardId] ?? note ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [cardId]: event.target.value }))} disabled={!editable} placeholder="Record the choice at the table" /></label>{editable && <button type="button" disabled={!(notes[cardId] ?? '').trim()} onClick={() => noteOfficialTarget(playerId, cardId, notes[cardId])}>Save choice</button>}</div>}
          {targetCard && (ffa || cardId === 'OFFICIAL_BEACON') && cardId !== 'OFFICIAL_BURDEN_OF_TRUST' && <div className="official-secondary-input">
            {note ? <strong>Locked choice: {note}</strong> : <><label>{cardId === 'OFFICIAL_A_TEMPTING_TARGET' ? 'Objective selected by the assigned Rival' : 'Chosen own unit'}<select value={notes[cardId] ?? ''} disabled={!editable || !command} onChange={(event) => setNotes((current) => ({ ...current, [cardId]: event.target.value }))}>
              <option value="">Choose when drawn</option>
              {cardId === 'OFFICIAL_A_TEMPTING_TARGET' ? officialTemptingTargets(session, playerId).map((id) => <option key={id} value={id}>{id}</option>)
                : officialPlayerUnits(session, playerId).filter((unit) => !player.units[unit.id]?.destroyed && !player.units[unit.id]?.inReserve).map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
            </select></label>{editable && command && <button type="button" disabled={!notes[cardId]} onClick={() => noteOfficialTarget(playerId, cardId, notes[cardId])}>Save and lock choice</button>}</>}
          </div>}
          {ffa && cardId === 'OFFICIAL_BURDEN_OF_TRUST' && <div className="official-secondary-input">
            {Object.entries(card.cardSpecificState?.officialGuardAssignments ?? {}).map(([objectiveId, unitId]) => <small key={objectiveId}>Guard: {objectiveId} · {officialPlayerUnits(session, playerId).find((unit) => unit.id === unitId)?.name}</small>)}
            {editable && command && card.cardSpecificState?.officialGuardAssignmentTurnKey !== officialTurnKey(session) && <>
              {Object.values(session.state.objectives).filter((objective) => objective.controllerPlayerId === playerId).map((objective) => <label key={objective.id}>{objective.id} · guarding unit<select value={guardDraft[objective.id] ?? ''} onChange={(event) => setGuardDraft((current) => ({ ...current, [objective.id]: event.target.value }))}>
                <option value="">Assign an own unit</option>{officialPlayerUnits(session, playerId).filter((unit) => !player.units[unit.id]?.destroyed && !player.units[unit.id]?.inReserve).map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
              </select></label>)}
              <button type="button" onClick={() => assignOfficialGuards(playerId, Object.fromEntries(Object.values(session.state.objectives).filter((objective) => objective.controllerPlayerId === playerId).map((objective) => [objective.id, guardDraft[objective.id] ?? ''])))}>Save guards for this turn</button>
            </>}
          </div>}
          {missionAction && <div className="official-secondary-input"><strong>{officialActionCount(session, playerId, cardId)} action(s) started this turn</strong>{editable && command === false && ownTurn && session.state.phase === 'SHOOTING' && <>
            <label>Acting unit<select value={actionDraft.unit} onChange={(event) => updateAction(cardId, 'unit', event.target.value)}><option value="">Choose a qualifying own unit</option>{officialPlayerUnits(session, playerId).filter((unit) => !player.units[unit.id]?.destroyed && !player.units[unit.id]?.inReserve && !player.units[unit.id]?.battleShocked).map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
            <label>{cardId === 'OFFICIAL_CLEANSE' ? 'Non-home objective' : ffa ? 'Terrain area wholly outside your Territory' : 'Terrain area outside your territory'}{cardId === 'OFFICIAL_CLEANSE' ? <select value={actionDraft.target} onChange={(event) => updateAction(cardId, 'target', event.target.value)}><option value="">Choose an objective</option>{officialNmlObjectives(session).map((id) => <option key={id} value={id}>{id}</option>)}</select> : <input value={actionDraft.target} onChange={(event) => updateAction(cardId, 'target', event.target.value)} placeholder="Location on the table" />}</label>
            {ffa && cardId === 'OFFICIAL_PLUNDER' && <label className="review-check-row"><input type="checkbox" checked={actionDraft.terrainWhollyOutsideOwnTerritory ?? false} onChange={(event) => setActionDrafts((current) => ({ ...current, [cardId]: { ...actionDraft, terrainWhollyOutsideOwnTerritory: event.target.checked } }))} /><span>The entire terrain footprint is wholly outside own Territory, without touching its boundary</span></label>}
            <button type="button" disabled={!actionDraft.unit.trim() || !actionDraft.target.trim() || (ffa && cardId === 'OFFICIAL_PLUNDER' && !actionDraft.terrainWhollyOutsideOwnTerritory)} onClick={() => { startOfficialSecondaryAction(playerId, cardId, actionDraft.unit, actionDraft.target, actionDraft); setActionDrafts((current) => ({ ...current, [cardId]: { unit: '', target: '' } })) }}>Start action in Shooting phase</button>
          </>}</div>}
          {redraw && <div className="official-secondary-input"><small>{redraw}. Check the condition before replacing.</small><button type="button" onClick={() => replaceOfficialSecondary(playerId, cardId)}>Replace this card</button></div>}
          {editable && command && !fixed && !newOrdersUsed && state.deck.length > 0 && player.cp > 0 && <button type="button" onClick={() => replaceOfficialSecondary(playerId, cardId, true)}>New Orders · replace for 1 CP (once per battle)</button>}
          {canScore && <div className="official-secondary-input">
            {ffa && <OfficialSecondaryConfirmationFields session={session} playerId={playerId} cardId={cardId} value={confirmation} onChange={(value) => setConfirmations((current) => ({ ...current, [confirmationKey]: value }))} />}
            {ffa && definition.category === 'ELIMINATION' && <small>Attributed kills against {session.state.players[rivalId!]?.name} this turn: {officialRivalKills(session, playerId, cardId).filter((kill) => kill.unitDestroyed).length} units / {officialRivalKills(session, playerId, cardId).reduce((sum, kill) => sum + kill.modelsDestroyed, 0)} models. Only qualifying kills count.</small>}
            <label>Confirmed award<select value={chosenAward} onChange={(event) => setSelectedVp((current) => ({ ...current, [cardId]: Number(event.target.value) }))}>{awards.length === 0 && <option value={0}>Condition not met or confirmations needed</option>}{awards.map((vp) => <option key={vp} value={vp}>{vp} VP</option>)}</select></label>
            <button className="button--gold" type="button" disabled={awards.length === 0} onClick={() => scoreOfficialSecondary(playerId, cardId, chosenAward, confirmation)}>Condition met · score {actualAward} VP</button><small>{actualAward < chosenAward ? `Limited from ${chosenAward} VP by the round, game, or Fixed-card cap. ` : ''}Check the full condition on the table before scoring.</small>
          </div>}
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

import { t as tr } from '../../features/i18n/locale'
import { Fragment, useState } from 'react'
import type { BattleSession } from '../../domain/battle/types'
import { secondaryStrategyFor } from '../../rulesets/cauldronFFA3/sessionConfig'
import { OFFICIAL_SECONDARY_BY_ID, officialFfaDescription } from '../../rulesets/cauldronFFA3/officialSecondaryDefinitions'
import {
  canScoreOfficialSecondary, doublesSecondaryUnitChoices, officialActionCount, officialAwards, officialRedrawReason,
  officialWindowAcknowledged, officialWindowNeedsReview,
  officialTurnKey,
} from '../../rulesets/cauldronFFA3/officialSecondary'
import {
  getOfficialSecondaryRival, isOfficialFfa,
  officialNmlObjectives, officialPlayerUnits, officialRivalKills, officialTemptingTargets,
} from '../../rulesets/cauldronFFA3/officialSecondaryFFA'
import { getGameSecondaryVp, getRoundSecondaryVp, getSecondaryState } from '../../rulesets/cauldronFFA3/secondary'
import type { OfficialSecondaryConfirmation, OfficialSecondaryId } from '../../rulesets/cauldronFFA3/secondaryTypes'
import { useBattleStore } from '../../stores/battleStore'
import { OfficialSecondaryConfirmationFields } from './OfficialSecondaryConfirmationFields'
import { InfoDisclosure } from '../ui/InfoDisclosure'
import { RivalHelp, SecondaryScope } from './RivalClarity'
import { FFA_SCORING_BRIEF } from './rivalPresentation'

type OfficialSecondaryPanelProps = { session: BattleSession; playerId: string; editable: boolean }

export function OfficialSecondaryPanel(props: OfficialSecondaryPanelProps) {
  const { session, playerId } = props
  // Local confirmations and discard/action drafts belong to this player's phase.
  const context = [session.setup.gameId, playerId, officialTurnKey(session), session.state.phase].join(':')
  return <OfficialSecondaryForm key={context} {...props} />
}

function OfficialSecondaryForm({ session, playerId, editable }: OfficialSecondaryPanelProps) {
  const [selectedVp, setSelectedVp] = useState<Record<string, number>>({})
  const [selectedDiscard, setSelectedDiscard] = useState<OfficialSecondaryId[]>([])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [actionDrafts, setActionDrafts] = useState<Record<string, { unit: string; target: string; terrainWhollyOutsideOwnTerritory?: boolean }>>({})
  const [confirmations, setConfirmations] = useState<Record<string, OfficialSecondaryConfirmation>>({})
  const [guardDraft, setGuardDraft] = useState<Record<string, string>>({})
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({})
  const { scoreOfficialSecondary, replaceOfficialSecondary, discardOfficialAtEndTurn, noteOfficialTarget, startOfficialSecondaryAction, acknowledgeOfficialWindow, assignOfficialGuards } = useBattleStore()
  const state = getSecondaryState(session)[playerId]
  const ffa = isOfficialFfa(session)
  const doublesUnitChoices = session.setup.doubles ? doublesSecondaryUnitChoices(session, playerId) : null
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

  function reviewGroup(cardId: OfficialSecondaryId): 'Ready to Score' | 'Needs Confirmation' | 'Carry Over / Discard' {
    if (!canScoreOfficialSecondary(session, playerId, cardId)) return 'Carry Over / Discard'
    if (!ffa) return 'Needs Confirmation'
    return officialAwards(session, playerId, cardId, confirmations[`${officialTurnKey(session)}:${cardId}`]).length ? 'Ready to Score' : 'Needs Confirmation'
  }
  const groupOrder = ['Ready to Score', 'Needs Confirmation', 'Carry Over / Discard']
  const cards = endTurn ? [...state.active].sort((a, b) => groupOrder.indexOf(reviewGroup(a.cardId as OfficialSecondaryId)) - groupOrder.indexOf(reviewGroup(b.cardId as OfficialSecondaryId))) : state.active

  function updateAction(cardId: OfficialSecondaryId, field: 'unit' | 'target', value: string) {
    setActionDrafts((current) => ({ ...current, [cardId]: { ...(current[cardId] ?? { unit: '', target: '' }), [field]: value } }))
  }

  return <section className="panel secondary-panel official-secondary-panel">
    <div className="section-heading secondary-heading">
      <div><span className="eyebrow">{tr("Chapter Approved 2026–27 · ")}{fixed ? tr('Fixed') : tr('Tactical')}</span><h2>{session.setup.doubles?.forces.find((force) => force.captainPlayerId === playerId)?.name ?? player.name} {tr(" · Secondary Missions")}</h2></div>
      <div className="secondary-score"><strong>{getRoundSecondaryVp(session, playerId)} / 15</strong><span>{tr("round")}</span><small>{getGameSecondaryVp(session, playerId)} {tr(" / 45 game")}</small></div>
    </div>
    {ffa && <RivalHelp />}
    <InfoDisclosure label={tr("Secondary rules & table confirmations")}>
    {ffa && <p className="context-note">{tr("FFA balance patch: each Rival card keeps the Rival assigned when drawn. Physical enemy presence checks both other armies; only kills by your own army against the assigned Rival count. Primary still uses Current Rival. NML is outside all deployment zones; fixed Territories A/B/C are a separate layer. Territory boundaries count as inside; “outside” requires wholly outside. Confirm distances and footprints at the table.")}</p>}
    {ffa && fixed && <p className="context-note">{tr("Fixed is experimental in FFA because matchups affect target availability. Tactical is recommended.")}</p>}
    <p className="context-note">{fixed
      ? tr('Your two Fixed cards stay active. Each can score up to 20 VP during the battle; enter its award once per eligible turn.')
      : tr('Draw two new cards every own Command phase even if you already hold cards. There is no free mulligan; New Orders can replace one card for 1 CP once per battle, and some cards have When Drawn replacements. Scored cards leave your hand. At the end of your turn, you may discard one or more cards to gain 1 CP total.')}</p>
    </InfoDisclosure>
    <div className="secondary-deck-counts">
      <div><strong>{state.active.length}</strong><span>{tr("Active")}</span></div>
      <div><strong>{state.deck.length}</strong><span>{tr("Deck")}</span></div>
      <div><strong>{state.completed.length}</strong><span>{tr("Scored")}</span></div>
      <div><strong>{state.discarded.length}</strong><span>{tr("Discarded")}</span></div>
    </div>
    <div className="secondary-card-grid">
      {cards.map((card, index) => {
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
        const choiceRequired = editable && command && targetCard && (cardId === 'OFFICIAL_BURDEN_OF_TRUST' && ffa ? card.cardSpecificState?.officialGuardAssignmentTurnKey !== officialTurnKey(session) : !note)
        const actionAvailable = editable && ownTurn && session.state.phase === 'SHOOTING' && missionAction
        const required = choiceRequired || canScore || Boolean(redraw) || canDiscard
        const status = canScore && !ffa ? 'Needs Confirmation' : canScore && actualAward > 0 ? 'Ready to Score' : required ? 'Action Required' : definition.scoreAt === 'opponent' && ownTurn ? 'Awaiting Rival' : 'Active'
        const description = ffa ? officialFfaDescription(cardId) : definition.description
        const firstSentence = ffa ? FFA_SCORING_BRIEF[cardId] : description.split(/(?<=[.!?])\s/)[0]
        const group = endTurn ? reviewGroup(cardId) : undefined
        return <Fragment key={cardId}>
          {group && (index === 0 || reviewGroup(cards[index - 1].cardId as OfficialSecondaryId) !== group) && <h3 className="secondary-review-group">{tr(group)}</h3>}
          <article data-review-group={group} className={`secondary-card secondary-card--official${required ? ' secondary-card--input_required' : ''}`}>
          <div className="secondary-card__heading"><div className="secondary-card__identity"><div><span>{fixed ? tr('Fixed') : tr('Tactical')}{!ffa && tr(` · ${definition.scoreAt === 'either' ? 'either turn' : definition.scoreAt === 'own' ? 'your turn' : 'Rival turn'}`, " · {0}")}</span><h3>{definition.name}</h3></div></div><div className="secondary-card__vp"><strong>{fixed ? '20' : '5'}</strong><span>{tr("max VP")}</span></div></div>
          <span className={`mission-status${required ? ' mission-status--required' : ''}${status === 'Ready to Score' ? ' mission-status--ready' : ''}`}>{tr(status)}</span>
          {ffa && <SecondaryScope session={session} playerId={playerId} cardId={cardId} />}
          <p className="secondary-card__objective secondary-card__brief">{tr(firstSentence)}</p>
          {ffa && endTurn && <small className="context-note">{canScore ? (awards.length ? tr('Eligible window · current recorded facts and confirmations support a VP award.') : tr('Eligible window · condition not met or table confirmations needed.')) : tr('No scoring available now · check the timing, previous review and card cap.')}</small>}
          {fixed && <p className="secondary-card__progress">{scoredOnCard} {tr(" / 20 VP scored on this card")}</p>}
          <details className="mission-card-details" open={required || actionAvailable || Boolean(expandedCards[cardId])} onToggle={(event) => { if (!required && !actionAvailable) { const open = event.currentTarget.open; setExpandedCards((current) => current[cardId] === open ? current : { ...current, [cardId]: open }) } }}>
          <summary>{required ? tr('Required choices & scoring') : actionAvailable ? tr('Mission Action available') : tr('Full rules & actions')}</summary>
          {ffa ? <InfoDisclosure label={tr("Full card rules")}><p className="secondary-card__full-rules">{tr(description)}</p></InfoDisclosure>
            : <p className="secondary-card__full-rules">{tr(description)}</p>}
          {targetCard && !ffa && cardId !== 'OFFICIAL_BEACON' && !(session.setup.doubles && cardId === 'OFFICIAL_BURDEN_OF_TRUST') && <div className="official-secondary-input"><label>{cardId === 'OFFICIAL_A_TEMPTING_TARGET' ? tr('Objective selected by the Rival') : tr('Units guarding objectives')}<input value={notes[cardId] ?? note ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [cardId]: event.target.value }))} disabled={!editable} placeholder={tr("Record the choice at the table")} /></label>{editable && <button type="button" disabled={!(notes[cardId] ?? '').trim()} onClick={() => noteOfficialTarget(playerId, cardId, notes[cardId])}>{tr("Save choice")}</button>}</div>}
          {targetCard && (ffa || cardId === 'OFFICIAL_BEACON') && cardId !== 'OFFICIAL_BURDEN_OF_TRUST' && <div className="official-secondary-input">
            {note ? <strong>{tr("Locked choice: ")}{note}</strong> : <><label>{cardId === 'OFFICIAL_A_TEMPTING_TARGET' ? tr('Objective selected by the assigned Rival') : tr('Chosen own unit')}<select value={notes[cardId] ?? ''} disabled={!editable || !command} onChange={(event) => setNotes((current) => ({ ...current, [cardId]: event.target.value }))}>
              <option value="">{tr("Choose when drawn")}</option>
              {cardId === 'OFFICIAL_A_TEMPTING_TARGET' ? officialTemptingTargets(session, playerId).map((id) => <option key={id} value={id}>{id}</option>)
                : doublesUnitChoices
                  ? doublesSecondaryUnitChoices(session, playerId, false).map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)
                  : officialPlayerUnits(session, playerId).filter((unit) => !player.units[unit.id]?.destroyed && !player.units[unit.id]?.inReserve).map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
            </select></label>{editable && command && <button type="button" disabled={!notes[cardId]} onClick={() => noteOfficialTarget(playerId, cardId, notes[cardId])}>{tr("Save and lock choice")}</button>}</>}
          </div>}
          {(ffa || Boolean(session.setup.doubles)) && cardId === 'OFFICIAL_BURDEN_OF_TRUST' && <div className="official-secondary-input">
            {Object.entries(card.cardSpecificState?.officialGuardAssignments ?? {}).map(([objectiveId, unitId]) => <small key={objectiveId}>{tr("Guard: ")}{objectiveId} · {session.setup.doubles ? doublesSecondaryUnitChoices(session, playerId, false).find((choice) => choice.value === unitId)?.label : officialPlayerUnits(session, playerId).find((unit) => unit.id === unitId)?.name}</small>)}
            {editable && command && card.cardSpecificState?.officialGuardAssignmentTurnKey !== officialTurnKey(session) && <>
              {Object.values(session.state.objectives).filter((objective) => objective.controllerPlayerId === playerId).map((objective) => <label key={objective.id}>{objective.id} {tr(" · guarding unit")}<select value={guardDraft[objective.id] ?? ''} onChange={(event) => setGuardDraft((current) => ({ ...current, [objective.id]: event.target.value }))}>
                <option value="">{tr("Assign a unit from your force")}</option>{session.setup.doubles ? doublesSecondaryUnitChoices(session, playerId, false).map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>) : officialPlayerUnits(session, playerId).filter((unit) => !player.units[unit.id]?.destroyed && !player.units[unit.id]?.inReserve).map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
              </select></label>)}
              <button type="button" onClick={() => assignOfficialGuards(playerId, Object.fromEntries(Object.values(session.state.objectives).filter((objective) => objective.controllerPlayerId === playerId).map((objective) => [objective.id, guardDraft[objective.id] ?? ''])))}>{tr("Save guards for this turn")}</button>
            </>}
          </div>}
          {missionAction && <div className="official-secondary-input"><strong>{officialActionCount(session, playerId, cardId)} {tr(" action(s) started this turn")}</strong>{editable && command === false && ownTurn && session.state.phase === 'SHOOTING' && <>
            <label>{tr("Acting unit")}<select value={actionDraft.unit} onChange={(event) => updateAction(cardId, 'unit', event.target.value)}><option value="">{tr("Choose a qualifying own unit")}</option>{doublesUnitChoices
              ? doublesUnitChoices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)
              : officialPlayerUnits(session, playerId).filter((unit) => !player.units[unit.id]?.destroyed && !player.units[unit.id]?.inReserve && !player.units[unit.id]?.battleShocked).map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
            <label>{cardId === 'OFFICIAL_CLEANSE' ? tr('Non-home objective') : ffa ? tr('Terrain area wholly outside your Territory') : tr('Terrain area outside your territory')}{cardId === 'OFFICIAL_CLEANSE' ? <select value={actionDraft.target} onChange={(event) => updateAction(cardId, 'target', event.target.value)}><option value="">{tr("Choose an objective")}</option>{officialNmlObjectives(session).map((id) => <option key={id} value={id}>{id}</option>)}</select> : <input value={actionDraft.target} onChange={(event) => updateAction(cardId, 'target', event.target.value)} placeholder={tr("Location on the table")} />}</label>
            {ffa && cardId === 'OFFICIAL_PLUNDER' && <label className="review-check-row"><input type="checkbox" checked={actionDraft.terrainWhollyOutsideOwnTerritory ?? false} onChange={(event) => setActionDrafts((current) => ({ ...current, [cardId]: { ...actionDraft, terrainWhollyOutsideOwnTerritory: event.target.checked } }))} /><span>{tr("The entire terrain footprint is wholly outside own Territory, without touching its boundary")}</span></label>}
            <button type="button" disabled={!actionDraft.unit.trim() || !actionDraft.target.trim() || (ffa && cardId === 'OFFICIAL_PLUNDER' && !actionDraft.terrainWhollyOutsideOwnTerritory)} onClick={() => { startOfficialSecondaryAction(playerId, cardId, actionDraft.unit, actionDraft.target, actionDraft); setActionDrafts((current) => ({ ...current, [cardId]: { unit: '', target: '' } })) }}>{tr("Start action in Shooting phase")}</button>
          </>}</div>}
          {redraw && <div className="official-secondary-input"><small>{tr(redraw)}{tr(". Check the condition before replacing.")}</small><button type="button" onClick={() => replaceOfficialSecondary(playerId, cardId)}>{tr("Replace this card")}</button></div>}
          {editable && command && !fixed && !newOrdersUsed && state.deck.length > 0 && player.cp > 0 && <button type="button" onClick={() => replaceOfficialSecondary(playerId, cardId, true)}>{tr("New Orders · replace for 1 CP (once per battle)")}</button>}
          {canScore && <div className="official-secondary-input">
            {ffa && <OfficialSecondaryConfirmationFields session={session} playerId={playerId} cardId={cardId} value={confirmation} onChange={(value) => setConfirmations((current) => ({ ...current, [confirmationKey]: value }))} />}
            {ffa && definition.category === 'ELIMINATION' && <small>{tr("Attributed kills against ")}{session.state.players[rivalId!]?.name} {tr(" this turn: ")}{officialRivalKills(session, playerId, cardId).filter((kill) => kill.unitDestroyed).length} {tr(" units / ")}{officialRivalKills(session, playerId, cardId).reduce((sum, kill) => sum + kill.modelsDestroyed, 0)} {tr(" models. Only qualifying kills count.")}</small>}
            <label>{tr("Confirmed award")}<select value={chosenAward} onChange={(event) => setSelectedVp((current) => ({ ...current, [cardId]: Number(event.target.value) }))}>{awards.length === 0 && <option value={0}>{tr("Condition not met or confirmations needed")}</option>}{awards.map((vp) => <option key={vp} value={vp}>{vp} {tr(" VP")}</option>)}</select></label>
            <button className="button--gold" type="button" disabled={awards.length === 0} onClick={() => scoreOfficialSecondary(playerId, cardId, chosenAward, confirmation)}>{tr("Condition met · score ")}{actualAward} {tr(" VP")}</button><small>{actualAward < chosenAward ? tr(`Limited from ${chosenAward} VP by the round, game, or Fixed-card cap. `, "Limited from {0} VP by the round, game, or Fixed-card cap. ") : ''}{tr("Check the full condition on the table before scoring.")}</small>
          </div>}
          {canDiscard && <label className="review-check-row"><input type="checkbox" checked={selectedDiscard.includes(cardId)} onChange={(event) => setSelectedDiscard((current) => event.target.checked ? [...current, cardId] : current.filter((id) => id !== cardId))} /><span>{tr("Discard at the end of this turn")}</span></label>}
          </details>
        </article></Fragment>
      })}
    </div>
    {state.active.length === 0 && <p className="context-note">{tr("No active cards. ")}{fixed ? tr('Check the selected Fixed cards in setup.') : tr('Draw two cards in your next Command phase while the deck lasts.')}</p>}
    {canDiscard && selectedDiscard.length > 0 && <div className="review-actions"><button type="button" onClick={() => { discardOfficialAtEndTurn(playerId, selectedDiscard); setSelectedDiscard([]) }}>{tr("Discard ")}{selectedDiscard.length} {tr(" card(s) · gain 1 CP")}</button></div>}
    {editable && endTurn && officialWindowNeedsReview(session, playerId) && <div className="review-actions"><button type="button" onClick={() => acknowledgeOfficialWindow(playerId)}>{tr("Finished reviewing ")}{session.state.players[session.state.activePlayerId].name}{tr("’s turn · no more cards to score")}</button></div>}
    {editable && endTurn && officialWindowAcknowledged(session, playerId) && <p className="secondary-feedback" role="status">{tr("✓ This turn’s Secondary review is complete.")}</p>}
    {state.scoreHistory.length > 0 && <details className="turn-review-details"><summary>{tr("Scoring history")}</summary><ul className="secondary-history">{state.scoreHistory.map((entry, index) => <li key={`${entry.round}-${entry.cardId}-${index}`}><span>{tr("Round ")}{entry.round} · {entry.cardName}</span><strong>+{entry.pointsAwarded} {tr(" VP")}</strong></li>)}</ul></details>}
    {(state.completed.length > 0 || state.discarded.length > 0) && <details className="turn-review-details"><summary>{tr("Completed & discarded cards")}</summary><ul className="secondary-history">{[...state.completed.map((card) => ({ ...card, label: 'Completed' })), ...state.discarded.map((card) => ({ ...card, label: 'Discarded' }))].map((card, index) => <li key={`${card.cardId}-${index}`}><span>{OFFICIAL_SECONDARY_BY_ID[card.cardId as OfficialSecondaryId]?.name ?? card.cardId}</span><strong>{tr(card.label)}</strong></li>)}</ul></details>}
  </section>
}

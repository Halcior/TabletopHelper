import type { BattleSession } from '../../domain/battle/types'
import { getCurrentRivalPlayerId } from '../../rulesets/cauldronFFA3/rivalRotation'
import { isOfficialFfa } from '../../rulesets/cauldronFFA3/officialSecondaryFFA'
import type { SecondaryId } from '../../rulesets/cauldronFFA3/secondaryTypes'
import { InfoDisclosure } from '../ui/InfoDisclosure'
import { rivalIdentity, secondaryScope } from './rivalPresentation'
import './rivalClarity.css'

export function RivalHelp() {
  return <InfoDisclosure label="Why can my Secondary Rival be different?" className="rival-help">
    <p>Current Rival changes every battle round. Each Secondary card keeps the Rival assigned when it was drawn, even after the round changes.</p>
    <p>Target Rival identifies whose units, zone or objectives the condition uses. Some cards use an assigned rival only for scoring timing; their conditions can still check both enemy armies.</p>
  </InfoDisclosure>
}

export function CurrentRivalPanel({ session, playerId }: { session: BattleSession; playerId: string }) {
  const rivalId = getCurrentRivalPlayerId(session, playerId)
  return <div className="current-rival" aria-label="Current Rival for Primary">
    <span className="eyebrow">Current Rival — Round {session.state.round}</span>
    <strong>{rivalIdentity(session, rivalId)}</strong>
    <small>Your Primary Rival for this battle round. Changes at the start of the next round.</small>
    {isOfficialFfa(session) && <RivalHelp />}
  </div>
}

export function SecondaryScope({ session, playerId, cardId }: { session: BattleSession; playerId: string; cardId: SecondaryId }) {
  const scope = secondaryScope(session, playerId, cardId)
  if (!scope) return null
  return <div className="secondary-scope" aria-label="Secondary card scope">
    <strong className="secondary-scope__label">{scope.label}</strong>
    {scope.conditionScope && <small>{scope.conditionScope}</small>}
    {scope.assignment && <small>{scope.assignment}</small>}
    <small className="secondary-scope__timing"><b>Score at:</b> {scope.timing}</small>
    {scope.difference && <small className="secondary-scope__difference">{scope.difference}</small>}
  </div>
}

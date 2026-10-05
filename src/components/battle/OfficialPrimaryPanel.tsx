import type { BattleSession } from '../../domain/battle/types'
import {
  getOfficialPrimaryMarkers, getOfficialPrimaryMission, getOfficialPrimaryRival,
} from '../../rulesets/cauldronFFA3/officialPrimary'
import { usesBalancedFfaPrimary } from '../../rulesets/cauldronFFA3/officialPrimaryBalance'

export function OfficialPrimaryPanel({ session, playerId }: { session: BattleSession; playerId: string }) {
  const definition = getOfficialPrimaryMission(session, playerId)
  const balanced = usesBalancedFfaPrimary(session)
  const markers = getOfficialPrimaryMarkers(session, playerId)
  const rival = getOfficialPrimaryRival(session, playerId)
  return <section className="panel official-primary-panel" aria-label={`${session.state.players[playerId]?.name} Primary mission`}>
    <div className="section-heading"><div><span className="eyebrow">11th edition Primary · {balanced ? 'Balanced FFA' : 'FFA adaptation'}</span><h2>{definition.name}</h2></div><strong>{session.state.players[playerId]?.score.primary ?? 0} / 45 VP</strong></div>
    {balanced && <p className="context-note">FFA-adjusted VP values. Follow the scoring below for this battle; your selected mission keeps its conditions and timing.</p>}
    <p className="context-note">Current Rival: {rival.name} · {rival.homeObjectiveId} · Battle Round {session.state.round}. Primary opponent/enemy references use this Rival for enemy HOME, territory, comparisons and destroyed units. Secondary cards retain their own assigned Rival.</p>
    <ul>{definition.rules.map((rule) => <li key={rule}>{rule}</li>)}</ul>
    {markers.length > 0 && <p className="context-note">Operation markers: {markers.join(', ')}</p>}
    <a href={definition.url} target="_blank" rel="noreferrer">Read original card ↗</a>
  </section>
}

import { t as tr } from '../../features/i18n/locale'
import type { BattleSession } from '../../domain/battle/types'
import {
  getOfficialPrimaryMarkers, getOfficialPrimaryMission, getOfficialPrimaryRival,
} from '../../rulesets/cauldronFFA3/officialPrimary'
import { usesBalancedFfaPrimary } from '../../rulesets/cauldronFFA3/officialPrimaryBalance'
import { InfoDisclosure } from '../ui/InfoDisclosure'
import { CurrentRivalPanel } from './RivalClarity'

export function OfficialPrimaryPanel({ session, playerId }: { session: BattleSession; playerId: string }) {
  const definition = getOfficialPrimaryMission(session, playerId)
  const balanced = usesBalancedFfaPrimary(session)
  const markers = getOfficialPrimaryMarkers(session, playerId)
  const rival = getOfficialPrimaryRival(session, playerId)
  return <section className="panel official-primary-panel" aria-label={tr(`${session.state.players[playerId]?.name} Primary mission`, "{0} Primary mission")}>
    <div className="section-heading"><div><span className="eyebrow">{tr("11th edition Primary · ")}{balanced ? tr('Balanced FFA') : tr('FFA adaptation')}</span><h2>{definition.name}</h2></div><strong>{session.state.players[playerId]?.score.primary ?? 0} {tr(" / 45 VP")}</strong></div>
    <CurrentRivalPanel session={session} playerId={playerId} />
    <InfoDisclosure label={tr("Primary conditions & scoring")}>
    {balanced && <p className="context-note">{tr("FFA-adjusted VP values. Follow the scoring below for this battle; your selected mission keeps its conditions and timing.")}</p>}
    <p className="context-note">{tr("Battle Round ")}{session.state.round}{tr(". Primary opponent/enemy references use ")}{rival.homeObjectiveId} {tr(" and this Rival’s territory, comparisons and destroyed units.")}</p>
    <ul>{definition.rules.map((rule) => <li key={rule}>{tr(rule)}</li>)}</ul>
    <a href={definition.url} target="_blank" rel="noreferrer">{tr("Read original card ↗")}</a>
    </InfoDisclosure>
    {markers.length > 0 && <p className="context-note">{tr("Operation markers: ")}{markers.join(', ')}</p>}
  </section>
}

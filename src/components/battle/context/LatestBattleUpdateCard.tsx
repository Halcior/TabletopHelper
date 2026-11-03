import { t as tr } from '../../../features/i18n/locale'
import { useBattleStore } from '../../../stores/battleStore'
import { getSharedRuntimeMembership } from '../../../multiplayer/sharedRuntime'
import type { BattleSession } from '../../../domain/battle/types'
import { buildLatestBattleUpdate } from '../../../domain/context'

export function LatestBattleUpdateCard({ session }: { session: BattleSession }) {
  const undo = useBattleStore((state) => state.undo)
  const shared = getSharedRuntimeMembership()?.battleId === session.setup.gameId
  const update = buildLatestBattleUpdate(session)
  if (!update) return null

  return <div><details className="latest-battle-update" aria-live="polite">
    <summary className="latest-battle-update__heading">
      <div>
        <span className="eyebrow">{tr("Latest table update")}</span>
        <h3>{tr(update.title, update.title.includes(' · casualty recorded') ? '{0} · casualty recorded' : undefined)}</h3>
      </div>
      <span className="latest-battle-update__toggle">{tr("Details")}</span>
    </summary>
    <div className="latest-battle-update__body">
      <p>{tr(update.detail)}</p>
      {update.consequences.length > 0 && <div className="latest-battle-update__effects">
        <span>{tr("Automatic effects")}</span>
        <ul>{update.consequences.map((effect) => <li key={effect}>{tr(effect)}</li>)}</ul>
      </div>}
    </div>
  </details>
    {!shared && session.state.events.some((event) => event.actionId === update.actionId && event.type.startsWith('UNIT_')) && update.actionId === session.state.events.at(-1)?.actionId && session.state.events.at(-1)?.undoable && <button onClick={undo}>{tr("Undo last combat action")}</button>}
    {shared && session.state.events.at(-1)?.type === 'UNIT_COMBAT_RESOLVED' && <small>{tr("Corrections: room host → Correct battle state.")}</small>}
  </div>
}

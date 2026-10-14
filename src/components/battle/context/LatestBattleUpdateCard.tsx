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
        <span className="eyebrow">Latest table update</span>
        <h3>{update.title}</h3>
      </div>
      <span className="latest-battle-update__toggle">Details</span>
    </summary>
    <div className="latest-battle-update__body">
      <p>{update.detail}</p>
      {update.consequences.length > 0 && <div className="latest-battle-update__effects">
        <span>Automatic effects</span>
        <ul>{update.consequences.map((effect) => <li key={effect}>{effect}</li>)}</ul>
      </div>}
    </div>
  </details>
    {!shared && session.state.events.some((event) => event.actionId === update.actionId && event.type.startsWith('UNIT_')) && update.actionId === session.state.events.at(-1)?.actionId && session.state.events.at(-1)?.undoable && <button onClick={undo}>Undo last combat action</button>}
    {shared && session.state.events.at(-1)?.type === 'UNIT_COMBAT_RESOLVED' && <small>Corrections: room host → Correct battle state.</small>}
  </div>
}

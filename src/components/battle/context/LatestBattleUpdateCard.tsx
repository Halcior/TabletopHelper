import type { BattleSession } from '../../../domain/battle/types'
import { buildLatestBattleUpdate } from '../../../domain/context'

export function LatestBattleUpdateCard({ session }: { session: BattleSession }) {
  const update = buildLatestBattleUpdate(session)
  if (!update) return null

  return <details className="latest-battle-update" aria-live="polite">
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
}

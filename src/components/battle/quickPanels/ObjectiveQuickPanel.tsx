import type { BattleEventInput, BattleSession } from '../../../domain/battle/types'
import { QuickObjectiveControls } from '../QuickObjectiveControls'

export function ObjectiveQuickPanel({
  session,
  dispatch,
  onClose,
}: {
  session: BattleSession
  dispatch: (event: BattleEventInput) => void
  onClose: () => void
}) {
  return <div className="quick-panel-layer" role="presentation" onMouseDown={(event) => {
    if (event.currentTarget === event.target) onClose()
  }}>
    <aside className="quick-panel" role="dialog" aria-modal="true" aria-label="Quick objective control">
      <div className="quick-panel__heading"><div><span className="eyebrow">Live battle state</span><h2>Quick objectives</h2></div><button onClick={onClose}>Close</button></div>
      <QuickObjectiveControls session={session} dispatch={dispatch} />
      <p className="context-note">Changes update Objective and Secondary context immediately.</p>
    </aside>
  </div>
}

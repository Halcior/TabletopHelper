import { t as tr } from '../../../features/i18n/locale'
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
    <aside className="quick-panel" role="dialog" aria-modal="true" aria-label={tr("Quick objective control")}>
      <div className="quick-panel__heading"><div><span className="eyebrow">{tr("Live battle state")}</span><h2>{tr("Quick objectives")}</h2></div><button onClick={onClose}>{tr("Close")}</button></div>
      <QuickObjectiveControls session={session} dispatch={dispatch} />
      <p className="context-note">{tr("Changes update Objective and Secondary context immediately.")}</p>
    </aside>
  </div>
}

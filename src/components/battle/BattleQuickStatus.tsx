import { t as tr } from '../../features/i18n/locale'
import { useState } from 'react'
import type { BattleSession } from '../../domain/battle/types'
import { CAULDRON_RULESET_ID } from '../../rulesets/cauldronFFA3'
import { useBattleStore } from '../../stores/battleStore'
import { QuickObjectiveControls } from './QuickObjectiveControls'
import { SecondaryDrawReveal } from './SecondaryDrawReveal'

export function BattleQuickStatus({
  session,
  onOpenObjectives,
}: {
  session: BattleSession
  onOpenObjectives: () => void
}) {
  const [quickEditOpen, setQuickEditOpen] = useState(false)
  const dispatch = useBattleStore((state) => state.dispatch)
  const mulliganSecondary = useBattleStore((state) => state.mulliganSecondary)
  const objectives = Object.values(session.state.objectives)
    .sort((left, right) => Number(left.type === 'home') - Number(right.type === 'home'))

  return (
    <div className="battle-quick-stack">
      {session.setup.rulesetId === CAULDRON_RULESET_ID && <SecondaryDrawReveal
        session={session}
        playerId={session.state.activePlayerId}
        onMulligan={mulliganSecondary}
      />}
      <section className="panel quick-status-panel">
        <div className="section-heading">
          <div><span className="eyebrow">{tr("Board")}</span><h2>{tr("Objectives")}</h2></div>
          <div className="quick-status-actions">
            <button className={quickEditOpen ? 'button button--small selected' : 'button button--small'} aria-expanded={quickEditOpen} onClick={() => setQuickEditOpen((open) => !open)}>{quickEditOpen ? tr('Done') : tr('Edit')}</button>
            <button className="button button--small" onClick={onOpenObjectives}>{tr("Details")}</button>
          </div>
        </div>
        {quickEditOpen
          ? <QuickObjectiveControls session={session} dispatch={dispatch} />
          : <ul className="quick-objective-list">
            {objectives.map((objective) => {
              const controller = objective.controllerPlayerId
                ? session.state.players[objective.controllerPlayerId]?.name ?? tr('Unknown')
                : tr('Uncontrolled')
              const controllerIndex = objective.controllerPlayerId
                ? session.state.turnOrder.indexOf(objective.controllerPlayerId)
                : -1
              return <li className={`objective-chip objective-chip--player-${controllerIndex}`} key={objective.id}>
                <strong>{objective.name}</strong>
                <span className="objective-controller"><i aria-hidden="true" />{controller}</span>
              </li>
            })}
          </ul>}
      </section>
    </div>
  )
}

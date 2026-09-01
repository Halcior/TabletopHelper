import type { BattleEventInput, BattleSession } from '../../domain/battle/types'
import { getPhaseGuidance } from '../../rulesets/generic/guidance'
import { CAULDRON_RULESET_ID, getCauldronReminders } from '../../rulesets/cauldronFFA3'

type PhaseGuidanceProps = {
  session: BattleSession
  dispatch: (event: BattleEventInput) => void
}

export function PhaseGuidance({ session, dispatch }: PhaseGuidanceProps) {
  const activePlayer = session.state.players[session.state.activePlayerId]
  const baseReminders = session.setup.rulesetId === CAULDRON_RULESET_ID
    ? getCauldronReminders(session)
    : getPhaseGuidance(session.state.phase, session.setup.guidanceLevel)
  const actionReminders = (session.state.phase === 'SHOOTING' || session.state.phase === 'CHARGE')
    ? Object.values(session.state.missionActions)
      .filter((action) => action.playerId === activePlayer.id && action.status === 'ACTIVE')
      .map((action) => ({
        id: `mission-action-${action.id}`,
        title: `${action.name} is in progress`,
        detail: session.state.phase === 'SHOOTING'
          ? 'The acting unit cannot Shoot.'
          : 'The acting unit cannot declare a charge.',
        state: 'attention' as const,
        status: 'Restriction',
      }))
    : []
  const reminders = [...actionReminders, ...baseReminders]
  return (
    <section className="panel guidance-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Current phase</span>
          <h2>Things to remember</h2>
        </div>
        {session.state.phase === 'COMMAND' && (
          <button
            className="button button--small button--gold"
            onClick={() => dispatch({ type: 'CP_GAINED', payload: { playerId: activePlayer.id, amount: 1 } })}
          >+1 CP</button>
        )}
      </div>
      <ul className="reminder-list">
        {reminders.map((reminder) => <li className={`reminder reminder--${reminder.state}`} key={reminder.id}>
          <span className="reminder__icon" aria-hidden="true">{{ complete: '✓', action: '○', attention: '!', info: 'i' }[reminder.state]}</span>
          <span className="reminder__copy"><strong>{reminder.title}</strong>{reminder.detail && <small>{reminder.detail}</small>}</span>
          <span className="reminder__status">{reminder.status}</span>
        </li>)}
      </ul>
    </section>
  )
}

import type { BattleEventInput, BattleSession } from '../../domain/battle/types'
import { getPhaseGuidance } from '../../rulesets/generic/guidance'
import { CAULDRON_RULESET_ID, getCauldronReminders } from '../../rulesets/cauldronFFA3'

type PhaseGuidanceProps = {
  session: BattleSession
  dispatch: (event: BattleEventInput) => void
}

export function PhaseGuidance({ session, dispatch }: PhaseGuidanceProps) {
  const activePlayer = session.state.players[session.state.activePlayerId]
  const reminders = session.setup.rulesetId === CAULDRON_RULESET_ID
    ? getCauldronReminders(session)
    : getPhaseGuidance(session.state.phase, session.setup.guidanceLevel)
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
        {reminders.map((reminder) => <li key={reminder}>{reminder}</li>)}
      </ul>
    </section>
  )
}

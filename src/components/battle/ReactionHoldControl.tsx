import { useState } from 'react'
import type { BattlePhase } from '../../domain/battle/types'
import type { TimingTrigger } from '../../domain/stratagems/types'

type ReactionPlayer = {
  id: string
  name: string
}

type TriggerChoice = {
  trigger: TimingTrigger
  label: string
  detail: string
}

const COMMON_CHOICES: TriggerChoice[] = [
  { trigger: 'MODEL_DESTROYED', label: 'Model destroyed', detail: 'A model has just been removed.' },
  { trigger: 'UNIT_DESTROYED', label: 'Unit destroyed', detail: 'A unit has just been destroyed.' },
  { trigger: 'BATTLESHOCK_RESOLVED', label: 'Battle-shock resolved', detail: 'A Battle-shock test has just resolved.' },
  { trigger: 'OBJECTIVE_CONTROL_CHANGED', label: 'Objective control changed', detail: 'Control of an objective has just changed.' },
]

function phaseChoices(phase: BattlePhase): TriggerChoice[] {
  switch (phase) {
    case 'COMMAND': return [
      { trigger: 'PHASE_START', label: 'Start of Command phase', detail: 'Use only while the phase-start timing is still current.' },
      ...COMMON_CHOICES,
    ]
    case 'MOVEMENT': return [
      { trigger: 'UNIT_SELECTED_TO_MOVE', label: 'Unit selected to move', detail: 'The active player selected a unit to make a move.' },
      { trigger: 'UNIT_FINISHED_MOVE', label: 'Unit finished a move', detail: 'The active unit has just completed its move.' },
      ...COMMON_CHOICES,
    ]
    case 'SHOOTING': return [
      { trigger: 'UNIT_SELECTED_TO_SHOOT', label: 'Unit selected to shoot', detail: 'The active player selected a unit to shoot.' },
      { trigger: 'UNIT_SELECTED_AS_TARGET', label: 'Unit selected as target', detail: 'A target has just been selected.' },
      { trigger: 'SHOOTING_ATTACK_DECLARED', label: 'Shooting attack declared', detail: 'A shooting attack has just been declared.' },
      { trigger: 'SHOOTING_ATTACK_RESOLVED', label: 'Shooting attack resolved', detail: 'A shooting attack has just finished resolving.' },
      ...COMMON_CHOICES,
    ]
    case 'CHARGE': return [
      { trigger: 'CHARGE_DECLARED', label: 'Charge declared', detail: 'A charge has just been declared.' },
      { trigger: 'CHARGE_ROLL_MADE', label: 'Charge roll made', detail: 'The charge roll has just been made.' },
      { trigger: 'CHARGE_COMPLETED', label: 'Charge completed', detail: 'The charge move has just completed.' },
      ...COMMON_CHOICES,
    ]
    case 'FIGHT': return [
      { trigger: 'UNIT_SELECTED_TO_FIGHT', label: 'Unit selected to fight', detail: 'A unit has just been selected to fight.' },
      { trigger: 'MELEE_TARGET_SELECTED', label: 'Melee target selected', detail: 'A melee target has just been selected.' },
      { trigger: 'FIGHT_RESOLVED', label: 'Fight resolved', detail: 'The unit has just finished resolving its attacks.' },
      ...COMMON_CHOICES,
    ]
    case 'END_TURN': return COMMON_CHOICES
  }
}

export function ReactionHoldControl({
  phase,
  activePlayerName,
  players,
  sharedMode = false,
  viewerPlayerId = null,
  disabled = false,
  onHold,
}: {
  phase: BattlePhase
  activePlayerName: string
  players: ReactionPlayer[]
  sharedMode?: boolean
  viewerPlayerId?: string | null
  disabled?: boolean
  onHold: (playerId: string, trigger: TimingTrigger) => void
}) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const visiblePlayers = sharedMode
    ? players.filter((player) => player.id === viewerPlayerId)
    : players
  const selectedPlayer = players.find((player) => player.id === selectedPlayerId)
  const choices = phaseChoices(phase)

  if (visiblePlayers.length === 0) return null

  return <>
    <section className="panel reaction-hold-control">
      <div className="section-heading">
        <div><span className="eyebrow">Opponent timing</span><h2>HOLD / REACT</h2></div>
      </div>
      <p>Pause {activePlayerName}'s flow when a reaction timing occurs, then identify the tabletop moment.</p>
      <div className="reaction-hold-control__buttons">
        {visiblePlayers.map((player) => <button
          className="button button--small"
          disabled={disabled}
          key={player.id}
          onClick={() => setSelectedPlayerId(player.id)}
        >HOLD · {player.name}</button>)}
      </div>
    </section>

    {selectedPlayer && <div className="quick-panel-layer" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) setSelectedPlayerId(null)
    }}>
      <aside className="quick-panel reaction-timing-picker" role="dialog" aria-modal="true" aria-label="Choose reaction timing">
        <div className="quick-panel__heading">
          <div><span className="eyebrow">{selectedPlayer.name} requested HOLD</span><h2>What just happened?</h2></div>
          <button onClick={() => setSelectedPlayerId(null)}>Cancel</button>
        </div>
        <p className="context-note">Pick the closest structured timing. This does not resolve attacks or dice; it only opens the correct reaction checkpoint.</p>
        <div className="reaction-timing-picker__choices">
          {choices.map((choice) => <button key={choice.trigger} onClick={() => {
            onHold(selectedPlayer.id, choice.trigger)
            setSelectedPlayerId(null)
          }}>
            <strong>{choice.label}</strong>
            <span>{choice.detail}</span>
          </button>)}
          <button onClick={() => {
            onHold(selectedPlayer.id, 'CUSTOM_CONFIRMATION')
            setSelectedPlayerId(null)
          }}>
            <strong>Other / manual timing</strong>
            <span>Pause first and confirm the exact rule at the table.</span>
          </button>
        </div>
      </aside>
    </div>}
  </>
}

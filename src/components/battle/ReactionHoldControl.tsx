import { useState } from 'react'
import type { BattlePhase, BattleSession } from '../../domain/battle/types'
import {
  getReactionContextRequirements,
  reactionContextIsComplete,
} from '../../domain/stratagems/reactionContext'
import type {
  ReactionContext,
  ReactionMoveType,
  StratagemDefinitionsByPlayer,
  TimingTrigger,
} from '../../domain/stratagems/types'

type ReactionPlayer = {
  id: string
  name: string
}

type TriggerChoice = {
  trigger: TimingTrigger
  label: string
  detail: string
}

type UnitChoice = {
  key: string
  playerId: string
  playerName: string
  unitId: string
  unitName: string
  keywords: string[]
  destroyed: boolean
}

const COMMON_CHOICES: TriggerChoice[] = [
  { trigger: 'MODEL_DESTROYED', label: 'Model destroyed', detail: 'A model has just been removed.' },
  { trigger: 'UNIT_DESTROYED', label: 'Unit destroyed', detail: 'A unit has just been destroyed.' },
  { trigger: 'BATTLESHOCK_RESOLVED', label: 'Battle-shock resolved', detail: 'A Battle-shock test has just resolved.' },
  { trigger: 'OBJECTIVE_CONTROL_CHANGED', label: 'Objective control changed', detail: 'Control of an objective has just changed.' },
]

const MOVE_TYPES: Array<{ value: ReactionMoveType; label: string }> = [
  { value: 'normal', label: 'Normal move' },
  { value: 'advance', label: 'Advance' },
  { value: 'fall-back', label: 'Fall Back' },
  { value: 'charge', label: 'Charge move' },
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

function getUnitChoices(session: BattleSession): UnitChoice[] {
  return session.state.turnOrder.flatMap((playerId) => {
    const player = session.state.players[playerId]
    const army = player.armyId ? session.setup.armies[player.armyId] : undefined
    if (!army) return []
    return army.units.map((unit) => ({
      key: `${playerId}::${unit.id}`,
      playerId,
      playerName: player.name,
      unitId: unit.id,
      unitName: unit.name,
      keywords: [...new Set([...unit.keywords, ...unit.categories])],
      destroyed: player.units[unit.id]?.destroyed ?? false,
    }))
  })
}

export function ReactionHoldControl({
  phase,
  activePlayerName,
  players,
  session,
  definitionsByPlayer,
  sharedMode = false,
  viewerPlayerId = null,
  disabled = false,
  onHold,
}: {
  phase: BattlePhase
  activePlayerName: string
  players: ReactionPlayer[]
  session: BattleSession
  definitionsByPlayer: StratagemDefinitionsByPlayer
  sharedMode?: boolean
  viewerPlayerId?: string | null
  disabled?: boolean
  onHold: (playerId: string, trigger: TimingTrigger, context?: ReactionContext) => void
}) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [pendingChoice, setPendingChoice] = useState<TriggerChoice | null>(null)
  const [triggerSubjectKey, setTriggerSubjectKey] = useState('')
  const [targetKey, setTargetKey] = useState('')
  const [moveType, setMoveType] = useState<ReactionMoveType | ''>('')
  const visiblePlayers = sharedMode
    ? players.filter((player) => player.id === viewerPlayerId)
    : players
  const selectedPlayer = players.find((player) => player.id === selectedPlayerId)
  const choices = phaseChoices(phase)
  const units = getUnitChoices(session)
  const requirements = selectedPlayer && pendingChoice
    ? getReactionContextRequirements(definitionsByPlayer[selectedPlayer.id] ?? [], phase, pendingChoice.trigger)
    : null

  if (visiblePlayers.length === 0) return null

  function resetDialog() {
    setSelectedPlayerId(null)
    setPendingChoice(null)
    setTriggerSubjectKey('')
    setTargetKey('')
    setMoveType('')
  }

  function startTiming(choice: TriggerChoice) {
    if (!selectedPlayer) return
    const nextRequirements = getReactionContextRequirements(
      definitionsByPlayer[selectedPlayer.id] ?? [],
      phase,
      choice.trigger,
    )
    const needsContext = nextRequirements.requiresTriggerSubject
      || nextRequirements.requiresMoveType
      || nextRequirements.requiresTargetUnit
    if (!needsContext) {
      onHold(selectedPlayer.id, choice.trigger, { actingPlayerId: session.state.activePlayerId })
      resetDialog()
      return
    }
    setPendingChoice(choice)
  }

  function submitStructuredHold() {
    if (!selectedPlayer || !pendingChoice || !requirements) return
    const subject = units.find((unit) => unit.key === triggerSubjectKey)
    const target = units.find((unit) => unit.key === targetKey)
    const context: ReactionContext = {
      actingPlayerId: session.state.activePlayerId,
      ...(subject ? {
        triggerSubjectPlayerId: subject.playerId,
        triggerSubjectUnitId: subject.unitId,
      } : {}),
      ...(moveType ? { moveType } : {}),
      ...(target ? {
        targetPlayerId: target.playerId,
        targetUnitId: target.unitId,
        targetKeywords: target.keywords,
      } : {}),
    }
    if (!reactionContextIsComplete(requirements, context)) return
    onHold(selectedPlayer.id, pendingChoice.trigger, context)
    resetDialog()
  }

  function submitManualHold() {
    if (!selectedPlayer) return
    onHold(selectedPlayer.id, 'CUSTOM_CONFIRMATION', { actingPlayerId: session.state.activePlayerId })
    resetDialog()
  }

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
          onClick={() => {
            setSelectedPlayerId(player.id)
            setPendingChoice(null)
          }}
        >HOLD · {player.name}</button>)}
      </div>
    </section>

    {selectedPlayer && <div className="quick-panel-layer" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) resetDialog()
    }}>
      <aside className="quick-panel reaction-timing-picker" role="dialog" aria-modal="true" aria-label="Choose reaction timing">
        <div className="quick-panel__heading">
          <div>
            <span className="eyebrow">{selectedPlayer.name} requested HOLD</span>
            <h2>{pendingChoice ? 'Add tabletop context' : 'What just happened?'}</h2>
          </div>
          <button onClick={resetDialog}>Cancel</button>
        </div>

        {!pendingChoice ? <>
          <p className="context-note">Pick the closest structured timing. This does not resolve attacks or dice; it only opens the correct reaction checkpoint.</p>
          <div className="reaction-timing-picker__choices">
            {choices.map((choice) => <button key={choice.trigger} onClick={() => startTiming(choice)}>
              <strong>{choice.label}</strong>
              <span>{choice.detail}</span>
            </button>)}
            <button onClick={submitManualHold}>
              <strong>Other / manual timing</strong>
              <span>Pause first and confirm the exact rule at the table.</span>
            </button>
          </div>
        </> : requirements && <>
          <p className="context-note">
            {pendingChoice.label}. The matched structured reaction data needs a little more table state before legality can be checked.
          </p>
          <div className="reaction-context-form">
            {requirements.requiresTriggerSubject && <label>
              <span>Which unit triggered this timing?</span>
              <select value={triggerSubjectKey} onChange={(event) => setTriggerSubjectKey(event.target.value)}>
                <option value="">Select unit…</option>
                {units.map((unit) => <option key={`subject-${unit.key}`} value={unit.key}>
                  {unit.playerName} · {unit.unitName}{unit.destroyed ? ' · destroyed' : ''}
                </option>)}
              </select>
            </label>}

            {requirements.requiresMoveType && <fieldset>
              <legend>What kind of move was it?</legend>
              <div className="reaction-context-form__move-types">
                {MOVE_TYPES.map((option) => <button
                  className={moveType === option.value ? 'selected' : ''}
                  key={option.value}
                  type="button"
                  onClick={() => setMoveType(option.value)}
                >{option.label}</button>)}
              </div>
            </fieldset>}

            {requirements.requiresTargetUnit && <label>
              <span>Which unit is the Stratagem target?</span>
              <select value={targetKey} onChange={(event) => setTargetKey(event.target.value)}>
                <option value="">Select target…</option>
                {units.map((unit) => <option key={`target-${unit.key}`} value={unit.key}>
                  {unit.playerName} · {unit.unitName}{unit.destroyed ? ' · destroyed' : ''}
                </option>)}
              </select>
              <small>Keywords are read from the imported army and checked by the Timing Engine.</small>
            </label>}
          </div>

          <div className="reaction-context-summary">
            <span>{requirements.matchingDefinitionIds.length} structured reaction{requirements.matchingDefinitionIds.length === 1 ? '' : 's'} matched this timing.</span>
            <span>No attack or dice result is calculated here.</span>
          </div>

          <div className="reaction-context-actions">
            <button type="button" onClick={() => setPendingChoice(null)}>Back</button>
            <button type="button" onClick={submitManualHold}>Use manual HOLD</button>
            <button
              className="button--gold"
              type="button"
              disabled={!reactionContextIsComplete(requirements, {
                triggerSubjectPlayerId: units.find((unit) => unit.key === triggerSubjectKey)?.playerId,
                triggerSubjectUnitId: units.find((unit) => unit.key === triggerSubjectKey)?.unitId,
                moveType: moveType || undefined,
                targetPlayerId: units.find((unit) => unit.key === targetKey)?.playerId,
                targetUnitId: units.find((unit) => unit.key === targetKey)?.unitId,
                targetKeywords: units.find((unit) => unit.key === targetKey)?.keywords,
              })}
              onClick={submitStructuredHold}
            >Open structured HOLD</button>
          </div>
        </>}
      </aside>
    </div>}
  </>
}

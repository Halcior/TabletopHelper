import { useEffect, useState } from 'react'
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
  onHoldStart,
  onHoldRefine,
  onHoldCancel,
}: {
  phase: BattlePhase
  activePlayerName: string
  players: ReactionPlayer[]
  session: BattleSession
  definitionsByPlayer: StratagemDefinitionsByPlayer
  sharedMode?: boolean
  viewerPlayerId?: string | null
  disabled?: boolean
  onHoldStart: (playerId: string) => void
  onHoldRefine: (reactionWindowId: string, playerId: string, trigger: TimingTrigger, context?: ReactionContext) => void
  onHoldCancel: (reactionWindowId: string) => void
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
  const activeWindowId = session.state.timing.activeReactionWindowId
  const activeWindow = activeWindowId ? session.state.timing.reactionWindows[activeWindowId] : undefined
  const draftHold = activeWindow?.status === 'OPEN' && activeWindow.context.holdDraft === true
    ? activeWindow
    : undefined
  const choices = phaseChoices(phase)
  const units = getUnitChoices(session)
  const requirements = selectedPlayer && pendingChoice
    ? getReactionContextRequirements(definitionsByPlayer[selectedPlayer.id] ?? [], phase, pendingChoice.trigger)
    : null

  useEffect(() => {
    const requester = draftHold?.requestedByPlayerId
    if (!requester || selectedPlayerId || !visiblePlayers.some((player) => player.id === requester)) return
    setSelectedPlayerId(requester)
  }, [draftHold?.id, draftHold?.requestedByPlayerId, selectedPlayerId, visiblePlayers])

  if (visiblePlayers.length === 0) return null

  function clearDialog() {
    setSelectedPlayerId(null)
    setPendingChoice(null)
    setTriggerSubjectKey('')
    setTargetKey('')
    setMoveType('')
  }

  function cancelHold() {
    if (activeWindow?.status === 'OPEN' && activeWindow.requestedByPlayerId === selectedPlayerId) {
      onHoldCancel(activeWindow.id)
    }
    clearDialog()
  }

  function startHold(playerId: string) {
    const existingDraft = draftHold?.requestedByPlayerId === playerId
    setSelectedPlayerId(playerId)
    setPendingChoice(null)
    if (!existingDraft) onHoldStart(playerId)
  }

  function refine(trigger: TimingTrigger, context: ReactionContext) {
    if (!selectedPlayer || !activeWindow || activeWindow.status !== 'OPEN') return
    if (activeWindow.requestedByPlayerId !== selectedPlayer.id) return
    onHoldRefine(activeWindow.id, selectedPlayer.id, trigger, {
      ...context,
      actingPlayerId: session.state.activePlayerId,
      holdDraft: false,
    })
    clearDialog()
  }

  function startTiming(choice: TriggerChoice) {
    if (!selectedPlayer || !activeWindow) return
    const nextRequirements = getReactionContextRequirements(
      definitionsByPlayer[selectedPlayer.id] ?? [],
      phase,
      choice.trigger,
    )
    const needsContext = nextRequirements.requiresTriggerSubject
      || nextRequirements.requiresMoveType
      || nextRequirements.requiresTargetUnit
    if (!needsContext) {
      refine(choice.trigger, {})
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
    refine(pendingChoice.trigger, context)
  }

  function submitManualHold() {
    refine('CUSTOM_CONFIRMATION', {})
  }

  return <>
    <section className="panel reaction-hold-control">
      <div className="section-heading">
        <div><span className="eyebrow">Opponent timing</span><h2>HOLD / REACT</h2></div>
      </div>
      <p>HOLD pauses {activePlayerName} immediately. Then identify the tabletop moment while the battle flow stays stopped.</p>
      <div className="reaction-hold-control__buttons">
        {visiblePlayers.map((player) => {
          const continuingDraft = draftHold?.requestedByPlayerId === player.id
          return <button
            className="button button--small"
            disabled={disabled && !continuingDraft}
            key={player.id}
            onClick={() => startHold(player.id)}
          >{continuingDraft ? `Continue HOLD · ${player.name}` : `HOLD · ${player.name}`}</button>
        })}
      </div>
    </section>

    {selectedPlayer && <div className="quick-panel-layer" role="presentation">
      <aside className="quick-panel reaction-timing-picker" role="dialog" aria-modal="true" aria-label="Choose reaction timing">
        <div className="quick-panel__heading">
          <div>
            <span className="eyebrow">{selectedPlayer.name} · battle paused</span>
            <h2>{pendingChoice ? 'Add tabletop context' : 'What just happened?'}</h2>
          </div>
          <button onClick={cancelHold}>Cancel HOLD</button>
        </div>

        {!activeWindow || activeWindow.requestedByPlayerId !== selectedPlayer.id
          ? <p className="context-note">Capturing HOLD… the timing picker will unlock as soon as the pause is recorded.</p>
          : !pendingChoice ? <>
            <p className="context-note">The battle is already paused. Pick the closest structured timing; this does not resolve attacks or dice.</p>
            <div className="reaction-timing-picker__choices">
              {choices.map((choice) => <button key={choice.trigger} onClick={() => startTiming(choice)}>
                <strong>{choice.label}</strong>
                <span>{choice.detail}</span>
              </button>)}
              <button onClick={submitManualHold}>
                <strong>Other / manual timing</strong>
                <span>Keep the pause and confirm the exact rule at the table.</span>
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
              <span>Battle remains paused until this HOLD is used, passed or cancelled.</span>
            </div>

            <div className="reaction-context-actions">
              <button type="button" onClick={() => setPendingChoice(null)}>Back</button>
              <button type="button" onClick={submitManualHold}>Use manual timing</button>
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
              >Set structured timing</button>
            </div>
          </>}
      </aside>
    </div>}
  </>
}

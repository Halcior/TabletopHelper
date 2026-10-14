import { useState } from 'react'
import type { BattleSession } from '../../domain/battle/types'
import type { ReactionContext, ReactionPolicy, StratagemDefinitionsByPlayer, TimingTrigger } from '../../domain/stratagems/types'
import { getAvailableStratagems } from '../../domain/stratagems/timingEngine'
import type { UseStratagemInput } from '../../domain/stratagems/battleIntegration'

/** Direct optional stratagem entry. Opening or dismissing it never pauses a turn. */
export function OpponentStratagems({ session, definitionsByPlayer, viewerPlayerId, sharedMode, reactionPolicy, onUse }: {
  session: BattleSession; definitionsByPlayer: StratagemDefinitionsByPlayer; viewerPlayerId: string | null
  sharedMode: boolean; reactionPolicy?: ReactionPolicy; onUse: (input: UseStratagemInput) => void
}) {
  const players = session.setup.players.filter((player) => player.id !== session.state.activePlayerId && (!sharedMode || player.id === viewerPlayerId))
  const [chosenPlayer, setChosenPlayer] = useState('')
  const playerId = players.some((player) => player.id === chosenPlayer) ? chosenPlayer : players[0]?.id ?? ''
  const definitions = (definitionsByPlayer[playerId] ?? []).filter((definition) => (definition.phases.includes('ANY') || definition.phases.includes(session.state.phase)))
  const [chosenDefinition, setChosenDefinition] = useState('')
  const definition = definitions.find((item) => item.id === chosenDefinition) ?? definitions[0]
  const [chosenTrigger, setChosenTrigger] = useState<TimingTrigger>('CUSTOM_CONFIRMATION')
  const trigger = definition?.triggers.includes(chosenTrigger) ? chosenTrigger : definition?.triggers[0] ?? 'CUSTOM_CONFIRMATION'
  const [subject, setSubject] = useState('')
  const [target, setTarget] = useState('')
  const [moveType, setMoveType] = useState<ReactionContext['moveType']>()
  const units = session.setup.players.flatMap((player) => (session.setup.armies[player.armyId ?? '']?.units ?? []).map((unit) => ({ key: JSON.stringify([player.id, unit.id]), playerId: player.id, playerName: player.name, unit })))
  const acting = units.find((item) => item.key === subject)
  const targeted = units.find((item) => item.key === target)
  const context: ReactionContext = { actingPlayerId: session.state.activePlayerId, triggerSubjectPlayerId: acting?.playerId, triggerSubjectUnitId: acting?.unit.id, targetPlayerId: targeted?.playerId, targetUnitId: targeted?.unit.id, targetKeywords: targeted ? [...targeted.unit.categories, ...targeted.unit.keywords] : undefined, moveType }
  const option = definition ? getAvailableStratagems({ playerId, gameState: session.state, trigger, context, definitions: [definition], reactionOnly: true, reactionPolicy })[0] : undefined
  if (!players.length) return null
  return <details className="opponent-stratagems panel"><summary>Opponent Stratagems</summary>
    <p>Confirm the actual tabletop timing before use.</p>
    {!sharedMode && <label><span>Commander</span><select value={playerId} onChange={(event) => setChosenPlayer(event.target.value)}>{players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>}
    <label><span>Stratagem</span><select value={definition?.id ?? ''} onChange={(event) => setChosenDefinition(event.target.value)}>{definitions.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.cpCost} CP</option>)}</select></label>
    {definition && <>
      <label><span>Timing</span><select value={trigger} onChange={(event) => setChosenTrigger(event.target.value as TimingTrigger)}>{definition.triggers.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select></label>
      <label><span>Triggering unit</span><select value={subject} onChange={(event) => setSubject(event.target.value)}><option value="">Choose if required…</option>{units.map((item) => <option key={item.key} value={item.key}>{item.playerName} · {item.unit.name}</option>)}</select></label>
      <label><span>Stratagem target</span><select value={target} onChange={(event) => setTarget(event.target.value)}><option value="">Choose if required…</option>{units.map((item) => <option key={item.key} value={item.key}>{item.playerName} · {item.unit.name}</option>)}</select></label>
      <label><span>Move type</span><select value={moveType ?? ''} onChange={(event) => setMoveType(event.target.value as ReactionContext['moveType'])}><option value="">Not applicable</option><option value="normal">Normal move</option><option value="advance">Advance</option><option value="fall-back">Fall back</option><option value="charge">Charge</option></select></label>
      {!option?.canUse && <p>{option?.reasons.join(' ')}</p>}
      <button disabled={!option?.canUse || Boolean(session.state.timing.activeReactionWindowId)} onClick={() => onUse({ playerId, definition, trigger, context, reactionPolicy })}>Confirm timing & use Stratagem</button>
    </>}
  </details>
}

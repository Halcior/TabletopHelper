import type { BattleSession } from '../../domain/battle/types'
import type { GuidanceReminder } from '../generic/guidance'
import { getOperationalPlanState } from './operationalPlans'
import { getOfficialPrimaryId, isOfficialPrimary, OFFICIAL_PRIMARY_MISSIONS } from './officialPrimary'
import { getDuelMission, isDuelPrimary } from './duelPrimary'
import { getCurrentRivalPlayerId } from './rivalRotation'
import { isCauldronEndOfRound } from './session'

function commandPointRecordedThisTurn(session: BattleSession): boolean {
  let turnStartIndex = -1
  for (let index = session.state.events.length - 1; index >= 0; index -= 1) {
    if (session.state.events[index].type === 'TURN_STARTED') {
      turnStartIndex = index
      break
    }
  }
  return session.state.events.slice(turnStartIndex + 1).some((event) => (
    event.type === 'CP_GAINED' && event.payload.playerId === session.state.activePlayerId
  ))
}

export function getCauldronReminders(session: BattleSession): GuidanceReminder[] {
  const activeId = session.state.activePlayerId
  const rivalId = getCurrentRivalPlayerId(session, activeId)
  const rival = session.state.players[rivalId]
  const officialPrimary = isOfficialPrimary(session) || isDuelPrimary(session)
  const plan = officialPrimary ? null : getOperationalPlanState(session, activeId)
  const guided = session.setup.guidanceLevel === 'guided'

  if (session.state.phase === 'COMMAND') {
    const cpRecorded = commandPointRecordedThisTurn(session)
    const reminders: GuidanceReminder[] = [{
      id: 'command-cp',
      title: cpRecorded ? '+1 CP recorded' : 'Gain +1 CP',
      detail: cpRecorded ? 'Command phase gain is in the battle log.' : 'Command phase',
      state: cpRecorded ? 'complete' : 'action',
      status: cpRecorded ? 'Done' : 'Player action',
    }]
    if (plan && !plan.changed) reminders.push({
      id: 'change-plan',
      title: 'Change Operational Plan',
      detail: 'Free · once per battle · no Plan VP this round',
      state: 'action',
      status: 'Available',
    })
    if (guided && session.state.turnOrder[0] === activeId) reminders.push({
      id: 'round-snapshot',
      title: 'Round snapshot captured',
      detail: 'Objectives and Rivals saved automatically.',
      state: 'complete',
      status: 'Automatic',
    })
    return reminders
  }
  if (session.state.phase === 'MOVEMENT') return guided
    ? [
      { id: 'movement-state', title: 'Update reserves and mission positions', state: 'action', status: 'Player action' },
      { id: 'movement-actions', title: 'Check physical Mission Actions', detail: 'Start or cancel when applicable.', state: 'info', status: 'Information' },
    ]
    : [{ id: 'movement-checks', title: 'Reserves and Mission Actions', state: 'action', status: 'Check now' }]
  if (session.state.phase === 'SHOOTING') return [
    ...(officialPrimary ? [{ id: 'primary-action', title: isDuelPrimary(session) ? getDuelMission(session, activeId).name : OFFICIAL_PRIMARY_MISSIONS[getOfficialPrimaryId(session, activeId)].name, detail: 'Check any Primary Objective Actions in this phase and confirm completed actions at turn end.', state: 'info' as const, status: 'Information' }] : []),
    ...(!officialPrimary ? [{ id: 'shooting-rival', title: `Casualties against ${rival.name} advance Wyniszczenie`, detail: 'Only current Rival casualties count this round.', state: 'attention' as const, status: 'Important' }] : []),
    { id: 'shooting-record', title: 'Record casualties after rolling', detail: 'Use the Army tab for models, wounds, or destroyed units.', state: 'action', status: 'Player action' },
  ]
  if (session.state.phase === 'CHARGE') return [{ id: 'charge-resolve', title: 'Resolve charges and Charge abilities', state: 'action', status: 'Player action' }]
  if (session.state.phase === 'FIGHT') return [
    { id: 'fight-casualties', title: 'Attribute casualties to the correct attacker', detail: `${rival.name} is the current Rival.`, state: 'attention', status: 'Important' },
    { id: 'fight-abilities', title: 'Check Fight and once-per-battle abilities', state: 'action', status: 'Player action' },
  ]
  return officialPrimary
    ? [{ id: 'primary-review', title: 'Review your 11th edition Primary', detail: 'Score the selected mission at the end of your turn.', state: 'attention', status: 'Required' }]
    : isCauldronEndOfRound(session)
    ? [
      { id: 'round-review', title: 'Review objectives and Operational Plans', detail: 'Required before committing Primary score.', state: 'attention', status: 'Required' },
      { id: 'round-casualties', title: 'Confirm net Rival casualties', detail: 'Used for Wyniszczenie.', state: 'info', status: 'Information' },
    ]
    : [{ id: 'turn-review', title: 'Confirm objective control and mission state', detail: 'Then pass to the next player.', state: 'attention', status: 'Check now' }]
}

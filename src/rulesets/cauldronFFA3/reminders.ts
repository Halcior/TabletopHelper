import type { BattleSession } from '../../domain/battle/types'
import { getOperationalPlanState } from './operationalPlans'
import { getCurrentRivalPlayerId } from './rivalRotation'
import { isCauldronEndOfRound } from './session'

export function getCauldronReminders(session: BattleSession): string[] {
  const activeId = session.state.activePlayerId
  const rivalId = getCurrentRivalPlayerId(session, activeId)
  const rival = session.state.players[rivalId]
  const plan = getOperationalPlanState(session, activeId)
  const guided = session.setup.guidanceLevel === 'guided'

  if (session.state.phase === 'COMMAND') {
    const reminders = [
      `Current Rival: ${rival.name}.`,
      'Gain +1 CP for the Command phase.',
    ]
    if (!plan.changed) reminders.push('Once-per-battle Operational Plan change remains available for 1 CP.')
    if (guided && session.state.turnOrder[0] === activeId) reminders.push('Round Start objective and Rival snapshots were captured automatically.')
    return reminders
  }
  if (session.state.phase === 'MOVEMENT') return guided
    ? ['Update reserves and mission-relevant positions.', 'Start or cancel any physical Mission Action when applicable.']
    : ['Reserves and Mission Actions.']
  if (session.state.phase === 'SHOOTING') return [
    `Only casualties caused against ${rival.name} advance Wyniszczenie this round.`,
    'Resolve attacks with physical dice, then record resulting casualties or wounds.',
  ]
  if (session.state.phase === 'CHARGE') return ['Resolve physical charges and Charge phase abilities.']
  if (session.state.phase === 'FIGHT') return [
    `Current Rival: ${rival.name}. Attribute resulting casualties to the correct attacker.`,
    'Check Fight phase and manually tracked once-per-battle abilities.',
  ]
  return isCauldronEndOfRound(session)
    ? ['Review all objective controllers and Operational Plans before committing Primary.', 'Wyniszczenie uses net casualties against each player’s current Rival.']
    : ['Review objective control and mission state before passing to the next player.']
}

import type { BattlePhase, GuidanceLevel } from '../../domain/battle/types'

export type ReminderState = 'complete' | 'action' | 'attention' | 'info'

export type GuidanceReminder = {
  id: string
  title: string
  detail?: string
  state: ReminderState
  status: string
}

type PhaseGuidance = Record<BattlePhase, GuidanceReminder[]>

const guided: PhaseGuidance = {
  COMMAND: [
    { id: 'command-cp', title: 'Gain Command phase CP', detail: 'When granted by your mission or ruleset.', state: 'action', status: 'Player action' },
    { id: 'command-abilities', title: 'Resolve Battle-shock and Command abilities', state: 'attention', status: 'Check now' },
    { id: 'command-objectives', title: 'Review objectives, mission actions, and reserves', state: 'info', status: 'Information' },
  ],
  MOVEMENT: [
    { id: 'movement-models', title: 'Move models on the table', detail: 'Then update reserves and objective state here.', state: 'action', status: 'Player action' },
    { id: 'movement-actions', title: 'Check mission actions', detail: 'Start or cancel actions when applicable.', state: 'info', status: 'Information' },
  ],
  SHOOTING: [
    { id: 'shooting-resolve', title: 'Resolve attacks with physical dice', detail: 'Unit details provide quick reference.', state: 'info', status: 'Information' },
    { id: 'shooting-casualties', title: 'Record resulting casualties and wounds', state: 'action', status: 'Player action' },
  ],
  CHARGE: [
    { id: 'charge-resolve', title: 'Resolve charges and Charge abilities', state: 'action', status: 'Player action' },
  ],
  FIGHT: [
    { id: 'fight-abilities', title: 'Check Fight phase abilities', detail: 'Include once-per-battle abilities before attacks.', state: 'attention', status: 'Check now' },
    { id: 'fight-casualties', title: 'Record casualties after combat', state: 'action', status: 'Player action' },
  ],
  END_TURN: [
    { id: 'end-scoring', title: 'Resolve end-of-turn scoring and actions', state: 'attention', status: 'Check now' },
    { id: 'end-objectives', title: 'Confirm objective control', detail: 'Before passing to the next player.', state: 'action', status: 'Player action' },
  ],
}

const fast: PhaseGuidance = {
  COMMAND: [{ id: 'command-checks', title: 'CP, Battle-shock, active objectives', state: 'action', status: 'Check now' }],
  MOVEMENT: [{ id: 'movement-checks', title: 'Reserves and mission actions', state: 'info', status: 'Information' }],
  SHOOTING: [{ id: 'shooting-casualties', title: 'Record casualties and wounds', state: 'action', status: 'Player action' }],
  CHARGE: [{ id: 'charge-abilities', title: 'Check Charge abilities', state: 'info', status: 'Information' }],
  FIGHT: [{ id: 'fight-checks', title: 'Fight abilities and casualties', state: 'action', status: 'Check now' }],
  END_TURN: [{ id: 'end-checks', title: 'Scoring and objective control', state: 'attention', status: 'Check now' }],
}

export function getPhaseGuidance(phase: BattlePhase, level: GuidanceLevel): GuidanceReminder[] {
  return (level === 'guided' ? guided : fast)[phase]
}

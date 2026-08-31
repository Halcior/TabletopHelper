import type { BattlePhase, GuidanceLevel } from '../../domain/battle/types'

type PhaseGuidance = Record<BattlePhase, string[]>

const guided: PhaseGuidance = {
  COMMAND: [
    'Gain Command phase CP if your mission or ruleset grants it.',
    'Resolve Battle-shock and Command phase abilities.',
    'Review active objectives, mission actions, and reserves.',
  ],
  MOVEMENT: [
    'Move models physically, then update reserve and objective state here.',
    'Check whether any mission action can start or is interrupted.',
  ],
  SHOOTING: [
    'Use unit details for quick reference; resolve all attacks with physical dice.',
    'Record only resulting model losses, wounds, and destroyed units.',
  ],
  CHARGE: [
    'Resolve charges on the table and check Charge phase abilities.',
  ],
  FIGHT: [
    'Check once-per-battle and Fight phase abilities before resolving attacks.',
    'Record resulting casualties after physical combat is complete.',
  ],
  END_TURN: [
    'Resolve end-of-turn scoring and incomplete mission actions.',
    'Review objective control before passing to the next player.',
  ],
}

const fast: PhaseGuidance = {
  COMMAND: ['CP, Battle-shock, active objectives.'],
  MOVEMENT: ['Reserves and mission actions.'],
  SHOOTING: ['Record resulting casualties and wounds.'],
  CHARGE: ['Charge phase abilities.'],
  FIGHT: ['Fight abilities and resulting casualties.'],
  END_TURN: ['Scoring and objective control.'],
}

export function getPhaseGuidance(phase: BattlePhase, level: GuidanceLevel): string[] {
  return (level === 'guided' ? guided : fast)[phase]
}

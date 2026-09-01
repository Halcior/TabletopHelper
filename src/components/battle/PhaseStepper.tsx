import { BATTLE_PHASES, type BattlePhase } from '../../domain/battle/types'

const PHASE_LABELS: Record<BattlePhase, string> = {
  COMMAND: 'Command',
  MOVEMENT: 'Movement',
  SHOOTING: 'Shooting',
  CHARGE: 'Charge',
  FIGHT: 'Fight',
  END_TURN: 'End',
}

export function humanizePhase(phase: BattlePhase): string {
  return PHASE_LABELS[phase]
}

export function PhaseStepper({ phase }: { phase: BattlePhase }) {
  const currentIndex = BATTLE_PHASES.indexOf(phase)
  return (
    <nav className="phase-stepper" aria-label="Turn phase progress">
      <ol>
        {BATTLE_PHASES.map((item, index) => {
          const state = index < currentIndex ? 'completed' : index === currentIndex ? 'current' : 'upcoming'
          return <li className={`phase-step phase-step--${state}`} aria-current={state === 'current' ? 'step' : undefined} key={item}>
            <span aria-hidden="true">{state === 'completed' ? '✓' : index + 1}</span>
            <strong>{PHASE_LABELS[item]}</strong>
          </li>
        })}
      </ol>
    </nav>
  )
}

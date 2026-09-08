import type { AppIconName } from '../AppIcon'
import type { ActiveSecondaryView } from '../../rulesets/cauldronFFA3/secondaryTypes'

export type SecondaryPresentation = {
  icon: AppIconName
  kind: 'control' | 'elimination' | 'maneuver' | 'operation'
  label: string
}

export function getSecondaryPresentation(card: ActiveSecondaryView): SecondaryPresentation {
  if (card.action === 'OPEN_RIVAL_ARMY' || card.action === 'SELECT_TARGET') {
    return { icon: 'eliminate', kind: 'elimination', label: 'Elimination' }
  }
  if (card.action === 'START_MISSION_ACTION') {
    return { icon: 'mission', kind: 'operation', label: 'Mission action' }
  }
  if (['ZA_LINIAMI_WROGA', 'SZEROKI_FRONT', 'ODCIECIE_ODWROTU'].includes(card.cardId)) {
    return { icon: 'movement', kind: 'maneuver', label: 'Maneuver' }
  }
  return { icon: 'target', kind: 'control', label: 'Board control' }
}

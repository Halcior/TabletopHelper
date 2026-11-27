import { t as tr } from '../../features/i18n/locale'
import type { BattleUnitSelection, BattleUnitShortcutProps } from './unitShortcuts'
import './unitShortcuts.css'

export function UnitShortcutActions({ selection, onOpenDatasheet, onOpenDamage }: BattleUnitShortcutProps & { selection: BattleUnitSelection }) {
  if (!onOpenDatasheet && !onOpenDamage) return null
  return <div className="unit-shortcuts" role="group" aria-label={tr('Unit shortcuts')}>
    {onOpenDatasheet && <button type="button" onClick={() => onOpenDatasheet(selection)}>{tr('Datasheet')}</button>}
    {onOpenDamage && <button type="button" onClick={() => onOpenDamage(selection)}>{tr('Record losses')}</button>}
  </div>
}

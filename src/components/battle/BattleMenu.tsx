import { t as tr } from '../../features/i18n/locale'
import { LanguageSettings } from '../../features/i18n/LanguageSettings'
import { useRef, useState } from 'react'
import { CommandPopover } from '../ui/CommandPopover'
import { CommandDialog } from '../ui/CommandDialog'
import type { BattleCorrection, BattleSession } from '../../domain/battle/types'
import { BattleCorrectionDialog } from './BattleCorrectionDialog'

type Confirmation = 'end' | 'abandon' | null

type BattleMenuProps = {
  canEndBattle: boolean
  canManageBattle?: boolean
  session: BattleSession
  endBlockedReason?: string
  canUndoAction?: boolean
  canRedoAction?: boolean
  onOpenTableMode?: () => void
  onOpenLog: () => void
  onOpenReport?: () => void
  onExportReport: () => void
  onUndo?: () => void
  onRedo?: () => void
  onEndBattle: () => void
  onAbandonBattle: () => void
  onApplyCorrection: (correction: BattleCorrection, reason: string) => void
}

export function BattleMenu({
  canEndBattle,
  canManageBattle = true,
  session,
  endBlockedReason,
  canUndoAction = false,
  canRedoAction = false,
  onOpenTableMode,
  onOpenLog,
  onOpenReport,
  onExportReport,
  onUndo,
  onRedo,
  onEndBattle,
  onAbandonBattle,
  onApplyCorrection,
}: BattleMenuProps) {
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState<Confirmation>(null)
  const [correctionOpen, setCorrectionOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  function requestEndBattle() {
    if (!canEndBattle || !canManageBattle) return
    setOpen(false)
    setConfirmation('end')
  }

  function requestAbandonBattle() {
    if (!canManageBattle) return
    setOpen(false)
    setConfirmation('abandon')
  }

  return <>
    <div className="battle-menu" ref={menuRef}>
      <button
        type="button"
        className="battle-menu__trigger"
        aria-label={tr("Open battle menu")}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >•••</button>
      {open && <CommandPopover label={tr("Battle menu")} role="menu" trigger={menuRef} onClose={() => setOpen(false)} className="battle-menu-command">
        <strong>{tr("Battle")}</strong>
        <LanguageSettings />
        {onOpenTableMode && <button type="button" role="menuitem" onClick={() => { setOpen(false); onOpenTableMode() }}>{tr("Table Mode")}</button>}
        <button type="button" role="menuitem" onClick={() => { setOpen(false); onOpenLog() }}>{tr("View battle log")}</button>
        {onOpenReport && <button type="button" role="menuitem" onClick={() => { setOpen(false); onOpenReport() }}>{tr("View Battle Report")}</button>}
        <button type="button" role="menuitem" disabled={!canUndoAction} onClick={() => { setOpen(false); onUndo?.() }}>{tr("Undo last action")}</button>
        <button type="button" role="menuitem" disabled={!canRedoAction} onClick={() => { setOpen(false); onRedo?.() }}>{tr("Redo action")}</button>
        <button type="button" role="menuitem" onClick={() => { setOpen(false); onExportReport() }}>{tr("Export diagnostic report")}</button>
        <button type="button" role="menuitem" disabled={!canManageBattle} onClick={() => { setOpen(false); setCorrectionOpen(true) }}>{tr("Correct battle state")}</button>
        {!canManageBattle && <small className="battle-menu__hint">{tr("Only the shared-session host can record corrections.")}</small>}
        <button type="button" role="menuitem" disabled={!canEndBattle || !canManageBattle} onClick={requestEndBattle}>{tr("End battle")}</button>
        {!canManageBattle && <small className="battle-menu__hint">{tr("Only the shared-session host can end or abandon the battle.")}</small>}
        {canManageBattle && !canEndBattle && endBlockedReason && <small className="battle-menu__hint">{tr(endBlockedReason)}</small>}
        <button type="button" role="menuitem" className="danger-action" disabled={!canManageBattle} onClick={requestAbandonBattle}>{tr("Abandon battle")}</button>
        <small className="battle-menu__hint">{tr("Build ")}{import.meta.env.VITE_BUILD_SHA}</small>
      </CommandPopover>}
    </div>

    {correctionOpen && <BattleCorrectionDialog session={session} onApply={onApplyCorrection} onClose={() => setCorrectionOpen(false)} />}

    {confirmation && <CommandDialog label={confirmation === 'end' ? tr('End battle?') : tr('Abandon this battle?')} onClose={() => setConfirmation(null)}>
      <section
        className="panel battle-confirmation"
      >
        {confirmation === 'end' ? <>
          <span className="eyebrow">{tr("Finish session")}</span>
          <h2 id="battle-confirmation-title">{tr("End battle?")}</h2>
          <p>{tr("This finishes the current game and preserves final VP, scoring, army state and the battle log.")}</p>
          <div className="battle-confirmation__actions">
            <button type="button" onClick={() => setConfirmation(null)}>{tr("Cancel")}</button>
            <button type="button" className="button--gold" onClick={() => { setConfirmation(null); onEndBattle() }}>{tr("End battle")}</button>
          </div>
        </> : <>
          <span className="eyebrow">{tr("Leave session")}</span>
          <h2 id="battle-confirmation-title">{tr("Abandon this battle?")}</h2>
          <p>{tr("The session will be marked as abandoned and will no longer appear as an active battle to resume. Its progress is retained rather than silently deleted.")}</p>
          <div className="battle-confirmation__actions">
            <button type="button" onClick={() => setConfirmation(null)}>{tr("Keep playing")}</button>
            <button type="button" className="button--danger" onClick={() => { setConfirmation(null); onAbandonBattle() }}>{tr("Abandon battle")}</button>
          </div>
        </>}
      </section>
    </CommandDialog>}
  </>
}

import { useEffect, useRef, useState } from 'react'

type Confirmation = 'end' | 'abandon' | null

type BattleMenuProps = {
  canEndBattle: boolean
  endBlockedReason?: string
  onOpenLog: () => void
  onEndBattle: () => void
  onAbandonBattle: () => void
}

export function BattleMenu({
  canEndBattle,
  endBlockedReason,
  onOpenLog,
  onEndBattle,
  onAbandonBattle,
}: BattleMenuProps) {
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState<Confirmation>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOnOutside = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  function requestEndBattle() {
    if (!canEndBattle) return
    setOpen(false)
    setConfirmation('end')
  }

  function requestAbandonBattle() {
    setOpen(false)
    setConfirmation('abandon')
  }

  return <>
    <div className="battle-menu" ref={menuRef}>
      <button
        type="button"
        className="battle-menu__trigger"
        aria-label="Open battle menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >•••</button>
      {open && <div className="battle-menu__popover" role="menu">
        <strong>Battle</strong>
        <button type="button" role="menuitem" onClick={() => { setOpen(false); onOpenLog() }}>View battle log</button>
        <button type="button" role="menuitem" disabled={!canEndBattle} onClick={requestEndBattle}>End battle</button>
        {!canEndBattle && endBlockedReason && <small className="battle-menu__hint">{endBlockedReason}</small>}
        <button type="button" role="menuitem" className="danger-action" onClick={requestAbandonBattle}>Abandon battle</button>
        <small className="battle-menu__hint">Build {import.meta.env.VITE_BUILD_SHA}</small>
      </div>}
    </div>

    {confirmation && <div className="battle-confirmation-backdrop" role="presentation" onMouseDown={() => setConfirmation(null)}>
      <section
        className="panel battle-confirmation"
        role="dialog"
        aria-modal="true"
        aria-labelledby="battle-confirmation-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {confirmation === 'end' ? <>
          <span className="eyebrow">Finish session</span>
          <h2 id="battle-confirmation-title">End battle?</h2>
          <p>This finishes the current game and preserves final VP, scoring, army state and the battle log.</p>
          <div className="battle-confirmation__actions">
            <button type="button" onClick={() => setConfirmation(null)}>Cancel</button>
            <button type="button" className="button--gold" onClick={() => { setConfirmation(null); onEndBattle() }}>End battle</button>
          </div>
        </> : <>
          <span className="eyebrow">Leave session</span>
          <h2 id="battle-confirmation-title">Abandon this battle?</h2>
          <p>The session will be marked as abandoned and will no longer appear as an active battle to resume. Its progress is retained rather than silently deleted.</p>
          <div className="battle-confirmation__actions">
            <button type="button" onClick={() => setConfirmation(null)}>Keep playing</button>
            <button type="button" className="button--danger" onClick={() => { setConfirmation(null); onAbandonBattle() }}>Abandon battle</button>
          </div>
        </>}
      </section>
    </div>}
  </>
}

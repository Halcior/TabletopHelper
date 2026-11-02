import { useState } from 'react'
import type { BattleSession } from '../../domain/battle/types'
import { planQuickUndo } from '../../domain/battle/quickCorrections'
import { useBattleStore } from '../../stores/battleStore'
import { useSharedSessionStore } from '../../multiplayer/sharedSessionStore'
import { BattleCorrectionDialog } from './BattleCorrectionDialog'

export function QuickUndoAction({ session, eventId }: { session: BattleSession; eventId: string }) {
  const membership = useSharedSessionStore(state => state.membership)
  const [manual, setManual] = useState(false)
  const [feedback, setFeedback] = useState('')
  if (membership?.battleId !== session.setup.gameId || !membership.isHost || session.state.events.at(-1)?.id !== eventId || session.state.status !== 'active') return null
  const plan = planQuickUndo(session, eventId)
  function apply() {
    const current = useBattleStore.getState().session
    if (!current) return
    const fresh = planQuickUndo(current, eventId)
    if (!fresh.safe) { setManual(true); return }
    useBattleStore.getState().dispatch(fresh.input)
    setFeedback(useBattleStore.getState().error ?? 'Correction recorded. Original events remain in Chronicle.')
  }
  return <div className="quick-undo-action">
    <button type="button" title={plan.safe ? 'Append a guarded correction; keep history.' : plan.reason} onClick={plan.safe ? apply : () => setManual(true)}>{plan.safe ? 'Undo last action' : 'Correct battle state'}</button>
    {feedback && <small role="status">{feedback}</small>}
    {manual && <BattleCorrectionDialog session={session} onApply={useBattleStore.getState().applyCorrection} onClose={() => setManual(false)} />}
  </div>
}

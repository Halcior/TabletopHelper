import { useState } from 'react'
import { CommandDialog } from '../../components/ui/CommandDialog'
import type { Army } from '../../domain/army/types'
import { deleteRoster } from './repository'
import { syncArmies } from './sync'

export function DeleteRosterButton({ army, owner, disabled = false }: {
  army: Army
  owner: string | null
  disabled?: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function close() {
    if (!busy) setConfirming(false)
  }

  async function remove() {
    setBusy(true)
    setError('')
    try {
      await deleteRoster(army.id, owner)
      setConfirming(false)
      void syncArmies()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  return <>
    <button
      type="button"
      className="button button--small button--danger"
      disabled={disabled || busy}
      onClick={() => { setError(''); setConfirming(true) }}
    >
      Delete army
    </button>
    {confirming && <CommandDialog label={`Delete army: ${army.name}`} onClose={close}>
      <div className="panel battle-confirmation roster-delete-confirmation">
        <h2>Delete “{army.name}”?</h2>
        <p>This removes the roster from your library. Existing battles and their photos are kept.</p>
        {error && <p className="alert alert--danger" role="alert">{error}</p>}
        <div className="roster-actions">
          <button type="button" className="button" disabled={busy} onClick={close}>Cancel</button>
          <button type="button" className="button button--danger" disabled={busy} onClick={() => void remove()}>
            {busy ? 'Deleting…' : 'Confirm delete'}
          </button>
        </div>
      </div>
    </CommandDialog>}
  </>
}

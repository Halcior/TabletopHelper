import { t as tr } from '../i18n/locale'
import { useState } from 'react'
import { errorText, social } from './api'
import { syncArmies } from '../armyLibrary/sync'

export type VisibilityMap = Record<string, 'private' | 'friends'>
export function VisibilityControl({
  owner,
  armyId,
  visibility,
  refresh,
}: {
  owner: string
  armyId: string
  visibility: VisibilityMap | null
  refresh: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const value = visibility?.[armyId] ?? 'private'
  return (
    <div className="army-visibility">
      <span>
        {tr(" Visibility:")}{' '}
        <strong>
          {visibility
            ? value === 'friends'
              ? tr('Friends')
              : tr('Private')
            : tr('Checking…')}
        </strong>
      </span>
      <button
        className="button--small"
        disabled={busy || !visibility}
        onClick={() => {
          setBusy(true)
          setError('')
          void syncArmies(owner)
            .then(() =>
              social(owner, 'visibility', {
                army_id: armyId,
                visibility: value === 'private' ? 'friends' : 'private',
              }),
            )
            .then(refresh)
            .catch((e) => setError(errorText(e)))
            .finally(() => setBusy(false))
        }}
      >
        {busy
          ? tr('Saving…')
          : value === 'friends'
            ? tr('Make Private')
            : tr('Share with Friends')}
      </button>
      {error && <p role="alert">{tr(error)}</p>}
    </div>
  )
}

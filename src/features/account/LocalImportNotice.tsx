import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { liveQuery } from 'dexie'
import { useRosterScope } from '../armyLibrary/scope'
import { migrationCandidates } from '../armyLibrary/repository'
import { database } from '../../persistence/storage'
export function LocalImportNotice() {
  const owner = useRosterScope((s) => s.userId)
  const [notice, setNotice] = useState<{ owner: string; count: number }>()
  useEffect(() => {
    if (!owner) return
    const sub = liveQuery(async () => {
      const preference = await database.libraryPreferences.get(owner)
      return preference?.localImportChoice
        ? 0
        : (await migrationCandidates(owner)).length
    }).subscribe({
      next: (count) => setNotice({ owner, count }),
      error: () => setNotice(undefined),
    })
    return () => sub.unsubscribe()
  }, [owner])
  return owner && notice?.owner === owner && notice.count > 0 ? (
    <div className="local-import-notice">
      <span>Found {notice.count} local armies.</span>
      <Link to="/account">Import them to your account?</Link>
    </div>
  ) : null
}

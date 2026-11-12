import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Army } from '../domain/army/types'
import { getArmy } from '../features/armyLibrary/repository'
import { useRosterScope } from '../features/armyLibrary/scope'
import Companion from '../features/companion/Companion'
import { t } from '../features/i18n/locale'

export default function ArmyCompanion() {
  const { armyId } = useParams(), owner = useRosterScope(s => s.userId)
  const [army, setArmy] = useState<Army>(), [error, setError] = useState('')
  useEffect(() => {
    let active = true; setArmy(undefined); setError('')
    if (armyId) getArmy(armyId).then(value => { if (active) { setArmy(value); if (!value) setError(t('Army not found.')) } }).catch(cause => { if (active) setError(String(cause)) })
    return () => { active = false }
  }, [armyId, owner])
  return <main className="page-shell"><Link className="button" to="/armies">← {t('Armies')}</Link>
    {army ? <Companion key={`${owner}:${armyId}`} army={army} /> : <p role="status">{error || t('Loading army…')}</p>}
  </main>
}

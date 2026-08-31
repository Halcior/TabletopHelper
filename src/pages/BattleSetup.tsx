import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { Army } from '../domain/army/types'
import type { GuidanceLevel } from '../domain/battle/types'
import { getArmy } from '../persistence/database'
import { useBattleStore } from '../stores/battleStore'

export default function BattleSetup() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const armyId = params.get('armyId')
  const [army, setArmy] = useState<Army | null>(null)
  const [loadingArmy, setLoadingArmy] = useState(true)
  const [rivalOne, setRivalOne] = useState('Rival II')
  const [rivalTwo, setRivalTwo] = useState('Rival III')
  const [guidance, setGuidance] = useState<GuidanceLevel>('guided')
  const { startBattle, loading, error } = useBattleStore()

  useEffect(() => {
    if (!armyId) { setLoadingArmy(false); return }
    void getArmy(armyId).then((found) => {
      setArmy(found ?? null)
      setLoadingArmy(false)
    }).catch(() => setLoadingArmy(false))
  }, [armyId])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!army) return
    try {
      const battleId = await startBattle(army, [rivalOne, rivalTwo], guidance)
      navigate(`/battle/${battleId}`)
    } catch {
      // The store exposes the persistence error directly in this form.
    }
  }

  if (loadingArmy) return <div className="page-shell"><div className="loading-state">Loading local army…</div></div>
  if (!army) return <div className="page-shell"><div className="empty-state"><h1>Army not found</h1><p>Import or choose a locally stored army first.</p><Link className="button button--gold" to="/army-import">Import army</Link></div></div>

  return (
    <div className="page-shell narrow-page">
      <section className="page-intro"><span className="eyebrow">Guided battle</span><h1>Ready the command console</h1><p>This milestone starts a generic three-player battle. Cauldron scoring and rival rotation remain a separate ruleset milestone.</p></section>
      <form className="panel setup-form" onSubmit={(event) => void submit(event)}>
        <div className="selected-army"><span className="eyebrow">Player I</span><h2>{army.faction}</h2><p>{army.totalPoints} pts · {army.units.length} units</p></div>
        <label>Player II name<input value={rivalOne} onChange={(event) => setRivalOne(event.target.value)} required /></label>
        <label>Player III name<input value={rivalTwo} onChange={(event) => setRivalTwo(event.target.value)} required /></label>
        <label>Guidance level<select value={guidance} onChange={(event) => setGuidance(event.target.value as GuidanceLevel)}>
          <option value="guided">Guided — full contextual reminders</option>
          <option value="fast">Fast — essential reminders only</option>
        </select></label>
        {error && <div className="alert alert--danger">{error}</div>}
        <button className="button button--gold button--wide" disabled={loading}>{loading ? 'Preparing battle…' : 'Start battle'}</button>
      </form>
    </div>
  )
}

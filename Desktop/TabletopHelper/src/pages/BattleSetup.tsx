import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { Army } from '../domain/army/types'
import type { GuidanceLevel } from '../domain/battle/types'
import { listArmies } from '../persistence/database'
import {
  OPERATIONAL_PLAN_DEFINITIONS,
  OPERATIONAL_PLAN_IDS,
  randomDeploymentZones,
  randomTurnPositions,
  type CauldronPlayerInput,
  type DeploymentZone,
  type OperationalPlanId,
  type TurnPosition,
} from '../rulesets/cauldronFFA3'
import { useBattleStore } from '../stores/battleStore'

type PlayerDraft = CauldronPlayerInput

const DEFAULT_PLAYERS: PlayerDraft[] = [
  { id: 'player-a', name: 'Player I', armyId: '', deploymentZone: 'A', turnPosition: 1, operationalPlanId: 'WYNISZCZENIE' },
  { id: 'player-b', name: 'Player II', armyId: '', deploymentZone: 'B', turnPosition: 2, operationalPlanId: 'DECYDUJACE_NATARCIE' },
  { id: 'player-c', name: 'Player III', armyId: '', deploymentZone: 'C', turnPosition: 3, operationalPlanId: 'TWIERDZA' },
]

export default function BattleSetup() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const preferredArmyId = params.get('armyId')
  const [armies, setArmies] = useState<Army[]>([])
  const [players, setPlayers] = useState<PlayerDraft[]>(DEFAULT_PLAYERS)
  const [guidance, setGuidance] = useState<GuidanceLevel>('guided')
  const [loadingArmies, setLoadingArmies] = useState(true)
  const [localError, setLocalError] = useState<string | null>(null)
  const { startCauldronBattle, loading, error } = useBattleStore()

  useEffect(() => {
    void listArmies().then((stored) => {
      const available = stored.map((entry) => entry.army)
      setArmies(available)
      const defaultArmy = available.find((army) => army.id === preferredArmyId) ?? available[0]
      if (defaultArmy) {
        setPlayers((current) => current.map((player) => ({ ...player, armyId: defaultArmy.id })))
      }
      setLoadingArmies(false)
    }).catch((reason: unknown) => {
      setLocalError(reason instanceof Error ? reason.message : String(reason))
      setLoadingArmies(false)
    })
  }, [preferredArmyId])

  function updatePlayer<K extends keyof PlayerDraft>(index: number, key: K, value: PlayerDraft[K]) {
    setPlayers((current) => current.map((player, playerIndex) => (
      playerIndex === index ? { ...player, [key]: value } : player
    )))
  }

  function randomizeZones() {
    const zones = randomDeploymentZones()
    setPlayers((current) => current.map((player, index) => ({ ...player, deploymentZone: zones[index] })))
  }

  function randomizeTurns() {
    const positions = randomTurnPositions()
    setPlayers((current) => current.map((player, index) => ({ ...player, turnPosition: positions[index] })))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLocalError(null)
    if (new Set(players.map((player) => player.deploymentZone)).size !== 3) {
      setLocalError('Assign deployment zones A, B, and C exactly once.')
      return
    }
    if (new Set(players.map((player) => player.turnPosition)).size !== 3) {
      setLocalError('Assign turn positions 1, 2, and 3 exactly once.')
      return
    }
    const selectedArmies = [...new Set(players.map((player) => player.armyId))]
      .map((id) => armies.find((army) => army.id === id))
      .filter((army): army is Army => Boolean(army))
    try {
      const battleId = await startCauldronBattle(players, selectedArmies, guidance)
      navigate(`/battle/${battleId}`)
    } catch {
      // The store exposes the persistence or validation error in this form.
    }
  }

  if (loadingArmies) return <div className="page-shell"><div className="loading-state">Loading saved armies…</div></div>
  if (armies.length === 0) return <div className="page-shell"><div className="empty-state">
    <h1>No saved armies</h1><p>Import at least one army. The same army may temporarily be assigned to all three players.</p>
    <Link className="button button--gold" to="/army-import">Import army</Link>
  </div></div>

  return (
    <div className="page-shell setup-page">
      <section className="page-intro"><span className="eyebrow">Cauldron FFA 3</span><h1>New Cauldron battle</h1>
        <p>Assign three saved armies, deployment zones, fixed turn positions, and Operational Plans. Army definitions are stored once; every player receives an independent battle state.</p>
      </section>
      <form onSubmit={(event) => void submit(event)}>
        <div className="setup-toolbar panel">
          <div><span className="eyebrow">Assignment tools</span><strong>Manual or randomized</strong></div>
          <button type="button" onClick={randomizeZones}>Randomize zones</button>
          <button type="button" onClick={randomizeTurns}>Randomize turn order</button>
        </div>
        <div className="cauldron-player-grid">{players.map((player, index) => (
          <section className="panel player-setup-card" key={player.id}>
            <div className="player-setup-card__title"><span>Player {index + 1}</span><strong>Zone {player.deploymentZone} · Turn {player.turnPosition}</strong></div>
            <label>Player name<input value={player.name} required onChange={(event) => updatePlayer(index, 'name', event.target.value)} /></label>
            <label>Saved army<select value={player.armyId} onChange={(event) => updatePlayer(index, 'armyId', event.target.value)}>
              {armies.map((army) => <option key={army.id} value={army.id}>{army.faction} · {army.totalPoints} pts · {army.name}</option>)}
            </select></label>
            <div className="setup-pair">
              <label>Deployment zone<select value={player.deploymentZone} onChange={(event) => updatePlayer(index, 'deploymentZone', event.target.value as DeploymentZone)}>
                {(['A', 'B', 'C'] as DeploymentZone[]).map((zone) => <option key={zone}>{zone}</option>)}
              </select></label>
              <label>Turn position<select value={player.turnPosition} onChange={(event) => updatePlayer(index, 'turnPosition', Number(event.target.value) as TurnPosition)}>
                {([1, 2, 3] as TurnPosition[]).map((position) => <option key={position}>{position}</option>)}
              </select></label>
            </div>
            <label>Operational Plan<select value={player.operationalPlanId} onChange={(event) => updatePlayer(index, 'operationalPlanId', event.target.value as OperationalPlanId)}>
              {OPERATIONAL_PLAN_IDS.map((planId) => <option key={planId} value={planId}>{OPERATIONAL_PLAN_DEFINITIONS[planId].name}</option>)}
            </select></label>
            <p className="plan-description">{OPERATIONAL_PLAN_DEFINITIONS[player.operationalPlanId].description}</p>
          </section>
        ))}</div>
        <section className="panel setup-footer">
          <label>Guidance level<select value={guidance} onChange={(event) => setGuidance(event.target.value as GuidanceLevel)}>
            <option value="guided">Guided — full contextual reminders</option>
            <option value="fast">Fast — essential reminders only</option>
          </select></label>
          {(localError || error) && <div className="alert alert--danger">{localError ?? error}</div>}
          <button className="button button--gold" disabled={loading}>{loading ? 'Preparing battle…' : 'Start Cauldron battle'}</button>
        </section>
      </form>
    </div>
  )
}

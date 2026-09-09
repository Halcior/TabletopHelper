import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { Army } from '../domain/army/types'
import type { GuidanceLevel } from '../domain/battle/types'
import { listArmies } from '../persistence/database'
import {
  CAULDRON_RULESET_VERSION,
  OPERATIONAL_PLAN_DEFINITIONS,
  OPERATIONAL_PLAN_IDS,
  randomDeploymentZones,
  randomTurnPositions,
  type CauldronMode,
  type CauldronObjectiveLayout,
  type CauldronPlayerInput,
  type DeploymentZone,
  type OperationalPlanId,
  type TurnPosition,
} from '../rulesets/cauldronFFA3'
import { useSharedSessionStore } from '../multiplayer/sharedSessionStore'
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
  const [mode, setMode] = useState<CauldronMode>(params.get('mode') === 'ffa3' ? 'ffa3' : 'duel')
  const [objectiveLayout, setObjectiveLayout] = useState<CauldronObjectiveLayout>('expanded-7')
  const [armies, setArmies] = useState<Army[]>([])
  const [players, setPlayers] = useState<PlayerDraft[]>(DEFAULT_PLAYERS)
  const [guidance, setGuidance] = useState<GuidanceLevel>('guided')
  const [hostPlayerId, setHostPlayerId] = useState(DEFAULT_PLAYERS[0].id)
  const [loadingArmies, setLoadingArmies] = useState(true)
  const [sharedWorking, setSharedWorking] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const { startCauldronBattle, loading, error } = useBattleStore()
  const sharedConfigured = useSharedSessionStore((state) => state.configured)
  const checkBackend = useSharedSessionStore((state) => state.checkBackend)
  const hostCurrentBattle = useSharedSessionStore((state) => state.hostCurrentBattle)
  const activePlayers = useMemo(() => mode === 'duel' ? players.slice(0, 2) : players, [mode, players])

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

  useEffect(() => {
    if (!activePlayers.some((player) => player.id === hostPlayerId)) setHostPlayerId(activePlayers[0]?.id ?? '')
  }, [activePlayers, hostPlayerId])

  function updatePlayer<K extends keyof PlayerDraft>(index: number, key: K, value: PlayerDraft[K]) {
    setPlayers((current) => current.map((player, playerIndex) => (
      playerIndex === index ? { ...player, [key]: value } : player
    )))
  }

  function changeMode(nextMode: CauldronMode) {
    setLocalError(null)
    setMode(nextMode)
    if (nextMode === 'duel') {
      setPlayers((current) => current.map((player, index) => index < 2
        ? {
          ...player,
          deploymentZone: (index === 0 ? 'A' : 'B') as DeploymentZone,
          turnPosition: (index + 1) as TurnPosition,
        }
        : player))
    }
  }

  function randomizeZones() {
    const zones = randomDeploymentZones(mode === 'duel' ? 2 : 3)
    setPlayers((current) => current.map((player, index) => (
      index < zones.length ? { ...player, deploymentZone: zones[index] } : player
    )))
  }

  function randomizeTurns() {
    const positions = randomTurnPositions(mode === 'duel' ? 2 : 3)
    setPlayers((current) => current.map((player, index) => (
      index < positions.length ? { ...player, turnPosition: positions[index] } : player
    )))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLocalError(null)
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    const sharedMode = submitter?.value === 'shared'
    const expectedCount = mode === 'duel' ? 2 : 3
    const allowedZones: DeploymentZone[] = mode === 'duel' ? ['A', 'B'] : ['A', 'B', 'C']
    const allowedTurns: TurnPosition[] = mode === 'duel' ? [1, 2] : [1, 2, 3]

    if (new Set(activePlayers.map((player) => player.deploymentZone)).size !== expectedCount
      || activePlayers.some((player) => !allowedZones.includes(player.deploymentZone))) {
      setLocalError(mode === 'duel'
        ? 'Assign deployment zones A and B exactly once.'
        : 'Assign deployment zones A, B, and C exactly once.')
      return
    }
    if (new Set(activePlayers.map((player) => player.turnPosition)).size !== expectedCount
      || activePlayers.some((player) => !allowedTurns.includes(player.turnPosition))) {
      setLocalError(mode === 'duel'
        ? 'Assign turn positions 1 and 2 exactly once.'
        : 'Assign turn positions 1, 2, and 3 exactly once.')
      return
    }

    const selectedArmies = [...new Set(activePlayers.map((player) => player.armyId))]
      .map((id) => armies.find((army) => army.id === id))
      .filter((army): army is Army => Boolean(army))
    try {
      if (sharedMode) {
        if (!sharedConfigured) throw new Error('Configure Supabase before creating a shared lobby.')
        setSharedWorking(true)
        const backendReady = await checkBackend(true)
        if (!backendReady) {
          throw new Error(useSharedSessionStore.getState().backendCheckMessage ?? 'Supabase connection check failed.')
        }
      }
      const battleId = await startCauldronBattle(
        activePlayers,
        selectedArmies,
        guidance,
        mode === 'duel' ? 'classic-6' : objectiveLayout,
      )
      if (sharedMode) {
        const membership = await hostCurrentBattle(hostPlayerId)
        navigate(`/shared?room=${membership.roomCode}`)
      } else {
        navigate(`/battle/${battleId}`)
      }
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSharedWorking(false)
    }
  }

  if (loadingArmies) return <div className="page-shell"><div className="loading-state">Loading saved armies…</div></div>
  if (armies.length === 0) return <div className="page-shell"><div className="empty-state">
    <h1>No saved armies</h1><p>Import at least one army. The same army may temporarily be assigned to multiple players.</p>
    <Link className="button button--gold" to="/army-import">Import army</Link>
  </div></div>

  const duel = mode === 'duel'

  return (
    <div className="page-shell setup-page">
      <section className="page-intro">
        <span className="eyebrow">Cauldron v{CAULDRON_RULESET_VERSION}</span>
        <h1>{duel ? 'New Cauldron Duel' : 'New Cauldron FFA 3 battle'}</h1>
        <p>{duel
          ? 'The same Cauldron rules, Primary, Secondary cards and Operational Plans you already know — adapted for two players. Your Rival is simply the other commander for the entire battle.'
          : 'Assign three saved armies, deployment zones, fixed turn positions, Operational Plans, and the objective layout used on your table. Rival rotation remains unchanged.'}</p>
      </section>

      <div className="setup-mode-picker panel" role="group" aria-label="Cauldron battle mode">
        <button type="button" className={duel ? 'button--gold' : ''} aria-pressed={duel} onClick={() => changeMode('duel')}>
          <strong>Duel 1v1</strong><span>2 players · same Cauldron rules</span>
        </button>
        <button type="button" className={!duel ? 'button--gold' : ''} aria-pressed={!duel} onClick={() => changeMode('ffa3')}>
          <strong>FFA 3</strong><span>3 players · rotating Rival</span>
        </button>
      </div>

      <form onSubmit={(event) => void submit(event)}>
        <div className="setup-toolbar panel">
          <div><span className="eyebrow">Assignment tools</span><strong>Manual or randomized</strong></div>
          <button type="button" onClick={randomizeZones}>Randomize zones</button>
          <button type="button" onClick={randomizeTurns}>Randomize turn order</button>
        </div>
        <div className={`cauldron-player-grid${duel ? ' cauldron-player-grid--duel' : ''}`}>{activePlayers.map((player, index) => (
          <section className="panel player-setup-card" key={player.id}>
            <div className="player-setup-card__title"><span>Player {index + 1}</span><strong>Zone {player.deploymentZone} · Turn {player.turnPosition}</strong></div>
            <label>Player name<input value={player.name} required onChange={(event) => updatePlayer(index, 'name', event.target.value)} /></label>
            <label>Saved army<select value={player.armyId} onChange={(event) => updatePlayer(index, 'armyId', event.target.value)}>
              {armies.map((army) => <option key={army.id} value={army.id}>{army.faction} · {army.totalPoints} pts · {army.name}</option>)}
            </select></label>
            <div className="setup-pair">
              <label>Deployment zone<select value={player.deploymentZone} onChange={(event) => updatePlayer(index, 'deploymentZone', event.target.value as DeploymentZone)}>
                {(duel ? ['A', 'B'] : ['A', 'B', 'C']).map((zone) => <option key={zone}>{zone}</option>)}
              </select></label>
              <label>Turn position<select value={player.turnPosition} onChange={(event) => updatePlayer(index, 'turnPosition', Number(event.target.value) as TurnPosition)}>
                {(duel ? [1, 2] : [1, 2, 3]).map((position) => <option key={position}>{position}</option>)}
              </select></label>
            </div>
            <label>Operational Plan<select value={player.operationalPlanId} onChange={(event) => updatePlayer(index, 'operationalPlanId', event.target.value as OperationalPlanId)}>
              {OPERATIONAL_PLAN_IDS.map((planId) => <option key={planId} value={planId}>{OPERATIONAL_PLAN_DEFINITIONS[planId].name}</option>)}
            </select></label>
            <p className="plan-description">{OPERATIONAL_PLAN_DEFINITIONS[player.operationalPlanId].description}</p>
          </section>
        ))}</div>
        <section className="panel setup-footer setup-footer--battle-mode">
          <label>Guidance level<select value={guidance} onChange={(event) => setGuidance(event.target.value as GuidanceLevel)}>
            <option value="guided">Guided — full contextual reminders</option>
            <option value="fast">Fast — essential reminders only</option>
          </select></label>
          {!duel && <label>Objective layout<select value={objectiveLayout} onChange={(event) => setObjectiveLayout(event.target.value as CauldronObjectiveLayout)}>
            <option value="expanded-7">7 objectives — 3 HOME + N1/N2/N3 + CENTER</option>
            <option value="classic-6">6 objectives — 3 HOME + N1/N2/N3</option>
          </select></label>}
          <label>Shared host seat<select value={hostPlayerId} onChange={(event) => setHostPlayerId(event.target.value)}>
            {activePlayers.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
          </select></label>
          {duel
            ? <p className="context-note">Duel changes only the player topology: 2 turns per Battle Round, A/B HOME objectives, and a permanent Rival. Primary, Secondary, Operational Plans and scoring caps use the Cauldron {CAULDRON_RULESET_VERSION} balance rules.</p>
            : <p className="context-note">The 7-objective layout treats CENTER as a normal neutral objective, so it counts for Primary, objective Secondaries, Mission Actions and Operational Plans exactly like N1/N2/N3.</p>}
          {(localError || error) && <div className="alert alert--danger">{localError ?? error}</div>}
          <div className="setup-submit-actions">
            <button className="button" type="submit" value="local" disabled={loading || sharedWorking}>{loading && !sharedWorking ? 'Preparing…' : 'Start locally'}</button>
            <button className="button button--gold" type="submit" value="shared" disabled={loading || sharedWorking || !sharedConfigured} title={sharedConfigured ? undefined : 'Configure Supabase first'}>
              {sharedWorking ? 'Checking Supabase…' : `Create ${duel ? '2-player' : '3-player'} lobby`}
            </button>
          </div>
        </section>
      </form>
    </div>
  )
}

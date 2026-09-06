import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { Army } from '../domain/army/types'
import type { GuidanceLevel } from '../domain/battle/types'
import { useSharedSessionStore } from '../multiplayer/sharedSessionStore'
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
import {
  DUEL_DEFAULT_OBJECTIVE_COUNT,
  DUEL_MAX_OBJECTIVES,
  DUEL_MIN_OBJECTIVES,
  randomDuelTurnPositions,
  type DuelPlayerInput,
  type DuelTurnPosition,
} from '../rulesets/duel1v1'
import { useBattleStore } from '../stores/battleStore'

type BattleMode = 'duel' | 'cauldron'
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
  const initialMode: BattleMode = params.get('mode') === 'duel' ? 'duel' : 'cauldron'
  const [mode, setMode] = useState<BattleMode>(initialMode)
  const [armies, setArmies] = useState<Army[]>([])
  const [players, setPlayers] = useState<PlayerDraft[]>(DEFAULT_PLAYERS)
  const [guidance, setGuidance] = useState<GuidanceLevel>('guided')
  const [objectiveCount, setObjectiveCount] = useState(DUEL_DEFAULT_OBJECTIVE_COUNT)
  const [hostPlayerId, setHostPlayerId] = useState(DEFAULT_PLAYERS[0].id)
  const [loadingArmies, setLoadingArmies] = useState(true)
  const [sharedWorking, setSharedWorking] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const { startCauldronBattle, startDuelBattle, loading, error } = useBattleStore()
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

  function changeMode(nextMode: BattleMode) {
    setLocalError(null)
    setMode(nextMode)
    if (nextMode === 'duel') {
      setPlayers((current) => current.map((player, index) => index < 2
        ? { ...player, turnPosition: (index + 1) as TurnPosition }
        : { ...player, turnPosition: 3 }))
    }
  }

  function randomizeZones() {
    const zones = randomDeploymentZones()
    setPlayers((current) => current.map((player, index) => ({ ...player, deploymentZone: zones[index] })))
  }

  function randomizeTurns() {
    if (mode === 'duel') {
      const positions = randomDuelTurnPositions()
      setPlayers((current) => current.map((player, index) => index < 2
        ? { ...player, turnPosition: positions[index] as TurnPosition }
        : { ...player, turnPosition: 3 }))
      return
    }
    const positions = randomTurnPositions()
    setPlayers((current) => current.map((player, index) => ({ ...player, turnPosition: positions[index] })))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLocalError(null)
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    const sharedMode = submitter?.value === 'shared'

    if (mode === 'cauldron') {
      if (new Set(activePlayers.map((player) => player.deploymentZone)).size !== 3) {
        setLocalError('Assign deployment zones A, B, and C exactly once.')
        return
      }
      if (new Set(activePlayers.map((player) => player.turnPosition)).size !== 3) {
        setLocalError('Assign turn positions 1, 2, and 3 exactly once.')
        return
      }
    } else if (
      new Set(activePlayers.map((player) => player.turnPosition)).size !== 2
      || activePlayers.some((player) => player.turnPosition !== 1 && player.turnPosition !== 2)
    ) {
      setLocalError('Assign Duel turn positions 1 and 2 exactly once.')
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

      const battleId = mode === 'duel'
        ? await startDuelBattle(activePlayers.map((player): DuelPlayerInput => ({
          id: player.id,
          name: player.name,
          armyId: player.armyId,
          turnPosition: player.turnPosition as DuelTurnPosition,
        })), selectedArmies, guidance, objectiveCount)
        : await startCauldronBattle(activePlayers, selectedArmies, guidance)

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
        <span className="eyebrow">Battle mode</span>
        <h1>{duel ? 'New Duel 1v1' : 'New Cauldron FFA 3 battle'}</h1>
        <p>{duel
          ? 'Two commanders, fixed turn order for five Battle Rounds, full army/CP/phase/reaction tracking and manual VP scoring. The objective counter is configurable for the mission you are playing.'
          : 'Assign three saved armies, deployment zones, fixed turn positions, and Operational Plans. Army definitions are stored once; every player receives an independent battle state.'}</p>
      </section>

      <div className="setup-mode-picker panel" role="group" aria-label="Battle mode">
        <button type="button" className={duel ? 'button--gold' : ''} aria-pressed={duel} onClick={() => changeMode('duel')}>
          <strong>Duel 1v1</strong><span>2 players · standard battle companion</span>
        </button>
        <button type="button" className={!duel ? 'button--gold' : ''} aria-pressed={!duel} onClick={() => changeMode('cauldron')}>
          <strong>Cauldron FFA 3</strong><span>3 players · Cauldron missions and cards</span>
        </button>
      </div>

      <form onSubmit={(event) => void submit(event)}>
        <div className="setup-toolbar panel">
          <div><span className="eyebrow">Assignment tools</span><strong>Manual or randomized</strong></div>
          {!duel && <button type="button" onClick={randomizeZones}>Randomize zones</button>}
          <button type="button" onClick={randomizeTurns}>Randomize turn order</button>
        </div>

        <div className="cauldron-player-grid">{activePlayers.map((player, index) => (
          <section className="panel player-setup-card" key={player.id}>
            <div className="player-setup-card__title">
              <span>Player {index + 1}</span>
              <strong>{duel ? `Turn ${player.turnPosition}` : `Zone ${player.deploymentZone} · Turn ${player.turnPosition}`}</strong>
            </div>
            <label>Player name<input value={player.name} required onChange={(event) => updatePlayer(index, 'name', event.target.value)} /></label>
            <label>Saved army<select value={player.armyId} onChange={(event) => updatePlayer(index, 'armyId', event.target.value)}>
              {armies.map((army) => <option key={army.id} value={army.id}>{army.faction} · {army.totalPoints} pts · {army.name}</option>)}
            </select></label>
            <div className="setup-pair">
              {!duel && <label>Deployment zone<select value={player.deploymentZone} onChange={(event) => updatePlayer(index, 'deploymentZone', event.target.value as DeploymentZone)}>
                {(['A', 'B', 'C'] as DeploymentZone[]).map((zone) => <option key={zone}>{zone}</option>)}
              </select></label>}
              <label>Turn position<select value={player.turnPosition} onChange={(event) => updatePlayer(index, 'turnPosition', Number(event.target.value) as TurnPosition)}>
                {(duel ? [1, 2] : [1, 2, 3]).map((position) => <option key={position}>{position}</option>)}
              </select></label>
            </div>
            {!duel && <>
              <label>Operational Plan<select value={player.operationalPlanId} onChange={(event) => updatePlayer(index, 'operationalPlanId', event.target.value as OperationalPlanId)}>
                {OPERATIONAL_PLAN_IDS.map((planId) => <option key={planId} value={planId}>{OPERATIONAL_PLAN_DEFINITIONS[planId].name}</option>)}
              </select></label>
              <p className="plan-description">{OPERATIONAL_PLAN_DEFINITIONS[player.operationalPlanId].description}</p>
            </>}
          </section>
        ))}</div>

        <section className="panel setup-footer setup-footer--battle-mode">
          <label>Guidance level<select value={guidance} onChange={(event) => setGuidance(event.target.value as GuidanceLevel)}>
            <option value="guided">Guided — full contextual reminders</option>
            <option value="fast">Fast — essential reminders only</option>
          </select></label>
          {duel && <label>Objective markers<select value={objectiveCount} onChange={(event) => setObjectiveCount(Number(event.target.value))}>
            {Array.from({ length: DUEL_MAX_OBJECTIVES - DUEL_MIN_OBJECTIVES + 1 }, (_, index) => DUEL_MIN_OBJECTIVES + index)
              .map((count) => <option key={count} value={count}>{count}</option>)}
          </select></label>}
          <label>Shared host seat<select value={hostPlayerId} onChange={(event) => setHostPlayerId(event.target.value)}>
            {activePlayers.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
          </select></label>
          {duel && <p className="context-note">Duel 1v1 does not automate a specific tournament mission pack yet. Use the scoreboard for VP and the objective panel for board control; army state, CP, phases, Stratagem timing and reactions are fully tracked.</p>}
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

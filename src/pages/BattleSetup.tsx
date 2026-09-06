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
  DUEL_FIXED_SECONDARY_CARDS,
  DUEL_FORCE_DISPOSITIONS,
  DUEL_MAX_OBJECTIVES,
  DUEL_MIN_OBJECTIVES,
  getDuelPrimaryMissionCard,
  randomDuelTurnPositions,
  type DuelLayoutVariant,
  type DuelPlayerInput,
  type DuelPlayerMissionConfig,
  type DuelSecondaryMode,
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

const DEFAULT_DUEL_MISSIONS: Record<string, DuelPlayerMissionConfig> = {
  'player-a': { forceDispositionId: 'take-and-hold', secondaryMode: 'tactical', fixedSecondaryIds: [], battleReady: true },
  'player-b': { forceDispositionId: 'purge-the-foe', secondaryMode: 'tactical', fixedSecondaryIds: [], battleReady: true },
  'player-c': { forceDispositionId: 'take-and-hold', secondaryMode: 'tactical', fixedSecondaryIds: [], battleReady: true },
}

export default function BattleSetup() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const preferredArmyId = params.get('armyId')
  const initialMode: BattleMode = params.get('mode') === 'duel' ? 'duel' : 'cauldron'
  const [mode, setMode] = useState<BattleMode>(initialMode)
  const [armies, setArmies] = useState<Army[]>([])
  const [players, setPlayers] = useState<PlayerDraft[]>(DEFAULT_PLAYERS)
  const [duelMissions, setDuelMissions] = useState<Record<string, DuelPlayerMissionConfig>>(DEFAULT_DUEL_MISSIONS)
  const [guidance, setGuidance] = useState<GuidanceLevel>('guided')
  const [objectiveCount, setObjectiveCount] = useState(DUEL_DEFAULT_OBJECTIVE_COUNT)
  const [attackerPlayerId, setAttackerPlayerId] = useState(DEFAULT_PLAYERS[0].id)
  const [layoutVariant, setLayoutVariant] = useState<DuelLayoutVariant>('A')
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
    if (!activePlayers.some((player) => player.id === attackerPlayerId)) setAttackerPlayerId(activePlayers[0]?.id ?? '')
  }, [activePlayers, attackerPlayerId, hostPlayerId])

  function updatePlayer<K extends keyof PlayerDraft>(index: number, key: K, value: PlayerDraft[K]) {
    setPlayers((current) => current.map((player, playerIndex) => (
      playerIndex === index ? { ...player, [key]: value } : player
    )))
  }

  function updateDuelMission(playerId: string, patch: Partial<DuelPlayerMissionConfig>) {
    setDuelMissions((current) => ({
      ...current,
      [playerId]: { ...current[playerId], ...patch },
    }))
  }

  function changeDuelSecondaryMode(playerId: string, secondaryMode: DuelSecondaryMode) {
    updateDuelMission(playerId, {
      secondaryMode,
      fixedSecondaryIds: secondaryMode === 'fixed'
        ? DUEL_FIXED_SECONDARY_CARDS.slice(0, 2).map((card) => card.id)
        : [],
    })
  }

  function setFixedSecondary(playerId: string, slot: 0 | 1, cardId: string) {
    const current = duelMissions[playerId]?.fixedSecondaryIds ?? []
    const next = [current[0] ?? '', current[1] ?? '']
    next[slot] = cardId
    updateDuelMission(playerId, { fixedSecondaryIds: next.filter(Boolean) })
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

    if (mode === 'duel') {
      for (const player of activePlayers) {
        const config = duelMissions[player.id]
        if (config.secondaryMode === 'fixed' && (config.fixedSecondaryIds.length !== 2 || new Set(config.fixedSecondaryIds).size !== 2)) {
          setLocalError(`${player.name}: select two different Fixed Secondaries.`)
          return
        }
      }
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
        ? await startDuelBattle(
          activePlayers.map((player): DuelPlayerInput => ({
            id: player.id,
            name: player.name,
            armyId: player.armyId,
            turnPosition: player.turnPosition as DuelTurnPosition,
          })),
          selectedArmies,
          guidance,
          objectiveCount,
          Object.fromEntries(activePlayers.map((player) => [player.id, duelMissions[player.id]])),
          attackerPlayerId,
          layoutVariant,
        )
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
  const duelPrimaryNames = duel ? Object.fromEntries(activePlayers.map((player) => {
    const opponent = activePlayers.find((candidate) => candidate.id !== player.id)
    const ownConfig = duelMissions[player.id]
    const opponentConfig = opponent ? duelMissions[opponent.id] : undefined
    return [player.id, opponentConfig
      ? getDuelPrimaryMissionCard(ownConfig.forceDispositionId, opponentConfig.forceDispositionId)?.name ?? 'Primary mission unavailable'
      : 'Primary mission unavailable']
  })) : {}

  return (
    <div className="page-shell setup-page">
      <section className="page-intro">
        <span className="eyebrow">Battle mode</span>
        <h1>{duel ? 'New Duel 1v1 · 11th Edition' : 'New Cauldron FFA 3 battle'}</h1>
        <p>{duel
          ? 'Chapter Approved 11th Edition: choose Force Dispositions, resolve each player’s directional Primary, and play either Tactical or Fixed Secondaries with the official 45/45 scoring caps.'
          : 'Assign three saved armies, deployment zones, fixed turn positions, and Operational Plans. Army definitions are stored once; every player receives an independent battle state.'}</p>
      </section>

      <div className="setup-mode-picker panel" role="group" aria-label="Battle mode">
        <button type="button" className={duel ? 'button--gold' : ''} aria-pressed={duel} onClick={() => changeMode('duel')}>
          <strong>Duel 1v1</strong><span>2 players · Warhammer 40,000 11th Edition</span>
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

        {duel && <section className="panel duel-mission-global-setup">
          <div><span className="eyebrow">Chapter Approved setup</span><strong>Deployment & layout</strong></div>
          <label>Attacker<select value={attackerPlayerId} onChange={(event) => setAttackerPlayerId(event.target.value)}>
            {activePlayers.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
          </select></label>
          <label>Terrain layout variant<select value={layoutVariant} onChange={(event) => setLayoutVariant(event.target.value as DuelLayoutVariant)}>
            {(['A', 'B', 'C'] as DuelLayoutVariant[]).map((variant) => <option key={variant}>{variant}</option>)}
          </select></label>
          <label>Objective markers<select value={objectiveCount} onChange={(event) => setObjectiveCount(Number(event.target.value))}>
            {Array.from({ length: DUEL_MAX_OBJECTIVES - DUEL_MIN_OBJECTIVES + 1 }, (_, index) => DUEL_MIN_OBJECTIVES + index)
              .map((count) => <option key={count} value={count}>{count}</option>)}
          </select></label>
        </section>}

        <div className={`cauldron-player-grid${duel ? ' cauldron-player-grid--duel' : ''}`}>{activePlayers.map((player, index) => {
          const missionConfig = duelMissions[player.id]
          return <section className="panel player-setup-card" key={player.id}>
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

            {duel ? <div className="duel-player-missions">
              <label>Force Disposition<select value={missionConfig.forceDispositionId} onChange={(event) => updateDuelMission(player.id, { forceDispositionId: event.target.value as DuelPlayerMissionConfig['forceDispositionId'] })}>
                {DUEL_FORCE_DISPOSITIONS.map((disposition) => <option key={disposition.id} value={disposition.id}>{disposition.name}</option>)}
              </select></label>
              <div className="duel-primary-preview"><span>Primary</span><strong>{duelPrimaryNames[player.id]}</strong></div>
              <label>Secondary approach<select value={missionConfig.secondaryMode} onChange={(event) => changeDuelSecondaryMode(player.id, event.target.value as DuelSecondaryMode)}>
                <option value="tactical">Tactical — draw 2 each Command phase</option>
                <option value="fixed">Fixed — choose 2 for the battle</option>
              </select></label>
              {missionConfig.secondaryMode === 'fixed' && <div className="setup-pair">
                {([0, 1] as const).map((slot) => <label key={slot}>Fixed Secondary {slot + 1}<select value={missionConfig.fixedSecondaryIds[slot] ?? ''} onChange={(event) => setFixedSecondary(player.id, slot, event.target.value)}>
                  <option value="">Select…</option>
                  {DUEL_FIXED_SECONDARY_CARDS.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}
                </select></label>)}
              </div>}
              <label className="duel-battle-ready"><input type="checkbox" checked={missionConfig.battleReady} onChange={(event) => updateDuelMission(player.id, { battleReady: event.target.checked })} /> Battle Ready (+10 VP)</label>
            </div> : <>
              <label>Operational Plan<select value={player.operationalPlanId} onChange={(event) => updatePlayer(index, 'operationalPlanId', event.target.value as OperationalPlanId)}>
                {OPERATIONAL_PLAN_IDS.map((planId) => <option key={planId} value={planId}>{OPERATIONAL_PLAN_DEFINITIONS[planId].name}</option>)}
              </select></label>
              <p className="plan-description">{OPERATIONAL_PLAN_DEFINITIONS[player.operationalPlanId].description}</p>
            </>}
          </section>
        })}</div>

        <section className="panel setup-footer setup-footer--battle-mode">
          <label>Guidance level<select value={guidance} onChange={(event) => setGuidance(event.target.value as GuidanceLevel)}>
            <option value="guided">Guided — full contextual reminders</option>
            <option value="fast">Fast — essential reminders only</option>
          </select></label>
          <label>Shared host seat<select value={hostPlayerId} onChange={(event) => setHostPlayerId(event.target.value)}>
            {activePlayers.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
          </select></label>
          {duel && <p className="context-note">The app tracks the full 11th Edition Secondary deck, directional Primary missions, 15 VP round caps, 45 VP game caps, Fixed/Tactical behavior and Battle Ready. Position-dependent conditions are confirmed by the players because the app does not know physical model positions.</p>}
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

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { Army } from '../domain/army/types'
import type { GuidanceLevel } from '../domain/battle/types'
import { listArmies } from '../persistence/database'
import {
  CAULDRON_RULESET_VERSION,
  OPERATIONAL_PLAN_DEFINITIONS,
  OPERATIONAL_PLAN_IDS,
  OFFICIAL_FIXED_IDS,
  OFFICIAL_SECONDARY_BY_ID,
  OFFICIAL_PRIMARY_IDS,
  OFFICIAL_PRIMARY_MISSIONS,
  randomDeploymentZones,
  randomTurnPositions,
  type CauldronMode,
  type CauldronObjectiveLayout,
  type CauldronPlayerInput,
  type DeploymentZone,
  type OperationalPlanId,
  type TurnPosition,
  type SecondaryDeck,
  type OfficialSecondaryStrategy,
  type OfficialSecondaryId,
  type OfficialPrimaryId,
  type PrimaryDeck,
  DISPOSITIONS,
  DISPOSITION_NAMES,
  DUEL_MISSIONS,
  DUEL_PRIMARY_MATRIX,
} from '../rulesets/cauldronFFA3'
import { useSharedSessionStore } from '../multiplayer/sharedSessionStore'
import { useBattleStore } from '../stores/battleStore'

type PlayerDraft = CauldronPlayerInput

const DEFAULT_PLAYERS: PlayerDraft[] = [
  { id: 'player-a', name: 'Player I', armyId: '', deploymentZone: 'A', turnPosition: 1, operationalPlanId: 'WYNISZCZENIE', officialPrimaryId: 'battlefield-dominance', forceDisposition: 'take-and-hold' },
  { id: 'player-b', name: 'Player II', armyId: '', deploymentZone: 'B', turnPosition: 2, operationalPlanId: 'DECYDUJACE_NATARCIE', officialPrimaryId: 'meatgrinder', forceDisposition: 'purge-the-foe' },
  { id: 'player-c', name: 'Player III', armyId: '', deploymentZone: 'C', turnPosition: 3, operationalPlanId: 'TWIERDZA', officialPrimaryId: 'outmanoeuvre' },
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
  const [secondaryDeck, setSecondaryDeck] = useState<SecondaryDeck>('cauldron')
  const [primaryDeck, setPrimaryDeck] = useState<PrimaryDeck>('cauldron')
  const [officialStrategy, setOfficialStrategy] = useState<OfficialSecondaryStrategy>('tactical')
  const [duelStrategies, setDuelStrategies] = useState<Record<string, OfficialSecondaryStrategy>>({ 'player-a': 'tactical', 'player-b': 'tactical' })
  const [officialLayout, setOfficialLayout] = useState<1 | 2 | 3>(1)
  const [fixedSelections, setFixedSelections] = useState<Record<string, [OfficialSecondaryId, OfficialSecondaryId]>>(
    Object.fromEntries(DEFAULT_PLAYERS.map((player) => [player.id, ['OFFICIAL_A_GRIEVOUS_BLOW', 'OFFICIAL_ENGAGE_ON_ALL_FRONTS']])) as Record<string, [OfficialSecondaryId, OfficialSecondaryId]>,
  )
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
    setPrimaryDeck('cauldron')
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
    if (primaryDeck === 'chapter-approved-ffa' && activePlayers.some((player) => player.officialPrimaryId === 'gather-intel') && objectiveLayout !== 'expanded-7') {
      setLocalError('Gather Intel requires the 7-objective layout with CENTER.')
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
        primaryDeck === 'chapter-approved-duel' ? 'chapter-approved' : secondaryDeck,
        officialStrategy,
        (secondaryDeck === 'chapter-approved' && officialStrategy === 'fixed') || (primaryDeck === 'chapter-approved-duel' && Object.values(duelStrategies).includes('fixed')) ? fixedSelections : undefined,
        primaryDeck,
        primaryDeck === 'chapter-approved-duel' ? duelStrategies : undefined,
        primaryDeck === 'chapter-approved-duel' ? officialLayout : undefined,
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
          ? 'Choose the Cauldron Duel or the Chapter Approved 11th edition matrix. In the official duel each commander chooses a Force Disposition and receives their own Primary card.'
          : 'Assign three saved armies, zones and turns. Choose a Primary mode and Secondary deck independently for this battle.'}</p>
      </section>

      <div className="setup-mode-picker panel" role="group" aria-label="Cauldron battle mode">
        <button type="button" className={duel ? 'button--gold' : ''} aria-pressed={duel} onClick={() => changeMode('duel')}>
          <strong>Duel 1v1</strong><span>2 players · Cauldron or Chapter Approved</span>
        </button>
        <button type="button" className={!duel ? 'button--gold' : ''} aria-pressed={!duel} onClick={() => changeMode('ffa3')}>
          <strong>FFA 3</strong><span>3 players · rotating Rival</span>
        </button>
      </div>

      <form onSubmit={(event) => void submit(event)}>
        <div className="panel setup-primary-picker">
          <label>Primary mode<select value={primaryDeck} onChange={(event) => setPrimaryDeck(event.target.value as PrimaryDeck)}>
            <option value="cauldron">Cauldron · objectives + Operational Plan</option>
            {duel ? <option value="chapter-approved-duel">11th edition official Duel · Force Disposition matrix</option> : <option value="chapter-approved-ffa">11th edition FFA · a different Primary for each player</option>}
          </select></label>
          {primaryDeck === 'chapter-approved-ffa' && <p className="context-note">House-rule FFA adaptation of five 11th edition mirror cards. Each player selects a mission below for the whole battle. “Opponent” means either enemy; a comparison must beat both. Primary scores up to 15 VP per round and 45 VP per battle. Operational Plans do not score.</p>}
          {primaryDeck === 'chapter-approved-duel' && <p className="context-note">Official 1v1 matrix: each player chooses a Force Disposition available to their Detachment. Their row against the opponent’s choice determines their own Primary. Use one of three terrain layouts for that pairing. The physical battlefield decides control, actions and markers; confirm each condition at the correct scoring window. 45 Primary + 45 Secondary + 10 Battle Ready VP.</p>}
        </div>
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
            {primaryDeck === 'chapter-approved-duel' && duel ? <>
              <label>Force Disposition<select value={player.forceDisposition} onChange={(event) => updatePlayer(index, 'forceDisposition', event.target.value as typeof DISPOSITIONS[number])}>
                {DISPOSITIONS.map((disposition) => <option key={disposition} value={disposition}>{DISPOSITION_NAMES[disposition]}</option>)}
              </select></label>
              {player.forceDisposition && activePlayers[1 - index]?.forceDisposition && (() => {
                const mission = DUEL_MISSIONS[DUEL_PRIMARY_MATRIX[player.forceDisposition!][activePlayers[1 - index].forceDisposition!]]
                return <p className="plan-description">Your Primary: <strong>{mission.name}</strong> · <a href={mission.url} target="_blank" rel="noreferrer">Full card</a></p>
              })()}
            </> : primaryDeck === 'chapter-approved-ffa' && !duel ? <>
              <label>11th edition Primary<select value={player.officialPrimaryId} onChange={(event) => updatePlayer(index, 'officialPrimaryId', event.target.value as OfficialPrimaryId)}>
                {OFFICIAL_PRIMARY_IDS.map((id) => <option key={id} value={id}>{OFFICIAL_PRIMARY_MISSIONS[id].name}</option>)}
              </select></label>
              {player.officialPrimaryId && <p className="plan-description">{OFFICIAL_PRIMARY_MISSIONS[player.officialPrimaryId].description} <a href={OFFICIAL_PRIMARY_MISSIONS[player.officialPrimaryId].url} target="_blank" rel="noreferrer">Read card</a></p>}
            </> : <><label>Operational Plan<select value={player.operationalPlanId} onChange={(event) => updatePlayer(index, 'operationalPlanId', event.target.value as OperationalPlanId)}>
              {OPERATIONAL_PLAN_IDS.map((planId) => <option key={planId} value={planId}>{OPERATIONAL_PLAN_DEFINITIONS[planId].name}</option>)}
            </select></label>
            <p className="plan-description">{OPERATIONAL_PLAN_DEFINITIONS[player.operationalPlanId].description}</p></>}
            {primaryDeck === 'chapter-approved-duel' && <label>Secondary strategy<select value={duelStrategies[player.id]} onChange={(event) => setDuelStrategies((current) => ({ ...current, [player.id]: event.target.value as OfficialSecondaryStrategy }))}>
              <option value="tactical">Tactical · draw from deck</option><option value="fixed">Fixed · choose two cards</option>
            </select></label>}
            {(primaryDeck === 'chapter-approved-duel' ? duelStrategies[player.id] === 'fixed' : secondaryDeck === 'chapter-approved' && officialStrategy === 'fixed') && <div className="setup-pair">
              {([0, 1] as const).map((slot) => <label key={slot}>Fixed Secondary {slot + 1}
                <select value={fixedSelections[player.id][slot]} onChange={(event) => setFixedSelections((current) => ({
                  ...current,
                  [player.id]: current[player.id].map((id, index) => index === slot ? event.target.value as OfficialSecondaryId : id) as [OfficialSecondaryId, OfficialSecondaryId],
                }))}>
                  {OFFICIAL_FIXED_IDS.map((id) => <option key={id} value={id}>{OFFICIAL_SECONDARY_BY_ID[id].name}</option>)}
                </select>
              </label>)}
            </div>}
          </section>
        ))}</div>
        <section className="panel setup-footer setup-footer--battle-mode">
          {primaryDeck !== 'chapter-approved-duel' && <label>Secondary deck<select value={secondaryDeck} onChange={(event) => setSecondaryDeck(event.target.value as SecondaryDeck)}>
            <option value="cauldron">Cauldron v{CAULDRON_RULESET_VERSION} · 15 cards</option>
            <option value="chapter-approved">Chapter Approved 2026–27 · 18 official cards</option>
          </select></label>}
          {primaryDeck === 'chapter-approved-duel' && <><p className="context-note">Secondary deck: Chapter Approved 2026–27. Each player chooses Tactical or Fixed on their card above. Pick the recommended layout for your pairing. Roll for Attacker/Defender, then roll separately for first turn as described in the <a href="https://assets.warhammer-community.com/eng_12-06_warhammer40000_event_companion-s3bfb5f9s1-ivswuij3fo.pdf" target="_blank" rel="noreferrer">Warhammer Event Companion</a>. Assign A/B HOME to your actual objectives and turn positions to the first-turn roll. The app’s central and expansion names are generic; use the physical layout to identify them.</p><label>Pairing layout<select value={officialLayout} onChange={(event) => setOfficialLayout(Number(event.target.value) as 1 | 2 | 3)}><option value={1}>Layout A</option><option value={2}>Layout B</option><option value={3}>Layout C</option></select></label></>}
          {secondaryDeck === 'chapter-approved' && primaryDeck !== 'chapter-approved-duel' && <>
            <label>Secondary strategy<select value={officialStrategy} onChange={(event) => setOfficialStrategy(event.target.value as OfficialSecondaryStrategy)}>
              <option value="tactical">Tactical · draw two each Command phase</option>
              <option value="fixed">Fixed · choose two eligible cards per player</option>
            </select></label>
            <p className="context-note">{officialStrategy === 'fixed'
              ? 'Fixed: choose two eligible cards for each player. They remain active throughout the battle and each can score up to 20 VP.'
              : 'Tactical: draw two cards at each own Command phase. There is no free general mulligan: once per battle New Orders replaces one card for 1 CP; specific When Drawn cards have their own replacement rules. At your turn end, discard active cards to gain 1 CP.'} Secondary scores up to 15 VP per round and 45 VP per battle. In FFA, opponent and enemy on Secondary cards refer to your current Rival.</p>
          </>}
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
          {secondaryDeck === 'cauldron' && primaryDeck !== 'chapter-approved-duel' && (duel
            ? <p className="context-note">Duel changes only the player topology: 2 turns per Battle Round, A/B HOME objectives, and a permanent Rival. Primary, Secondary, Operational Plans and scoring caps use the Cauldron {CAULDRON_RULESET_VERSION} balance rules.</p>
            : <p className="context-note">The 7-objective layout treats CENTER as a neutral objective. Gather Intel requires CENTER.</p>)}
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

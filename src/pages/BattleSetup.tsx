import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { Army } from '../domain/army/types'
import type { DoublesSetup, GuidanceLevel } from '../domain/battle/types'
import { listArmies } from '../persistence/database'
import {
  CAULDRON_RULESET_VERSION,
  OPERATIONAL_PLAN_DEFINITIONS,
  OPERATIONAL_PLAN_IDS,
  OFFICIAL_FIXED_IDS,
  OFFICIAL_SECONDARY_BY_ID,
  OFFICIAL_PRIMARY_IDS,
  OFFICIAL_PRIMARY_MISSIONS,
  BALANCED_OFFICIAL_PRIMARY_MISSIONS,
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
import { InfoDisclosure } from '../components/ui/InfoDisclosure'

type PlayerDraft = CauldronPlayerInput

const DEFAULT_PLAYERS: PlayerDraft[] = [
  { id: 'player-a', name: 'Player I', armyId: '', deploymentZone: 'A', turnPosition: 1, operationalPlanId: 'WYNISZCZENIE', officialPrimaryId: 'battlefield-dominance', forceDisposition: 'take-and-hold' },
  { id: 'player-b', name: 'Player II', armyId: '', deploymentZone: 'B', turnPosition: 2, operationalPlanId: 'DECYDUJACE_NATARCIE', officialPrimaryId: 'meatgrinder', forceDisposition: 'purge-the-foe' },
  { id: 'player-c', name: 'Player III', armyId: '', deploymentZone: 'C', turnPosition: 3, operationalPlanId: 'TWIERDZA', officialPrimaryId: 'outmanoeuvre', forceDisposition: 'purge-the-foe' },
  { id: 'player-d', name: 'Player IV', armyId: '', deploymentZone: 'B', turnPosition: 2, operationalPlanId: 'TWIERDZA' },
]

export default function BattleSetup() {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const preferredArmyId = params.get('armyId')
  const [mode, setMode] = useState<CauldronMode>(params.get('mode') === 'ffa3' ? 'ffa3' : params.get('mode') === 'doubles2v2' ? 'doubles2v2' : 'duel')
  const [objectiveLayout, setObjectiveLayout] = useState<CauldronObjectiveLayout>('expanded-7')
  const [armies, setArmies] = useState<Army[]>([])
  const [players, setPlayers] = useState<PlayerDraft[]>(DEFAULT_PLAYERS)
  const [guidance, setGuidance] = useState<GuidanceLevel>('guided')
  const [secondaryDeck, setSecondaryDeck] = useState<SecondaryDeck>('cauldron')
  const [primaryDeck, setPrimaryDeck] = useState<PrimaryDeck>('cauldron')
  const [officialStrategy, setOfficialStrategy] = useState<OfficialSecondaryStrategy>('tactical')
  const [duelStrategies, setDuelStrategies] = useState<Record<string, OfficialSecondaryStrategy>>({ 'player-a': 'tactical', 'player-b': 'tactical' })
  const [officialLayout, setOfficialLayout] = useState<1 | 2 | 3>(1)
  const [teamNames, setTeamNames] = useState(['Team Alpha', 'Team Bravo'])
  const [teamTypes, setTeamTypes] = useState<['unified' | 'convenience', 'unified' | 'convenience']>(['convenience', 'convenience'])
  const [teamWarlords, setTeamWarlords] = useState<Record<number, string>>({})
  const [attackerHomeZone, setAttackerHomeZone] = useState<'A' | 'B'>('A')
  const [fixedSelections, setFixedSelections] = useState<Record<string, [OfficialSecondaryId, OfficialSecondaryId]>>(
    Object.fromEntries(DEFAULT_PLAYERS.map((player) => [player.id, ['OFFICIAL_A_GRIEVOUS_BLOW', 'OFFICIAL_ENGAGE_ON_ALL_FRONTS']])) as Record<string, [OfficialSecondaryId, OfficialSecondaryId]>,
  )
  const [hostPlayerId, setHostPlayerId] = useState(DEFAULT_PLAYERS[0].id)
  const [loadingArmies, setLoadingArmies] = useState(true)
  const [sharedWorking, setSharedWorking] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [invalidFieldId, setInvalidFieldId] = useState<string | null>(null)
  const { startCauldronBattle, loading, error } = useBattleStore()
  const sharedConfigured = useSharedSessionStore((state) => state.configured)
  const checkBackend = useSharedSessionStore((state) => state.checkBackend)
  const hostCurrentBattle = useSharedSessionStore((state) => state.hostCurrentBattle)
  const activePlayers = useMemo(() => mode === 'duel' ? players.slice(0, 2) : mode === 'ffa3' ? players.slice(0, 3) : players, [mode, players])
  const doubles = mode === 'doubles2v2'
  const officialPair = mode !== 'ffa3'
  const teamCaptainIndex = (team: number) => team === 0 ? 0 : 2
  const warlordOptions = (team: number) => activePlayers.slice(team * 2, team * 2 + 2).flatMap((player) => {
    const army = armies.find((entry) => entry.id === player.armyId)
    return (army?.units ?? []).filter((unit) => [...unit.categories, ...unit.keywords].some((trait) => trait.toUpperCase() === 'CHARACTER')).map((unit) => ({ value: `${player.id}|${unit.id}`, label: `${player.name} · ${unit.name}` }))
  })
  function getDoublesSetup(): DoublesSetup {
    return { rulesVersion: 'GW-Doubles-1.1', forces: ([0, 1] as const).map((team) => {
      const members = activePlayers.slice(team * 2, team * 2 + 2)
      const choice = teamWarlords[team] && warlordOptions(team).some((entry) => entry.value === teamWarlords[team])
        ? teamWarlords[team] : warlordOptions(team)[0]?.value ?? ''
      const [warlordPlayerId, warlordUnitId] = choice.split('|')
      return { id: team === 0 ? 'team-alpha' : 'team-bravo', name: teamNames[team].trim(),
        memberPlayerIds: [members[0].id, members[1].id], captainPlayerId: members[0].id,
        forceDisposition: members[0].forceDisposition ?? 'take-and-hold', forceType: teamTypes[team],
        warlord: { playerId: warlordPlayerId ?? '', unitId: warlordUnitId ?? '' },
      }
    }) as DoublesSetup['forces'] }
  }

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
    setInvalidFieldId(null)
    setMode(nextMode)
    setPrimaryDeck(nextMode === 'doubles2v2' ? 'chapter-approved-duel' : 'cauldron')
    if (nextMode === 'doubles2v2') setSecondaryDeck('chapter-approved')
    setPlayers((current) => current.map((player, index) => {
      const zone = nextMode === 'doubles2v2' ? (index < 2 ? 'A' : 'B') : ('ABC'[index] ?? 'B')
      const turn = nextMode === 'doubles2v2' ? (index < 2 ? 1 : 2) : index + 1
      return { ...player, deploymentZone: zone as DeploymentZone, turnPosition: turn as TurnPosition }
    }))
  }

  function randomizeZones() {
    const zones = randomDeploymentZones(officialPair ? 2 : 3)
    setPlayers((current) => current.map((player, index) => {
      const zone = doubles ? zones[index < 2 ? 0 : 1] : zones[index]
      return zone ? { ...player, deploymentZone: zone } : player
    }))
  }

  function randomizeTurns() {
    const positions = randomTurnPositions(officialPair ? 2 : 3)
    setPlayers((current) => current.map((player, index) => {
      const position = doubles ? positions[index < 2 ? 0 : 1] : positions[index]
      return position ? { ...player, turnPosition: position } : player
    }))
  }

  function validateCommanders(): boolean {
    const count = doubles ? 4 : mode === 'duel' ? 2 : 3
    const fail = (message: string, index: number, field: string) => {
      const fieldId = `commander-${index}-${field}`
      setLocalError(`Commanders · ${message}`)
      setInvalidFieldId(fieldId)
      setStep(2)
      requestAnimationFrame(() => document.getElementById(fieldId)?.focus())
      return false
    }
    const missing = activePlayers.findIndex((player) => !player.name.trim() || !armies.some((army) => army.id === player.armyId))
    if (missing >= 0) {
      const nameMissing = !activePlayers[missing].name.trim()
      return fail(`Player ${missing + 1}: ${nameMissing ? 'enter a player name' : 'choose a saved army'}.`, missing, nameMissing ? 'name' : 'army')
    }
    const invalidZone = activePlayers.findIndex((player, index) => !(officialPair ? ['A', 'B'] : ['A', 'B', 'C']).includes(player.deploymentZone)
      || activePlayers.slice(0, index).some((previous, previousIndex) => (!doubles || Math.floor(index / 2) !== Math.floor(previousIndex / 2)) && previous.deploymentZone === player.deploymentZone)
      || (doubles && index % 2 === 1 && activePlayers[index - 1].deploymentZone !== player.deploymentZone))
    if (invalidZone >= 0) return fail(officialPair ? 'Assign opposing team deployment zones A and B.' : 'Assign deployment zones A, B, and C exactly once.', invalidZone, 'zone')
    const invalidTurn = activePlayers.findIndex((player, index) => player.turnPosition < 1 || player.turnPosition > (doubles ? 2 : count)
      || activePlayers.slice(0, index).some((previous, previousIndex) => (!doubles || Math.floor(index / 2) !== Math.floor(previousIndex / 2)) && previous.turnPosition === player.turnPosition)
      || (doubles && index % 2 === 1 && activePlayers[index - 1].turnPosition !== player.turnPosition))
    if (invalidTurn >= 0) return fail(officialPair ? 'Assign shared team turn positions 1 and 2.' : 'Assign turn positions 1, 2, and 3 exactly once.', invalidTurn, 'turn')
    const invalidFixed = activePlayers.findIndex((player) => {
      const fixed = primaryDeck === 'chapter-approved-duel' ? (!doubles || index === 0 || index === 2) && duelStrategies[player.id] === 'fixed' : secondaryDeck === 'chapter-approved' && officialStrategy === 'fixed'
      const selected = fixedSelections[player.id]
      return fixed && (!selected || new Set(selected).size !== 2 || selected.some((id) => !OFFICIAL_SECONDARY_BY_ID[id]?.fixed))
    })
    if (invalidFixed >= 0) return fail(`Player ${invalidFixed + 1}: choose two different Fixed Secondaries.`, invalidFixed, 'fixed-2')
    return true
  }

  function goToStep(next: 1 | 2 | 3) {
    setLocalError(null)
    setInvalidFieldId(null)
    if (next === 3 && !validateCommanders()) return
    setStep(next)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLocalError(null)
    setInvalidFieldId(null)
    if (step < 3) { goToStep((step + 1) as 2 | 3); return }
    if (!validateCommanders()) return
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    const sharedMode = submitter?.value === 'shared'
    if (primaryDeck === 'chapter-approved-ffa' && activePlayers.some((player) => player.officialPrimaryId === 'gather-intel') && objectiveLayout !== 'expanded-7' && secondaryDeck !== 'chapter-approved') {
      setLocalError('Battlefield · Gather Intel requires the 7-objective layout with CENTER.')
      setInvalidFieldId('battlefield-layout')
      requestAnimationFrame(() => document.getElementById('battlefield-layout')?.focus())
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
        primaryDeck === 'chapter-approved-duel' ? attackerHomeZone : undefined,
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
        <p>Rules, commanders, then battlefield. Your choices stay here until you start.</p>
      </section>
      <nav className="setup-steps" aria-label="Battle setup steps">{(['Rules', 'Commanders', 'Battlefield & Start'] as const).map((label, index) => <button type="button" key={label} aria-current={step === index + 1 ? 'step' : undefined} onClick={() => goToStep((index + 1) as 1 | 2 | 3)}><span>{index + 1}</span><strong>{label}</strong></button>)}</nav>
      <form noValidate onSubmit={(event) => void submit(event)}>
      <section className="setup-step" hidden={step !== 1} aria-label="Rules">
      <h2>Choose your rules</h2>
      <div className="setup-mode-picker panel" role="group" aria-label="Cauldron battle mode">
        <button type="button" className={duel ? 'button--gold' : ''} aria-pressed={duel} onClick={() => changeMode('duel')}>
          <strong>Duel 1v1</strong><span>2 players · Cauldron or Chapter Approved</span>
        </button>
        <button type="button" className={!duel ? 'button--gold' : ''} aria-pressed={!duel} onClick={() => changeMode('ffa3')}>
          <strong>FFA 3</strong><span>3 players · rotating Rival</span>
        </button>
      </div>

        <div className="panel setup-primary-picker">
          <label>Primary mode<select value={primaryDeck} onChange={(event) => setPrimaryDeck(event.target.value as PrimaryDeck)}>
            <option value="cauldron">Cauldron · objectives + Operational Plan</option>
            {duel ? <option value="chapter-approved-duel">11th edition official Duel · Force Disposition matrix</option> : <option value="chapter-approved-ffa">11th edition FFA · a different Primary for each player</option>}
          </select></label>
          {primaryDeck === 'chapter-approved-ffa' && <InfoDisclosure label="How this Primary works"><p className="context-note">Balanced FFA adaptation of five 11th edition mirror cards, with adjusted VP values. Each player freely selects a Primary below for the whole battle; it is not automatically assigned by Detachment. Primary uses your Current Rival for that Battle Round, including HOME, territory, comparisons and destroyed units. Secondary cards keep the Rival assigned when drawn. Rounds 1/3/5: A → B → C → A. Rounds 2/4: A → C → B → A. Primary scores up to 15 VP per round and 45 VP per battle. Operational Plans do not score.</p></InfoDisclosure>}
          {primaryDeck === 'chapter-approved-duel' && <InfoDisclosure label="How this Primary works"><p className="context-note">Official 1v1 matrix: each player chooses a Force Disposition available to their Detachment. Their row against the opponent’s choice determines their own Primary. Use one of three terrain layouts for that pairing. The physical battlefield decides control, actions and markers; confirm each condition at the correct scoring window. 45 Primary + 45 Secondary + 10 Battle Ready VP.</p></InfoDisclosure>}
        </div>
        <section className="panel setup-secondary-picker">
          {primaryDeck !== 'chapter-approved-duel' && <label>Secondary deck<select value={secondaryDeck} onChange={(event) => setSecondaryDeck(event.target.value as SecondaryDeck)}>
            <option value="cauldron">Cauldron v{CAULDRON_RULESET_VERSION} · 15 cards</option>
            <option value="chapter-approved">Chapter Approved 2026–27 · 18 official cards</option>
          </select></label>}
          {secondaryDeck === 'chapter-approved' && primaryDeck !== 'chapter-approved-duel' && <>
            <label>Secondary strategy<select value={officialStrategy} onChange={(event) => setOfficialStrategy(event.target.value as OfficialSecondaryStrategy)}>
              <option value="tactical">Tactical · draw two each Command phase</option>
              <option value="fixed">Fixed · choose two eligible cards per player</option>
            </select></label>
            <InfoDisclosure label="Secondary strategy details"><p className="context-note">{officialStrategy === 'fixed'
              ? 'Fixed: choose two eligible cards for each player. They remain active throughout the battle and each can score up to 20 VP.'
              : 'Tactical: draw two cards at each own Command phase. There is no free general mulligan: once per battle New Orders replaces one card for 1 CP; specific When Drawn cards have their own replacement rules. At your turn end, discard active cards to gain 1 CP.'} Secondary scores up to 15 VP per round and 45 VP per battle. {duel ? 'Duel uses the two-player card text.' : 'FFA cards keep their assigned Secondary Rival. Enemy presence checks both other armies. Only your army’s kills against that assigned Rival score. Tactical is recommended; Fixed is experimental because target availability depends on the matchup.'}</p></InfoDisclosure>
          </>}
        </section>
      </section>
      <section className="setup-step" hidden={step !== 2} aria-label="Commanders">
        <h2>Assign your commanders</h2>
        <div className="setup-toolbar panel">
          <div><span className="eyebrow">Assignment tools</span><strong>Manual or randomized</strong></div>
          <button type="button" onClick={randomizeZones}>Randomize zones</button>
          <button type="button" onClick={randomizeTurns}>Randomize turn order</button>
        </div>
        <div className={`cauldron-player-grid${duel ? ' cauldron-player-grid--duel' : ''}`}>{activePlayers.map((player, index) => (
          <section className="panel player-setup-card" key={player.id}>
            <div className="player-setup-card__title"><span>Player {index + 1}</span><strong>Zone {player.deploymentZone} · Turn {player.turnPosition}</strong></div>
            <label>Player name<input id={`commander-${index}-name`} aria-describedby={invalidFieldId === `commander-${index}-name` ? 'setup-error' : undefined} aria-invalid={invalidFieldId === `commander-${index}-name`} value={player.name} required onChange={(event) => updatePlayer(index, 'name', event.target.value)} /></label>
            <label>Saved army<select id={`commander-${index}-army`} aria-describedby={invalidFieldId === `commander-${index}-army` ? 'setup-error' : undefined} aria-invalid={invalidFieldId === `commander-${index}-army`} value={player.armyId} onChange={(event) => updatePlayer(index, 'armyId', event.target.value)}>
              {armies.map((army) => <option key={army.id} value={army.id}>{army.faction} · {army.totalPoints} pts · {army.name}</option>)}
            </select></label>
            <div className="setup-pair">
              <label>Deployment zone<select id={`commander-${index}-zone`} aria-describedby={invalidFieldId === `commander-${index}-zone` ? 'setup-error' : undefined} aria-invalid={invalidFieldId === `commander-${index}-zone`} value={player.deploymentZone} onChange={(event) => updatePlayer(index, 'deploymentZone', event.target.value as DeploymentZone)}>
                {(duel ? ['A', 'B'] : ['A', 'B', 'C']).map((zone) => <option key={zone}>{zone}</option>)}
              </select></label>
              <label>Turn position<select id={`commander-${index}-turn`} aria-describedby={invalidFieldId === `commander-${index}-turn` ? 'setup-error' : undefined} aria-invalid={invalidFieldId === `commander-${index}-turn`} value={player.turnPosition} onChange={(event) => updatePlayer(index, 'turnPosition', Number(event.target.value) as TurnPosition)}>
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
              {player.officialPrimaryId && <InfoDisclosure label="Selected Primary rules"><p className="plan-description">{BALANCED_OFFICIAL_PRIMARY_MISSIONS[player.officialPrimaryId].description} <a href={BALANCED_OFFICIAL_PRIMARY_MISSIONS[player.officialPrimaryId].url} target="_blank" rel="noreferrer">Read original card</a></p><ul className="context-note">{BALANCED_OFFICIAL_PRIMARY_MISSIONS[player.officialPrimaryId].rules.map((rule) => <li key={rule}>{rule}</li>)}</ul></InfoDisclosure>}
            </> : <><label>Operational Plan<select value={player.operationalPlanId} onChange={(event) => updatePlayer(index, 'operationalPlanId', event.target.value as OperationalPlanId)}>
              {OPERATIONAL_PLAN_IDS.map((planId) => <option key={planId} value={planId}>{OPERATIONAL_PLAN_DEFINITIONS[planId].name}</option>)}
            </select></label>
            <p className="plan-description">{OPERATIONAL_PLAN_DEFINITIONS[player.operationalPlanId].description}</p></>}
            {primaryDeck === 'chapter-approved-duel' && <label>Secondary strategy<select value={duelStrategies[player.id]} onChange={(event) => setDuelStrategies((current) => ({ ...current, [player.id]: event.target.value as OfficialSecondaryStrategy }))}>
              <option value="tactical">Tactical · draw from deck</option><option value="fixed">Fixed · choose two cards</option>
            </select></label>}
            {(primaryDeck === 'chapter-approved-duel' ? duelStrategies[player.id] === 'fixed' : secondaryDeck === 'chapter-approved' && officialStrategy === 'fixed') && <div className="setup-pair">
              {([0, 1] as const).map((slot) => <label key={slot}>Fixed Secondary {slot + 1}
                <select id={`commander-${index}-fixed-${slot + 1}`} aria-describedby={invalidFieldId === `commander-${index}-fixed-${slot + 1}` ? 'setup-error' : undefined} aria-invalid={invalidFieldId === `commander-${index}-fixed-${slot + 1}`} value={fixedSelections[player.id][slot]} onChange={(event) => setFixedSelections((current) => ({
                  ...current,
                  [player.id]: current[player.id].map((id, index) => index === slot ? event.target.value as OfficialSecondaryId : id) as [OfficialSecondaryId, OfficialSecondaryId],
                }))}>
                  {OFFICIAL_FIXED_IDS.map((id) => <option key={id} value={id}>{OFFICIAL_SECONDARY_BY_ID[id].name}</option>)}
                </select>
              </label>)}
            </div>}
          </section>
        ))}</div>
      </section>
      <section className="setup-step" hidden={step !== 3} aria-label="Battlefield and start">
        <h2>Battlefield & Start</h2>
        <section className="panel setup-summary" aria-label="Battle setup summary"><span className="eyebrow">Ready to deploy</span><h3>{duel ? 'Duel 1v1' : 'FFA 3'}</h3><p>{primaryDeck === 'cauldron' ? 'Cauldron Primary' : '11th edition Primary'} · {primaryDeck === 'chapter-approved-duel' || secondaryDeck === 'chapter-approved' ? 'Chapter Approved Secondary' : 'Cauldron Secondary'}</p><ul>{activePlayers.map((player) => <li key={player.id}><strong>{player.name}</strong><span>Zone {player.deploymentZone} · Turn {player.turnPosition}</span><small>{armies.find((army) => army.id === player.armyId)?.faction}</small></li>)}</ul></section>
        <section className="panel setup-footer setup-footer--battle-mode">
          {primaryDeck === 'chapter-approved-duel' && <><InfoDisclosure label="Official pairing & setup instructions"><p className="context-note">Secondary deck: Chapter Approved 2026–27. Each player chooses Tactical or Fixed on their card above. Pick the recommended layout for your pairing. Roll for Attacker/Defender, then roll separately for first turn as described in the <a href="https://assets.warhammer-community.com/eng_12-06_warhammer40000_event_companion-s3bfb5f9s1-ivswuij3fo.pdf" target="_blank" rel="noreferrer">Warhammer Event Companion</a>. Assign A/B HOME to your actual objectives and turn positions to the first-turn roll. The app’s central and expansion names are generic; use the physical layout to identify them.</p></InfoDisclosure><label>Pairing layout<select value={officialLayout} onChange={(event) => setOfficialLayout(Number(event.target.value) as 1 | 2 | 3)}><option value={1}>Layout A</option><option value={2}>Layout B</option><option value={3}>Layout C</option></select></label></>}
          {primaryDeck === 'chapter-approved-duel' && <label>Attacker HOME assignment<select value={attackerHomeZone} onChange={(event) => setAttackerHomeZone(event.target.value as 'A' | 'B')}><option value="A">A-HOME · Attacker / B-HOME · Defender</option><option value="B">B-HOME · Attacker / A-HOME · Defender</option></select></label>}
          <label>Guidance level<select value={guidance} onChange={(event) => setGuidance(event.target.value as GuidanceLevel)}>
            <option value="guided">Guided — full contextual reminders</option>
            <option value="fast">Fast — essential reminders only</option>
          </select></label>
          {!duel && <label>Objective layout<select id="battlefield-layout" aria-describedby={invalidFieldId === 'battlefield-layout' ? 'setup-error' : undefined} aria-invalid={invalidFieldId === 'battlefield-layout'} value={secondaryDeck === 'chapter-approved' ? 'expanded-7' : objectiveLayout} disabled={secondaryDeck === 'chapter-approved'} onChange={(event) => setObjectiveLayout(event.target.value as CauldronObjectiveLayout)}>
            <option value="expanded-7">{secondaryDeck === 'chapter-approved' ? '7 objectives — 3 HOME + AB/AC/BC-NEUTRAL + CENTER' : '7 objectives — 3 HOME + N1/N2/N3 + CENTER'}</option>
            <option value="classic-6">6 objectives — 3 HOME + N1/N2/N3</option>
          </select></label>}
          <label>Shared host seat<select value={hostPlayerId} onChange={(event) => setHostPlayerId(event.target.value)}>
            {activePlayers.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
          </select></label>
          {secondaryDeck === 'cauldron' && primaryDeck !== 'chapter-approved-duel' && (duel
            ? <p className="context-note">Duel changes only the player topology: 2 turns per Battle Round, A/B HOME objectives, and a permanent Rival. Primary, Secondary, Operational Plans and scoring caps use the Cauldron {CAULDRON_RULESET_VERSION} balance rules.</p>
            : <p className="context-note">The 7-objective layout treats CENTER as a neutral objective. Gather Intel requires CENTER.</p>)}
          <div className="setup-submit-actions">
            <button className="button" type="submit" value="local" disabled={loading || sharedWorking}>{loading && !sharedWorking ? 'Preparing…' : 'Start locally'}</button>
            <button className="button button--gold" type="submit" value="shared" disabled={loading || sharedWorking || !sharedConfigured} title={sharedConfigured ? undefined : 'Configure Supabase first'}>
              {sharedWorking ? 'Checking Supabase…' : `Create ${duel ? '2-player' : '3-player'} lobby`}
            </button>
          </div>
        </section>
      </section>
      {(localError || error) && <div id="setup-error" className="alert alert--danger" role="alert">{localError ?? error}</div>}
      <div className="setup-step-actions">
        {step > 1 && <button type="button" onClick={() => goToStep((step - 1) as 1 | 2)}>Back</button>}
        {step < 3 && <button className="button--gold" type="button" onClick={() => goToStep((step + 1) as 2 | 3)}>{step === 1 ? 'Next: Commanders' : 'Next: Battlefield'}</button>}
      </div>
      </form>
    </div>
  )
}

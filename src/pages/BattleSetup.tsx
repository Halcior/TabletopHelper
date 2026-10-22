import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { Army } from '../domain/army/types'
import type { DoublesSetup, GuidanceLevel } from '../domain/battle/types'
import { useRosterLibrary } from '../features/armyLibrary/repository'
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
import { RulesSourceBadge } from '../components/ui/RulesSourceBadge'
import { FormatGlyph } from '../components/ui/FormatGlyph'
import { describeRules, recommendedRules } from '../rulesets/rulesSource'

type PlayerDraft = CauldronPlayerInput

const LOBBY_PLACEHOLDER: Army = { id: 'temporary-online-lobby', name: 'Temporary lobby initialization', faction: 'Unassigned', totalPoints: 0, detachments: [], units: [{ id:'temporary-character', name:'Temporary Character', points:0, startingModels:1, modelGroups:[{name:'Temporary Character',startingCount:1,equipment:[]}],categories:['CHARACTER'],keywords:['CHARACTER'],rangedWeapons:[],meleeWeapons:[],abilities:[],enhancements:[],wargear:[],isWarlord:true,leaderOfUnitId:null,ledByUnitIds:[] }] }

const DEFAULT_PLAYERS: PlayerDraft[] = [
  { id: 'player-a', name: 'Player I', armyId: '', deploymentZone: 'A', turnPosition: 1, operationalPlanId: 'WYNISZCZENIE', officialPrimaryId: 'battlefield-dominance', forceDisposition: 'take-and-hold' },
  { id: 'player-b', name: 'Player II', armyId: '', deploymentZone: 'B', turnPosition: 2, operationalPlanId: 'DECYDUJACE_NATARCIE', officialPrimaryId: 'meatgrinder', forceDisposition: 'purge-the-foe' },
  { id: 'player-c', name: 'Player III', armyId: '', deploymentZone: 'C', turnPosition: 3, operationalPlanId: 'TWIERDZA', officialPrimaryId: 'outmanoeuvre', forceDisposition: 'purge-the-foe' },
  { id: 'player-d', name: 'Player IV', armyId: '', deploymentZone: 'B', turnPosition: 2, operationalPlanId: 'TWIERDZA' },
]

function setupMode(value: string | null): CauldronMode {
  return value === 'ffa3' || value === 'doubles2v2' ? value : 'duel'
}

function playersForMode(players: PlayerDraft[], mode: CauldronMode): PlayerDraft[] {
  return players.map((player, index) => ({
    ...player,
    deploymentZone: (mode === 'doubles2v2' ? index < 2 ? 'A' : 'B' : 'ABC'[index] ?? 'B') as DeploymentZone,
    turnPosition: (mode === 'doubles2v2' ? index < 2 ? 1 : 2 : index + 1) as TurnPosition,
  }))
}

export default function BattleSetup() {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [params] = useSearchParams()
  const [playMode, setPlayMode] = useState<'local' | 'shared' | null>(() => {
    const requested = params.get('play')
    return requested === 'shared' ? 'shared' : 'local'
  })
  const navigate = useNavigate()
  const preferredArmyId = params.get('armyId')
  const [mode, setMode] = useState<CauldronMode>(() => setupMode(params.get('mode')))
  const [objectiveLayout, setObjectiveLayout] = useState<CauldronObjectiveLayout>('expanded-7')
  const { rows: rosterRows, loading: loadingArmies, error: libraryError } = useRosterLibrary()
  const armies = useMemo(() => rosterRows.map(row => row.army), [rosterRows])
  const [players, setPlayers] = useState<PlayerDraft[]>(() => playersForMode(DEFAULT_PLAYERS, setupMode(params.get('mode'))))
  const [guidance, setGuidance] = useState<GuidanceLevel>('guided')
  const [secondaryDeck, setSecondaryDeck] = useState<SecondaryDeck>(() => recommendedRules(mode).secondaryDeck)
  const [primaryDeck, setPrimaryDeck] = useState<PrimaryDeck>(() => recommendedRules(mode).primaryDeck)
  const [officialStrategy, setOfficialStrategy] = useState<OfficialSecondaryStrategy>('tactical')
  const [duelStrategies, setDuelStrategies] = useState<Record<string, OfficialSecondaryStrategy>>({ 'player-a': 'tactical', 'player-b': 'tactical', 'player-c': 'tactical' })
  const [officialLayout, setOfficialLayout] = useState<1 | 2 | 3>(1)
  const [teamNames, setTeamNames] = useState(['Team Alpha', 'Team Bravo'])
  const [teamTypes, setTeamTypes] = useState<['unified' | 'convenience', 'unified' | 'convenience']>(['convenience', 'convenience'])
  const [teamWarlords, setTeamWarlords] = useState<Record<number, string>>({})
  const [attackerHomeZone, setAttackerHomeZone] = useState<'A' | 'B'>('A')
  const [fixedSelections, setFixedSelections] = useState<Record<string, [OfficialSecondaryId, OfficialSecondaryId]>>(
    Object.fromEntries(DEFAULT_PLAYERS.map((player) => [player.id, ['OFFICIAL_A_GRIEVOUS_BLOW', 'OFFICIAL_ENGAGE_ON_ALL_FRONTS']])) as Record<string, [OfficialSecondaryId, OfficialSecondaryId]>,
  )
  const [hostPlayerId, setHostPlayerId] = useState(DEFAULT_PLAYERS[0].id)
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
  const rules = describeRules({ mode, primaryDeck, secondaryDeck })
  const recommended = recommendedRules(mode)
  const usingRecommended = primaryDeck === recommended.primaryDeck && secondaryDeck === recommended.secondaryDeck
  const teamCaptainIndex = (team: number) => team === 0 ? 0 : 2
  const warlordOptions = (team: number) => activePlayers.slice(team * 2, team * 2 + 2).flatMap((player) => {
    const army = armies.find((entry) => entry.id === player.armyId)
    return (army?.units ?? []).filter((unit) => [...unit.categories, ...unit.keywords].some((trait) => trait.toUpperCase() === 'CHARACTER')).map((unit) => ({ value: `${player.id}|${unit.id}`, label: `${player.name} · ${unit.name}` }))
  })
  function getDoublesSetup(provisionalArmy?: Army): DoublesSetup {
    return { rulesVersion: 'GW-Doubles-1.0', forces: ([0, 1] as const).map((team) => {
      const members = activePlayers.slice(team * 2, team * 2 + 2)
      // Lobby rosters are unknown until each player joins. The server replaces
      // provisional Warlord references with a valid staged CHARACTER at Start.
      const provisionalWarlord = provisionalArmy?.units.find((unit) =>
        [...unit.categories, ...unit.keywords].some((trait) => trait.toUpperCase() === 'CHARACTER'))
      if (provisionalArmy && !provisionalWarlord) throw new Error('To prepare a Doubles lobby, your temporary roster needs a CHARACTER. Final Warlords are chosen from the players’ lobby rosters.')
      const choice = provisionalWarlord ? `${members[0].id}|${provisionalWarlord.id}`
        : teamWarlords[team] && warlordOptions(team).some((entry) => entry.value === teamWarlords[team])
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
    if (loadingArmies) return
    const fallback = armies.find(army => army.id === preferredArmyId) ?? armies[0]
    if (fallback) setPlayers(current => current.map(player => ({ ...player, armyId: armies.some(army => army.id === player.armyId) ? player.armyId : fallback.id })))
    if (libraryError) setLocalError(libraryError)
  }, [rosterRows, preferredArmyId, loadingArmies, libraryError])

  useEffect(() => {
    if (!activePlayers.some((player) => player.id === hostPlayerId)) setHostPlayerId(activePlayers[0]?.id ?? '')
  }, [activePlayers, hostPlayerId])

  function updatePlayer<K extends keyof PlayerDraft>(index: number, key: K, value: PlayerDraft[K]) {
    setPlayers((current) => current.map((player, playerIndex) => (
      playerIndex === index ? { ...player, [key]: value } : player
    )))
  }

  function changeMode(nextMode: CauldronMode) {
    if (nextMode === mode) return
    setLocalError(null)
    setInvalidFieldId(null)
    setMode(nextMode)
    applyRecommended(nextMode)
    setPlayers((current) => playersForMode(current, nextMode))
  }

  function applyRecommended(nextMode: CauldronMode) {
    const defaults = recommendedRules(nextMode)
    setPrimaryDeck(defaults.primaryDeck)
    setSecondaryDeck(defaults.secondaryDeck)
    setOfficialStrategy('tactical')
    setDuelStrategies({ 'player-a': 'tactical', 'player-b': 'tactical', 'player-c': 'tactical' })
    setObjectiveLayout('expanded-7')
  }

  function changePrimary(next: PrimaryDeck) {
    setPrimaryDeck(next)
    if (next === 'chapter-approved-duel') setSecondaryDeck('chapter-approved')
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

  function validateCommanders(shared = false): boolean {
    const count = doubles ? 4 : mode === 'duel' ? 2 : 3
    const fail = (message: string, index: number, field: string) => {
      const fieldId = `commander-${index}-${field}`
      setLocalError(`Commanders · ${message}`)
      setInvalidFieldId(fieldId)
      setStep(2)
      requestAnimationFrame(() => document.getElementById(fieldId)?.focus())
      return false
    }
    const missing = activePlayers.findIndex((player) => !player.name.trim() || (!shared && !armies.some((army) => army.id === player.armyId)))
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
    const invalidFixed = activePlayers.findIndex((player, index) => {
      const fixed = primaryDeck === 'chapter-approved-duel' ? (!doubles || index === 0 || index === 2) && duelStrategies[player.id] === 'fixed' : secondaryDeck === 'chapter-approved' && officialStrategy === 'fixed'
      const selected = fixedSelections[player.id]
      return fixed && (!selected || new Set(selected).size !== 2 || selected.some((id) => !OFFICIAL_SECONDARY_BY_ID[id]?.fixed))
    })
    if (invalidFixed >= 0) return fail(`Player ${invalidFixed + 1}: choose two different Fixed Secondaries.`, invalidFixed, 'fixed-2')
    if (doubles && (!teamNames[0].trim() || !teamNames[1].trim() || teamNames[0].trim() === teamNames[1].trim())) { setLocalError('Commanders · Give each team a distinct name.'); setStep(2); return false }
    if (!shared && doubles && ([0, 1] as const).some((team) => warlordOptions(team).length === 0)) { setLocalError('Commanders · Each team needs a CHARACTER Warlord in one of its two saved armies.'); setStep(2); return false }
    return true
  }

  function goToStep(next: 1 | 2 | 3) {
    setLocalError(null)
    setInvalidFieldId(null)
    if (next === 3 && !validateCommanders(playMode === 'shared')) return
    setStep(next)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLocalError(null)
    setInvalidFieldId(null)
    if (step < 3 && playMode !== 'shared') { goToStep((step + 1) as 2 | 3); return }
    const sharedMode = playMode === 'shared'
    if (!validateCommanders(sharedMode)) return
    if (primaryDeck === 'chapter-approved-ffa' && activePlayers.some((player) => player.officialPrimaryId === 'gather-intel') && objectiveLayout !== 'expanded-7' && secondaryDeck !== 'chapter-approved') {
      setLocalError('Battlefield · Gather Intel requires the 7-objective layout with CENTER.')
      setInvalidFieldId('battlefield-layout')
      requestAnimationFrame(() => document.getElementById('battlefield-layout')?.focus())
      return
    }

    // A shared lobby only needs a temporary setup snapshot. The room transport
    // strips these placeholders and each seat stages its *own* roster before Ready.
    const characterRoster = armies.find((army) => army.units.some((unit) =>
      [...unit.categories, ...unit.keywords].some((trait) => trait.toUpperCase() === 'CHARACTER')))
    const provisionalArmy = sharedMode && doubles ? characterRoster ?? LOBBY_PLACEHOLDER : armies[0] ?? LOBBY_PLACEHOLDER
    if (sharedMode && !provisionalArmy) {
      setLocalError('Import at least one army to prepare a multiplayer lobby.')
      return
    }
    const selectedArmies = sharedMode ? [provisionalArmy] : [...new Set(activePlayers.map((player) => player.armyId))]
      .map((id) => armies.find((army) => army.id === id))
      .filter((army): army is Army => Boolean(army))
    const setupPlayers = sharedMode
      ? activePlayers.map((player) => ({ ...player, armyId: provisionalArmy.id }))
      : activePlayers
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
        setupPlayers,
        selectedArmies,
        guidance,
        officialPair ? 'classic-6' : objectiveLayout,
        primaryDeck === 'chapter-approved-duel' ? 'chapter-approved' : secondaryDeck,
        officialStrategy,
        (secondaryDeck === 'chapter-approved' && officialStrategy === 'fixed') || (primaryDeck === 'chapter-approved-duel' && Object.values(duelStrategies).includes('fixed')) ? fixedSelections : undefined,
        primaryDeck,
        primaryDeck === 'chapter-approved-duel' ? duelStrategies : undefined,
        primaryDeck === 'chapter-approved-duel' ? officialLayout : undefined,
        primaryDeck === 'chapter-approved-duel' ? attackerHomeZone : undefined,
        mode,
        doubles ? getDoublesSetup(sharedMode ? provisionalArmy : undefined) : undefined,
        !sharedMode,
      )
      if (sharedMode) {
        const membership = await hostCurrentBattle(hostPlayerId, true)
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

  if (loadingArmies) return <div className="page-shell"><div className="loading-state" role="status">Loading saved armies…</div></div>
  if (armies.length === 0 && playMode !== 'shared') return <div className="page-shell"><div className="empty-state">
    <span className="eyebrow">Your first battle</span><h1>Add your first army</h1><p>Import a New Recruit JSON roster, then choose your format and commanders. You can add more rosters before playing.</p>
    <Link className="button button--gold" to="/army-import">Import army</Link>
  </div></div>

  const duel = mode === 'duel'

  return (
    <div className="page-shell setup-page">
      <section className="page-intro">
        <span className="eyebrow">{playMode === 'shared' ? 'Online multiplayer · Choose format' : `Local battle · Step ${step} of 3`}</span>
        <h1>{doubles ? 'New Doubles 2v2 battle' : duel ? 'New Duel 1v1 battle' : 'New FFA 3 battle'}</h1>
        <p>{playMode === 'shared' ? 'Choose rules and player slots. Everyone will bring their own army in the lobby.' : 'Choose a format, assign commanders and prepare the battlefield.'}</p>

      </section>
      <div className="setup-mode-picker panel" role="group" aria-label="Play mode">
        <button type="button" aria-pressed={playMode === 'local'} className={playMode === 'local' ? 'button--gold' : ''} onClick={() => { setPlayMode('local'); setStep(1); setLocalError(null) }}><FormatGlyph mode="duel" /><strong>On one device</strong><span>Choose all armies here.</span></button>
        <button type="button" aria-pressed={playMode === 'shared'} className={playMode === 'shared' ? 'button--gold' : ''} disabled={!sharedConfigured} onClick={() => { setPlayMode('shared'); setStep(1); setLocalError(null) }}><FormatGlyph mode="ffa3" /><strong>Online multiplayer</strong><span>Everyone brings an army to the lobby.</span></button>
      </div>
      {playMode === 'shared' && <p className="context-note">Already invited? <Link to="/shared">Join a lobby instead</Link>. Hosting creates an empty waiting room and does not start combat.</p>}
      {playMode === 'local' && <nav className="setup-steps" aria-label="Battle setup steps">{(['Rules', playMode === 'shared' ? 'Player slots' : 'Commanders', playMode === 'shared' ? 'Create lobby' : 'Battlefield & Start'] as const).map((label, index) => <button type="button" key={label} aria-current={step === index + 1 ? 'step' : undefined} onClick={() => goToStep((index + 1) as 1 | 2 | 3)}><span>{index + 1}</span><strong>{label}</strong></button>)}</nav>}
      <form noValidate onSubmit={(event) => void submit(event)}>
      <section className="setup-step" hidden={step !== 1} aria-label="Rules">
      <h2>Choose your rules</h2>
      <div className="setup-mode-picker panel" role="group" aria-label="Battle format">
        <button type="button" className={duel ? 'button--gold' : ''} aria-pressed={duel} onClick={() => changeMode('duel')}>
          <FormatGlyph mode="duel" /><strong>Duel 1v1</strong><span>2 players<br />Head to head</span><RulesSourceBadge source={duel ? rules.source : 'official'} />
        </button>
        <button type="button" className={doubles ? 'button--gold' : ''} aria-pressed={doubles} onClick={() => changeMode('doubles2v2')}>
          <FormatGlyph mode="doubles2v2" /><strong>Doubles 2v2</strong><span>4 players<br />Shared forces</span><RulesSourceBadge source="official" />
        </button>
        <button type="button" className={mode === 'ffa3' ? 'button--gold' : ''} aria-pressed={mode === 'ffa3'} onClick={() => changeMode('ffa3')}>
          <FormatGlyph mode="ffa3" /><strong>FFA 3</strong><span>3 players<br />Rotating Rival</span><RulesSourceBadge source="community" />
        </button>
      </div>

        <section className="panel rules-source" aria-labelledby="rules-source-heading">
          <div className="rules-source__heading"><h3 id="rules-source-heading">Rules Source</h3><RulesSourceBadge source={rules.source} /></div>
          <h4>{rules.title}</h4>
          <p className="rules-source__description">{rules.description}</p>
          <dl className="rules-source__decks"><div><dt>Primary</dt><dd>{rules.primary}</dd></div><div><dt>Secondary</dt><dd>{rules.secondary}</dd></div></dl>
          <button type="button" className="rules-source__recommended" aria-pressed={usingRecommended} onClick={() => applyRecommended(mode)}>
            <span aria-hidden="true">{usingRecommended ? '✓' : '↺'}</span><span><strong>{usingRecommended ? 'Recommended preset selected' : 'Use recommended preset'}</strong><small>{officialPair ? 'Official missions · Tactical by default' : 'Balanced FFA v1 · Tactical · 7 objectives'}</small></span>
          </button>
          <InfoDisclosure label="Rules references & format notes">
            <p className="context-note">{officialPair ? 'Official identifies the selected mission format. Players confirm roster eligibility and physical conditions at the table.' : 'FFA uses community Primary scoring, Rival targeting and Balanced CP. Selecting Chapter Approved cards does not make FFA an official format.'}</p>
            <div className="rules-source__links"><a href={doubles ? 'https://assets.warhammer-community.com/eng_12-06_warhammer40000_doubles_event_companion-xyapytrwkz-9a6fljmnob.pdf' : 'https://assets.warhammer-community.com/eng_14-10_wh40k_event_companion-rdwnqprl4c-nj8oqogadv.pdf'} target="_blank" rel="noreferrer">{doubles ? 'GW Doubles Event Companion v1.0' : 'GW Event Companion v1.0'}</a><a href="https://www.warhammer-community.com/en-gb/downloads/warhammer-40000/" target="_blank" rel="noreferrer">GW downloads & updates</a></div>
          </InfoDisclosure>
        </section>
        {!doubles && <details className="panel setup-custom-settings">
          <summary>Custom / Homebrew settings</summary>
          <p className="context-note">Choose Cauldron or mix the available mission decks. Custom selections are labelled Community format.</p>
          <button type="button" onClick={() => { setPrimaryDeck('cauldron'); setSecondaryDeck('cauldron') }}>Use Cauldron preset</button>
          <div className="setup-custom-settings__fields">
            <label>Primary mode<select value={primaryDeck} onChange={(event) => changePrimary(event.target.value as PrimaryDeck)}>
              {officialPair ? <option value="chapter-approved-duel">Chapter Approved Duel · official matrix</option> : <option value="chapter-approved-ffa">Balanced FFA v1 · community Primary</option>}
              <option value="cauldron">Cauldron · objectives + Operational Plan</option>
            </select></label>
            {primaryDeck !== 'chapter-approved-duel' && <label>Secondary deck<select value={secondaryDeck} onChange={(event) => setSecondaryDeck(event.target.value as SecondaryDeck)}>
              <option value="chapter-approved">Chapter Approved 2026–27 · {duel ? '18 cards' : 'FFA adaptation'}</option>
              <option value="cauldron">Cauldron v{CAULDRON_RULESET_VERSION} · 15 cards</option>
            </select></label>}
          </div>
        </details>}
        <div className="panel setup-primary-picker">
          <h3>{primaryDeck === 'cauldron' ? 'Cauldron missions' : 'Mission format'}</h3>
          {mode === 'ffa3' && <p className="context-note" role="note"><strong>Balanced CP (FFA):</strong> Every commander automatically receives +2 CP when each Battle Round starts. From Round 3, players tied for the lowest VP get +1 Underdog CP (no bonus if all scores are tied). No extra Core CP in individual Command phases. Manual +CP/−CP stays available for abilities and corrections.</p>}
          {primaryDeck === 'chapter-approved-ffa' && <InfoDisclosure label="How this Primary works"><p className="context-note">Balanced FFA adaptation of five 11th edition mirror cards, with adjusted VP values. Each player freely selects a Primary below for the whole battle; it is not automatically assigned by Detachment. Primary uses your Current Rival for that Battle Round, including HOME, territory, comparisons and destroyed units. Secondary cards keep the Rival assigned when drawn. Rounds 1/3/5: A → B → C → A. Rounds 2/4: A → C → B → A. Primary scores up to 15 VP per round and 45 VP per battle. Operational Plans do not score.</p></InfoDisclosure>}
          {primaryDeck === 'chapter-approved-duel' && <InfoDisclosure label="How this Primary works"><p className="context-note">Official {doubles ? 'Doubles matrix: each force chooses one Force Disposition available to either army' : '1v1 matrix: each player chooses a Force Disposition available to their Detachment'}. Their row against the opponent’s choice determines their own Primary. Use one of three terrain layouts for that pairing. The physical battlefield decides control, actions and markers; confirm each condition at the correct scoring window. 45 Primary + 45 Secondary + 10 Battle Ready VP.</p></InfoDisclosure>}
          {primaryDeck === 'cauldron' && <p className="context-note">Objectives and Operational Plans use Cauldron community scoring. Assign a plan to each commander in the next step.</p>}
        </div>
        {secondaryDeck === 'chapter-approved' && primaryDeck !== 'chapter-approved-duel' && <section className="panel setup-secondary-picker">
            <label>Secondary strategy<select value={officialStrategy} onChange={(event) => setOfficialStrategy(event.target.value as OfficialSecondaryStrategy)}>
              <option value="tactical">Tactical · draw two each Command phase</option>
              <option value="fixed">Fixed · choose two eligible cards per player</option>
            </select></label>
            <InfoDisclosure label="Secondary strategy details"><p className="context-note">{officialStrategy === 'fixed'
              ? 'Fixed: choose two eligible cards for each player. They remain active throughout the battle and each can score up to 20 VP.'
              : 'Tactical: draw two cards at each own Command phase. There is no free general mulligan: once per battle New Orders replaces one card for 1 CP; specific When Drawn cards have their own replacement rules. At your turn end, discard active cards to gain 1 CP.'} Secondary scores up to 15 VP per round and 45 VP per battle. {duel ? 'Duel uses the two-player card text.' : 'FFA cards keep their assigned Secondary Rival. Enemy presence checks both other armies. Only your army’s kills against that assigned Rival score. Tactical is recommended; Fixed is experimental because target availability depends on the matchup.'}</p></InfoDisclosure>
        </section>}
        {playMode === 'shared' && <div className="panel setup-footer"><p>After creating your room, players join, choose their own rosters and dispositions. You can configure turn order and Doubles teams as host inside the lobby.</p><button className="button button--gold" type="submit" disabled={sharedWorking || loading || !sharedConfigured}>{sharedWorking ? 'Creating room…' : `Create ${doubles ? '4-player' : mode === 'ffa3' ? '3-player' : '2-player'} lobby`}</button></div>}
      </section>
      <section className="setup-step" hidden={step !== 2 || playMode === 'shared'} aria-label="Commanders">
        <h2>Assign your commanders</h2>
        <div className="setup-toolbar panel">
          <div><span className="eyebrow">Assignment tools</span><strong>Manual or randomized</strong></div>
          <button type="button" onClick={randomizeZones}>Randomize zones</button>
          <button type="button" onClick={randomizeTurns}>Randomize turn order</button>
        </div>
        {doubles && <div className="cauldron-player-grid cauldron-player-grid--duel">{([0, 1] as const).map((team) => {
          const captain = activePlayers[teamCaptainIndex(team)]
          const opponent = activePlayers[teamCaptainIndex(1 - team)]
          const mission = captain.forceDisposition && opponent.forceDisposition
            ? DUEL_MISSIONS[DUEL_PRIMARY_MATRIX[captain.forceDisposition][opponent.forceDisposition]] : undefined
          return <section className="panel player-setup-card" key={team}>
            <h3>Team {team === 0 ? 'Alpha' : 'Bravo'} · Shared Force</h3>
            <label>Team name<input value={teamNames[team]} onChange={(event) => setTeamNames((current) => current.map((name, index) => index === team ? event.target.value : name))} /></label>
            <p className="context-note">Seats {team * 2 + 1} & {team * 2 + 2} · one turn, CP pool, VP score and Secondary deck.</p>
            {playMode === 'shared' ? <p className="context-note">The team captain chooses Force Disposition in the online lobby.</p> : <label>Force Disposition<select value={captain.forceDisposition ?? 'take-and-hold'} onChange={(event) => updatePlayer(teamCaptainIndex(team), 'forceDisposition', event.target.value as typeof DISPOSITIONS[number])}>
              {DISPOSITIONS.map((disposition) => <option key={disposition} value={disposition}>{DISPOSITION_NAMES[disposition]}</option>)}
            </select></label>}
            {playMode === 'local' && mission && <p className="plan-description">Team Primary: <strong>{mission.name}</strong> · <a href={mission.url} target="_blank" rel="noreferrer">Full card</a></p>}
            <label>Force composition<select value={teamTypes[team]} onChange={(event) => setTeamTypes((current) => current.map((kind, i) => i === team ? event.target.value as 'unified' | 'convenience' : kind) as typeof current)}>
              <option value="convenience">Force of Convenience · different faction keywords</option>
              <option value="unified">Unified Force · same required faction keywords</option>
            </select></label>
            {playMode === 'shared' ? <p className="context-note">A valid team Warlord will be assigned from the armies staged in the lobby.</p> : <label>One Warlord for the force<select value={teamWarlords[team] && warlordOptions(team).some((option) => option.value === teamWarlords[team]) ? teamWarlords[team] : warlordOptions(team)[0]?.value ?? ''} onChange={(event) => setTeamWarlords((current) => ({ ...current, [team]: event.target.value }))}>
              {warlordOptions(team).length === 0 && <option value="">Import an army with a CHARACTER</option>}
              {warlordOptions(team).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select></label>}
            <InfoDisclosure label="GW Doubles restrictions"><p className="context-note">One Warlord and one Force Disposition per force. Unique datasheets, Epic Heroes, Enhancements and once-per-army upgrades cannot be duplicated across teammates. Unified/Convenience classification must match the faction keywords; the app does not invent synergies. For GW Doubles, both teammates share one CP pool and one set of Stratagem usage limits.</p></InfoDisclosure>
          </section>
        })}</div>}
        <div className={`cauldron-player-grid${officialPair ? ' cauldron-player-grid--duel' : ''}`}>{activePlayers.map((player, index) => (
          <section className="panel player-setup-card" key={player.id}>
            <div className="player-setup-card__title"><span>Player {index + 1}</span><strong>Zone {player.deploymentZone} · Turn {player.turnPosition}</strong></div>
            {playMode === 'shared' ? <p className="context-note">Player {index + 1}: name is loaded from their online profile when joining the lobby (guests keep a seat label).</p> : <label>Player name<input id={`commander-${index}-name`} aria-describedby={invalidFieldId === `commander-${index}-name` ? 'setup-error' : undefined} aria-invalid={invalidFieldId === `commander-${index}-name`} value={player.name} required onChange={(event) => updatePlayer(index, 'name', event.target.value)} /></label>}
            {playMode === 'shared' ? <p className="context-note">This commander will select their own army after joining the lobby.</p> : <label>Saved army<select id={`commander-${index}-army`} aria-describedby={invalidFieldId === `commander-${index}-army` ? 'setup-error' : undefined} aria-invalid={invalidFieldId === `commander-${index}-army`} value={player.armyId} onChange={(event) => updatePlayer(index, 'armyId', event.target.value)}>
              {armies.map((army) => <option key={army.id} value={army.id}>{army.faction} · {army.totalPoints} pts · {army.name} · {rosterRows.find(r => r.id === army.id)?.status ?? 'local'}{army.library?.variantOf ? ' · Variant' : ''}</option>)}
            </select></label>}
            {playMode === 'local' && player.armyId && <Link className="button button--small" target="_blank" rel="noopener noreferrer" to={`/army/${encodeURIComponent(player.armyId)}/edit`}>Edit roster ↗</Link>}
            {!doubles && <div className="setup-pair">
              <label>Deployment zone<select id={`commander-${index}-zone`} aria-describedby={invalidFieldId === `commander-${index}-zone` ? 'setup-error' : undefined} aria-invalid={invalidFieldId === `commander-${index}-zone`} value={player.deploymentZone} onChange={(event) => updatePlayer(index, 'deploymentZone', event.target.value as DeploymentZone)}>
                {(duel ? ['A', 'B'] : ['A', 'B', 'C']).map((zone) => <option key={zone}>{zone}</option>)}
              </select></label>
              <label>Turn position<select id={`commander-${index}-turn`} aria-describedby={invalidFieldId === `commander-${index}-turn` ? 'setup-error' : undefined} aria-invalid={invalidFieldId === `commander-${index}-turn`} value={player.turnPosition} onChange={(event) => updatePlayer(index, 'turnPosition', Number(event.target.value) as TurnPosition)}>
                {(duel ? [1, 2] : [1, 2, 3]).map((position) => <option key={position}>{position}</option>)}
              </select></label>
            </div>}
            {primaryDeck === 'chapter-approved-duel' && duel ? <>
              {playMode === 'shared' ? <p className="context-note">Force Disposition is selected by this commander after claiming their online seat.</p> : <label>Force Disposition<select value={player.forceDisposition} onChange={(event) => updatePlayer(index, 'forceDisposition', event.target.value as typeof DISPOSITIONS[number])}>
                {DISPOSITIONS.map((disposition) => <option key={disposition} value={disposition}>{DISPOSITION_NAMES[disposition]}</option>)}
              </select></label>}
              {playMode === 'local' && player.forceDisposition && activePlayers[1 - index]?.forceDisposition && (() => {
                const mission = DUEL_MISSIONS[DUEL_PRIMARY_MATRIX[player.forceDisposition!][activePlayers[1 - index].forceDisposition!]]
                return <p className="plan-description">Your Primary: <strong>{mission.name}</strong> · <a href={mission.url} target="_blank" rel="noreferrer">Full card</a></p>
              })()}
            </> : primaryDeck === 'chapter-approved-ffa' && !duel ? <>
              <label>11th edition Primary<select value={player.officialPrimaryId} onChange={(event) => updatePlayer(index, 'officialPrimaryId', event.target.value as OfficialPrimaryId)}>
                {OFFICIAL_PRIMARY_IDS.map((id) => <option key={id} value={id}>{OFFICIAL_PRIMARY_MISSIONS[id].name}</option>)}
              </select></label>
              {player.officialPrimaryId && <InfoDisclosure label="Selected Primary rules"><p className="plan-description">{BALANCED_OFFICIAL_PRIMARY_MISSIONS[player.officialPrimaryId].description} <a href={BALANCED_OFFICIAL_PRIMARY_MISSIONS[player.officialPrimaryId].url} target="_blank" rel="noreferrer">Read original card</a></p><ul className="context-note">{BALANCED_OFFICIAL_PRIMARY_MISSIONS[player.officialPrimaryId].rules.map((rule) => <li key={rule}>{rule}</li>)}</ul></InfoDisclosure>}
            </> : primaryDeck === 'cauldron' ? <><label>Operational Plan<select value={player.operationalPlanId} onChange={(event) => updatePlayer(index, 'operationalPlanId', event.target.value as OperationalPlanId)}>
              {OPERATIONAL_PLAN_IDS.map((planId) => <option key={planId} value={planId}>{OPERATIONAL_PLAN_DEFINITIONS[planId].name}</option>)}
            </select></label>
            <p className="plan-description">{OPERATIONAL_PLAN_DEFINITIONS[player.operationalPlanId].description}</p></> : null}
            {primaryDeck === 'chapter-approved-duel' && (!doubles || index === 0 || index === 2) && <label>Secondary strategy<select value={duelStrategies[player.id]} onChange={(event) => setDuelStrategies((current) => ({ ...current, [player.id]: event.target.value as OfficialSecondaryStrategy }))}>
              <option value="tactical">Tactical · draw from deck</option><option value="fixed">Fixed · choose two cards</option>
            </select></label>}
            {(primaryDeck === 'chapter-approved-duel' ? (!doubles || index === 0 || index === 2) && duelStrategies[player.id] === 'fixed' : secondaryDeck === 'chapter-approved' && officialStrategy === 'fixed') && <div className="setup-pair">
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
      <section className="setup-step" hidden={step !== 3 || playMode === 'shared'} aria-label="Battlefield and start">
        <h2>Battlefield & Start</h2>
        <section className="panel setup-summary" aria-label="Battle setup summary"><div className="rules-source__heading"><span className="eyebrow">Ready to deploy</span><RulesSourceBadge source={rules.source} /></div><h3>{rules.title}</h3><p>{rules.primary} · {rules.secondary}</p><ul>{activePlayers.map((player) => <li key={player.id}><strong>{playMode === 'shared' ? `Seat ${activePlayers.indexOf(player) + 1} · name from profile` : player.name}</strong><span>Zone {player.deploymentZone} · Turn {player.turnPosition}</span><small>{playMode === 'shared' ? 'Army chosen in lobby' : armies.find((army) => army.id === player.armyId)?.faction}</small></li>)}</ul></section>
        <section className="panel setup-footer setup-footer--battle-mode">
          {primaryDeck === 'chapter-approved-duel' && <><InfoDisclosure label="Official pairing & setup instructions"><p className="context-note">Secondary deck: Chapter Approved 2026–27. Each force chooses Tactical or Fixed. In Doubles, both players share their active Secondary cards. Pick the recommended layout for your pairing. Roll for Attacker/Defender, then roll separately for first turn as described in the <a href="https://assets.warhammer-community.com/eng_14-10_wh40k_event_companion-rdwnqprl4c-nj8oqogadv.pdf" target="_blank" rel="noreferrer">Warhammer Event Companion</a>. Assign A/B HOME to your actual objectives and turn positions to the first-turn roll. The app’s central and expansion names are generic; use the physical layout to identify them.</p></InfoDisclosure><Link to="/terrain-layouts" target="_blank">Preview official terrain layouts</Link><label>Pairing layout<select value={officialLayout} onChange={(event) => setOfficialLayout(Number(event.target.value) as 1 | 2 | 3)}><option value={1}>Layout A</option><option value={2}>Layout B</option><option value={3}>Layout C</option></select></label></>}
          {primaryDeck === 'chapter-approved-duel' && <label>Attacker HOME assignment<select value={attackerHomeZone} onChange={(event) => setAttackerHomeZone(event.target.value as 'A' | 'B')}><option value="A">A-HOME · Attacker / B-HOME · Defender</option><option value="B">B-HOME · Attacker / A-HOME · Defender</option></select></label>}
          <label>Guidance level<select value={guidance} onChange={(event) => setGuidance(event.target.value as GuidanceLevel)}>
            <option value="guided">Guided — full contextual reminders</option>
            <option value="fast">Fast — essential reminders only</option>
          </select></label>
          {!officialPair && <label>Objective layout<select id="battlefield-layout" aria-describedby={invalidFieldId === 'battlefield-layout' ? 'setup-error' : undefined} aria-invalid={invalidFieldId === 'battlefield-layout'} value={secondaryDeck === 'chapter-approved' ? 'expanded-7' : objectiveLayout} disabled={secondaryDeck === 'chapter-approved'} onChange={(event) => setObjectiveLayout(event.target.value as CauldronObjectiveLayout)}>
            <option value="expanded-7">{secondaryDeck === 'chapter-approved' ? '7 objectives — 3 HOME + AB/AC/BC-NEUTRAL + CENTER' : '7 objectives — 3 HOME + N1/N2/N3 + CENTER'}</option>
            <option value="classic-6">6 objectives — 3 HOME + N1/N2/N3</option>
          </select></label>}
          {playMode === 'shared' && <label>Shared host seat<select value={hostPlayerId} onChange={(event) => setHostPlayerId(event.target.value)}>
            {activePlayers.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
          </select></label>}
          {secondaryDeck === 'cauldron' && primaryDeck !== 'chapter-approved-duel' && (duel
            ? <p className="context-note">Duel changes only the player topology: 2 turns per Battle Round, A/B HOME objectives, and a permanent Rival. Primary, Secondary, Operational Plans and scoring caps use the Cauldron {CAULDRON_RULESET_VERSION} balance rules.</p>
            : <p className="context-note">The 7-objective layout treats CENTER as a neutral objective. Gather Intel requires CENTER.</p>)}
          {playMode === 'shared' && <p className="context-note">Every commander picks their army in the lobby and marks Ready. The temporary setup does not publish your library rosters to other players. The battle starts only when all seats are ready.</p>}
          <div className="setup-submit-actions">
            {playMode === 'shared' ? <button className="button button--gold" type="submit" disabled={loading || sharedWorking || !sharedConfigured}>
              {sharedWorking ? 'Preparing shared lobby…' : `Create ${doubles ? '4-player' : duel ? '2-player' : '3-player'} lobby`}
            </button> : <button className="button button--gold" type="submit" disabled={loading || sharedWorking}>{loading ? 'Preparing…' : 'Start locally'}</button>}
          </div>
        </section>
      </section>
      {(localError || error) && <div id="setup-error" className="alert alert--danger" role="alert">{localError ?? error}</div>}
      {playMode === 'local' && <div className="setup-step-actions">
        {step > 1 && <button type="button" onClick={() => goToStep((step - 1) as 1 | 2)}>Back</button>}
        {step < 3 && <button className="button--gold" type="button" onClick={() => goToStep((step + 1) as 2 | 3)}>{step === 1 ? 'Next: Commanders' : 'Next: Battlefield'}</button>}
      </div>}
      </form>
    </div>
  )
}

import { getCauldronConfig } from '../../rulesets/cauldronFFA3/sessionConfig'
import { getDuelMission, isDuelPrimary } from '../../rulesets/cauldronFFA3/duelPrimary'
import { getOfficialPrimaryId, isOfficialPrimary, OFFICIAL_PRIMARY_MISSIONS } from '../../rulesets/cauldronFFA3/officialPrimary'
import { buildBattleChronicle, type ChronicleEntry } from './chronicle'
import { totalScore } from './selectors'
import type { BattleSession } from './types'
import { buildUnitPerformance, type BattlePerformance } from './unitPerformance'

export type NarrativeStyle = 'tactical' | 'war-chronicle'
export type BattleReport = {
  schemaVersion: 1
  gameId: string
  status: BattleSession['state']['status']
  mode: string
  missions: string[]
  roundsPlayed: number
  maxRounds: number
  ranking: Array<{ playerId: string; name: string; faction: string; vp: number; rank: number }>
  winnerPlayerIds: string[]
  rounds: Array<{ round: number; highlights: ChronicleEntry[]; leaderChanges: string[] }>
  performance: BattlePerformance
  narrativeStyle: NarrativeStyle
  narrative: string[]
}

/** Optional future adapters can consume this factual report; offline is default. */
export type BattleNarrator = { generate: (report: BattleReport, style: NarrativeStyle) => Promise<string[]> }

export function buildBattleReport(session: BattleSession, style: NarrativeStyle = 'tactical'): BattleReport {
  const chronicle = buildBattleChronicle(session)
  const performance = buildUnitPerformance(session, chronicle)
  const ranked = session.setup.turnOrder.map((playerId) => {
    const player = session.state.players[playerId]
    const army = player.armyId ? session.setup.armies[player.armyId] : undefined
    return { playerId, name: player.name, faction: player.faction ?? army?.faction ?? 'Unknown faction', vp: totalScore(player) }
  }).sort((a, b) => b.vp - a.vp)
  const ranking = ranked.map((player) => ({ ...player, rank: 1 + ranked.filter((other) => other.vp > player.vp).length }))
  const winnerPlayerIds = session.state.status === 'completed' ? ranking.filter((player) => player.rank === 1).map((player) => player.playerId) : []
  const config = session.setup.rulesetId === 'cauldron-ffa-3' ? getCauldronConfig(session) : undefined
  const mode = `${session.setup.players.length === 3 ? 'FFA 3' : session.setup.players.length === 2 ? 'Duel 1v1' : `${session.setup.players.length} players`} · ${config ? `${config.primaryDeck?.startsWith('chapter-approved') ? '11th Edition' : 'Cauldron'} Primary · ${config.secondaryDeck === 'chapter-approved' ? 'Chapter Approved' : 'Cauldron'} Secondary` : session.setup.rulesetId}`
  const missions = config ? session.setup.players.map((player) => {
    const mission = isOfficialPrimary(session) ? OFFICIAL_PRIMARY_MISSIONS[getOfficialPrimaryId(session, player.id)].name
      : isDuelPrimary(session) ? getDuelMission(session, player.id).name
        : config.playerConfigs[player.id]?.initialOperationalPlanId?.replaceAll('_', ' ').toLowerCase() ?? 'Primary'
    return `${player.name}: ${mission}`
  }) : [session.setup.rulesetId]
  const totals = new Map(ranking.map((player) => [player.playerId, 0]))
  let leading = ''
  const changes = new Map<number, string[]>()
  for (const entry of chronicle) {
    if (entry.scoreDelta === undefined || !entry.scorePlayerId) continue
    totals.set(entry.scorePlayerId, (totals.get(entry.scorePlayerId) ?? 0) + entry.scoreDelta)
    const highest = Math.max(...totals.values())
    const leaderIds = session.setup.turnOrder.filter((id) => totals.get(id) === highest).join('|')
    if (highest > 0 && leading && leaderIds !== leading) {
      const names = leaderIds.split('|').map((id) => session.state.players[id].name).join(' / ')
      changes.set(entry.round, [...(changes.get(entry.round) ?? []), `Zmiana prowadzenia po zapisanym punktowaniu: ${names} (${highest} VP).`])
    }
    if (highest > 0) leading = leaderIds
  }
  const rounds = [...new Set(chronicle.map((entry) => entry.round))].map((round) => ({
    round, highlights: chronicle.filter((entry) => entry.round === round && entry.highlight && entry.category !== 'flow'),
    leaderChanges: changes.get(round) ?? [],
  }))
  const report: BattleReport = {
    schemaVersion: 1, gameId: session.setup.gameId, status: session.state.status, mode, missions,
    roundsPlayed: session.state.round, maxRounds: session.setup.maxRounds, ranking, winnerPlayerIds,
    rounds, performance, narrativeStyle: style, narrative: [],
  }
  report.narrative = generateOfflineNarrative(report, style)
  return report
}

export function generateOfflineNarrative(report: BattleReport, style: NarrativeStyle): string[] {
  const paragraphs = report.rounds.map(({ round, highlights, leaderChanges }) => {
    const opening = style === 'war-chronicle' ? `Kronika — runda ${round}.` : `Runda ${round}.`
    const events = highlights.filter((entry) => ['kills', 'combat', 'objectives', 'vp', 'actions', 'stratagems'].includes(entry.category))
    if (events.length === 0) return `${opening} Brak zapisanych kluczowych wydarzeń.`
    return `${opening} ${events.map((entry) => narrateEntry(entry, report, style)).join(' ')}${leaderChanges.length ? ` ${leaderChanges.join(' ')}` : ''}`
  })
  if (report.status === 'completed') {
    const winners = report.ranking.filter((player) => report.winnerPlayerIds.includes(player.playerId))
    paragraphs.push(winners.length > 1 ? `Bitwa zakończyła się remisem: ${winners.map((player) => player.name).join(' / ')} — ${winners[0]?.vp ?? 0} VP.`
      : `Zwycięzca: ${winners[0]?.name ?? '—'} — ${winners[0]?.vp ?? 0} VP.`)
  } else paragraphs.push(report.status === 'active' ? 'To podgląd trwającej bitwy; wynik nie jest końcowy.' : 'Rozgrywka została przerwana; zachowano zapisany przebieg i punkty.')
  return paragraphs
}

function narrateEntry(entry: ChronicleEntry, report: BattleReport, style: NarrativeStyle): string {
  const change = entry.unitChange
  const playerName = (id: string) => report.ranking.find((player) => player.playerId === id)?.name ?? id
  let text = entry.description
  if (entry.category === 'kills' && change) {
    const attacker = change.attacker ? `${change.attacker.name} (${playerName(change.attacker.playerId)})` : change.attackerPlayerId ? playerName(change.attackerPlayerId) : 'Nieustalone źródło'
    const lost = Math.max(0, change.modelsBefore - change.modelsAfter)
    const killed = !change.destroyedBefore && change.destroyedAfter
    const phase = entry.phase === 'SHOOTING' ? 'W fazie ostrzału' : entry.phase === 'FIGHT' ? 'W walce wręcz' : `W fazie ${entry.phase.replace('_', ' ')}`
    text = killed ? style === 'war-chronicle' ? `${phase} ${change.target.name} (${playerName(change.target.playerId)}) został zniszczony przez ${attacker}` : `${attacker} wyeliminował ${change.target.name} (${playerName(change.target.playerId)})`
      : `${attacker} zniszczył ${lost} modeli ${change.target.name}`
  } else if (entry.category === 'vp' && entry.scorePlayerId) {
    text = `${playerName(entry.scorePlayerId)}: zmiana wyniku o ${(entry.scoreDelta ?? 0) >= 0 ? '+' : ''}${entry.scoreDelta} VP`
    if (entry.event.type === 'STATE_CORRECTED') text += ' (korekta hosta)'
  } else if (entry.category === 'objectives' && entry.objectiveName) text = `${entry.objectiveName}: ${entry.objectiveControllerPlayerId ? `kontrolę przejął ${playerName(entry.objectiveControllerPlayerId)}` : 'punkt pozostał bez kontroli'}`
  else if (entry.event.type === 'STRATAGEM_USED') text = `${playerName(entry.event.payload.playerId)} użył stratagemu „${entry.event.payload.stratagemName}” (${entry.event.payload.cpCost} CP)`
  else if (entry.missionAction && entry.event.type !== 'MISSION_ACTION_STARTED') text = `${entry.missionAction.name}: ${entry.event.type === 'MISSION_ACTION_COMPLETED' ? 'ukończona' : 'nieukończona'} przez ${entry.missionAction.unitId ? entry.description.split(':')[0] : playerName(entry.missionAction.playerId)}`
  return `${text}.${entry.note ? ` Notatka gracza: „${entry.note}”.` : ''}`
}

const markdownText = (value: string): string => value.replaceAll('|', '\\|').replace(/[\r\n]+/g, ' ').replace(/([*`<>])/g, '\\$1')
const amount = (value: number): string => String(Math.round(value * 10) / 10)

export function battleReportMarkdown(report: BattleReport): string {
  const lines = [
    '# Battle Report', '', `**${report.status === 'active' ? 'Podgląd — bitwa trwa' : report.status === 'completed' ? 'Wynik końcowy' : 'Bitwa przerwana'}**`,
    markdownText(report.mode), `Rundy: ${report.roundsPlayed} / ${report.maxRounds}`, '', '## Wynik', '',
    '| Miejsce | Gracz | Frakcja | VP |', '| --- | --- | --- | --- |',
    ...report.ranking.map((player) => `| ${player.rank} | ${markdownText(player.name)} | ${markdownText(player.faction)} | ${player.vp} |`),
    '', '## Misje', '', ...report.missions.map((mission) => `- ${markdownText(mission)}`), '', '## Armie', '',
    '| Gracz | Punkty przeciwników zniszczone | Własne straty | Kills | Punkty przypisane tylko graczowi |',
    '| --- | --- | --- | --- | --- |',
    ...report.performance.armies.map((army) => `| ${markdownText(report.ranking.find((player) => player.playerId === army.playerId)?.name ?? army.playerId)} | ${amount(army.enemyPointsDestroyed)} | ${amount(army.ownPointsLost)} | ${army.kills} | ${amount(army.playerOnlyPoints)} |`),
    '', '## Przebieg', '',
    ...report.narrative.flatMap((paragraph) => [markdownText(paragraph), '']), '## Efektywność jednostek', '',
    '| Gracz / jednostka | Koszt | Kills | Modele wroga | Punkty zniszczone | Combat ROI | Akcje | Potwierdzone VP z akcji | Stan |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...report.performance.units.map((unit) => `| ${markdownText(report.ranking.find((player) => player.playerId === unit.playerId)?.name ?? unit.playerId)} / ${markdownText(unit.name)} | ${unit.startingPoints} | ${unit.kills} | ${unit.modelsDestroyed} | ${amount(unit.enemyPointsDestroyed)} | ${unit.combatRoi === null ? '—' : `${Math.round(unit.combatRoi)}%`} | ${unit.completedMissionActions} | ${unit.missionVp ?? '—'} | ${unit.survived ? `${unit.remainingModels} modeli${unit.remainingWounds === undefined ? '' : `, ${unit.remainingWounds} W`}` : `Zniszczona w rundzie ${unit.destructionRound ?? '—'}`} |`),
    '', '## Wyróżnienia', '',
    ...report.performance.awards.map((award) => `- **${award.title}**: ${award.winners.map((unit) => markdownText(`${unit.name} (${report.ranking.find((player) => player.playerId === unit.playerId)?.name ?? unit.playerId})`)).join(', ')}. ${award.rule}`),
    '', '## Zasady statystyk', '',
    'Punkty zniszczone są wartością netto utraconych modeli: koszt jednostki / początkowa liczba modeli. Wskrzeszenie lub korekta stanu cofa ostatnie przypisane straty, również z poprzednich rund. Kill otrzymuje sprawca ostatniego ciosu i znika po przywróceniu celu. ROI = punkty zniszczone / koszt własnej jednostki × 100%.',
    'Obrażenia obejmują wyłącznie zapisane spadki wounds jednostek jednomodelowych; pełne KO nie dopisuje obrażeń. Wartości bez jednoznacznego sprawcy jednostkowego pozostają na poziomie gracza. Kontrola objective nie daje automatycznie VP konkretnej jednostce. Wielojednostkowe nagrody VP nie są dzielone przez zgadywanie. Zmiana wyniku Secondary przez korektę usuwa pewność wcześniejszych VP z akcji. Inne kategorie i późniejsze potwierdzone nagrody zachowują przypisanie; tabela pokazuje znany wkład.',
    `Straty bez przypisanego gracza: ${amount(report.performance.unattributedPoints)} pkt. Punkty przypisane tylko do gracza: ${amount(report.performance.armies.reduce((sum, army) => sum + army.playerOnlyPoints, 0))} pkt.`,
  ]
  return lines.join('\n')
}

export function downloadBattleReport(report: BattleReport, format: 'markdown' | 'json'): void {
  const content = format === 'markdown' ? battleReportMarkdown(report) : JSON.stringify(report, null, 2)
  const url = URL.createObjectURL(new Blob([content], { type: format === 'markdown' ? 'text/markdown;charset=utf-8' : 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `battle-report-${report.gameId.replace(/[^a-zA-Z0-9_-]/g, '_')}.${format === 'markdown' ? 'md' : 'json'}`
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

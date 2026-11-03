import { battleReportMarkdown, downloadBattleReport, type BattleReport } from '../../domain/battle/battleReport'
import { formatDuration } from '../battleClock/model'
import { chronicleCopy } from './chronicleCopy'
import { useLocale } from './locale'

export function narrativeCopy(report: BattleReport): string[] {
  if (useLocale.getState().locale === 'pl') return report.narrative
  const paragraphs = report.rounds.map(round => {
    const opening = report.narrativeStyle === 'war-chronicle' ? `Chronicle — Round ${round.round}.` : `Round ${round.round}.`
    const highlights = round.highlights.map(entry => `${chronicleCopy(entry)}.${entry.note ? ` Player note: “${entry.note}”.` : ''}`).join(' ')
    return `${opening} ${highlights || 'No key events recorded.'}`
  })
  if (report.status === 'completed') {
    const winners = report.ranking.filter(player => report.winnerPlayerIds.includes(player.playerId))
    paragraphs.push(`${winners.length > 1 ? 'Tie' : 'Winner'}: ${winners.map(player => player.name).join(' / ')} — ${winners[0]?.vp ?? 0} VP.`)
  } else paragraphs.push(report.status === 'active' ? 'Live preview; the result is provisional.' : 'Battle abandoned; recorded progress and scores are retained.')
  return paragraphs
}

const cell = (value: unknown) => String(value ?? '—').replace(/[\r\n]+/g, ' ').replaceAll('|', '\\|').replace(/([*`<>])/g, '\\$1')
const table = (headers: string[], rows: unknown[][]) => [headers, headers.map(() => '---'), ...rows].map(row => `| ${row.map(cell).join(' | ')} |`).join('\n')

/** Human-readable export in the selected language; raw JSON remains canonical. */
export function reportMarkdownCopy(report: BattleReport): string {
  if (useLocale.getState().locale === 'pl') return battleReportMarkdown(report)
  const owner = (id: string) => report.commanderNames?.[id] ?? report.ranking.find(player => player.playerId === id)?.name ?? id
  const source = (id: string | undefined, name?: string) => id ? `${name ?? 'Unknown unit'} (${owner(id)})` : 'Unknown / environment'
  const lines = [
    '# Battle Report', '', `**${report.status === 'active' ? 'Live preview' : report.status === 'completed' ? 'Final result' : 'Abandoned battle'}**`,
    cell(report.mode), `Rounds: ${report.roundsPlayed} / ${report.maxRounds}`, '', '## Result', '',
    table(['Rank', 'Player', 'Faction', 'VP'], report.ranking.map(player => [player.rank, player.name, player.faction, player.vp])),
    '', '## Missions', '', ...report.missions.map(mission => `- ${cell(mission)}`),
    '', '## Army performance', '', table(['Player', 'Enemy points destroyed', 'Own points lost', 'Kills', 'Player-only points'], report.performance.armies.map(army => [owner(army.playerId), army.enemyPointsDestroyed, army.ownPointsLost, army.kills, army.playerOnlyPoints])),
    '', '## Combat engagements', '', table(['Attacker', 'Target', 'Net models', 'Net points', 'Logged W (Partial)', 'Unit kills'], report.performance.engagements.map(entry => [source(entry.attackerPlayerId, entry.attacker?.name), `${entry.target.name} (${owner(entry.target.playerId)})`, entry.modelsDestroyed, entry.enemyPointsDestroyed, entry.loggedWounds, entry.kills])),
    '', '## Narrative', '', ...narrativeCopy(report).flatMap(paragraph => [cell(paragraph), '']),
    '## Unit performance', '', table(['Player / unit', 'Cost', 'Kills', 'Enemy models', 'Enemy points', 'Combat ROI', 'Completed actions', 'Confirmed action VP', 'Remaining models'], report.performance.units.map(unit => [`${owner(unit.playerId)} / ${unit.name}`, unit.startingPoints, unit.kills, unit.modelsDestroyed, unit.enemyPointsDestroyed, unit.combatRoi === null ? '—' : `${Math.round(unit.combatRoi)}%`, unit.completedMissionActions, unit.missionVp, unit.remainingModels])),
    '', '## Logged damage', '', table(['Unit', 'Dealt W (Partial)', 'Received W (Partial)', 'Healed W', 'Restored models'], report.performance.units.map(unit => [unit.name, unit.damageDealt, unit.damageReceived, unit.woundsHealed, unit.modelsRestored])),
    '', '## Awards', '', ...report.performance.awards.map(award => `- **${cell(award.title)}**: ${award.winners.map(unit => cell(`${unit.name} (${owner(unit.playerId)})`)).join(', ')}. ${cell(award.rule)}`),
    '', '## Data and methods', '',
    'Casualty values are net of restoration and corrections, estimated from unit points divided by starting models. Combat ROI = net enemy points destroyed / own starting points × 100%. The last hit receives the unit kill; restoration removes that credit.',
    'Wounds are recorded effective damage (Partial), never inferred from model losses. Unknown sources remain unknown. Action VP needs an unambiguous unit; shared awards are not split by guessing. Objective control does not identify the capturing unit. A score correction may make earlier action attribution uncertain.',
    `Unattributed points: ${report.performance.unattributedPoints}.`,
  ]
  if (report.timeStatistics?.length) lines.push('', '## Time Statistics', '', table(['Player / team', 'Used', 'Remaining', 'Handoffs', 'Overtime'], report.timeStatistics.map(row => [row.name, formatDuration(row.usedMs), formatDuration(row.remainingMs), row.manualPasses, formatDuration(row.overtimeMs)])))
  return lines.join('\n')
}

export function downloadReportCopy(report: BattleReport, format: 'markdown' | 'json') {
  if (format === 'json' || useLocale.getState().locale === 'pl') { downloadBattleReport(report, format); return }
  const url = URL.createObjectURL(new Blob([reportMarkdownCopy(report)], { type: 'text/markdown;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `battle-report-${report.gameId.replace(/[^a-zA-Z0-9_-]/g, '_')}.md`
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

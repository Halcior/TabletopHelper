import { t as tr } from '../../features/i18n/locale'
import { useState } from 'react'
import type { BattleSession } from '../../domain/battle/types'
import {
  DISPOSITION_NAMES, duelPrimaryPreview, getCauldronConfig, getDuelConditions, getDuelMission,
  getDuelPrimaryCommit, type DuelCondition, type DuelReviewWindow,
} from '../../rulesets/cauldronFFA3'
import { useBattleStore } from '../../stores/battleStore'
import { InfoDisclosure } from '../ui/InfoDisclosure'

const WINDOW_LABEL: Record<DuelReviewWindow, string> = {
  command: 'End of Command phase', turn: 'End of turn', battle: 'End of battle',
}

type DuelPrimaryPanelProps = {
  session: BattleSession
  playerId: string
  window?: DuelReviewWindow
  editable: boolean
}

export function DuelPrimaryPanel(props: DuelPrimaryPanelProps) {
  const { session, playerId, window } = props
  // Keep drafts on tab switches, but require fresh checks in each scoring context.
  const context = [session.setup.gameId, playerId, session.state.round,
    session.state.activePlayerId, session.state.phase, window ?? 'none'].join(':')
  return <DuelPrimaryForm key={context} {...props} />
}

function DuelPrimaryForm({ session, playerId, window, editable }: DuelPrimaryPanelProps) {
  const [selections, setSelections] = useState<Record<string, number>>({})
  const [error, setError] = useState('')
  const reviewDuelPrimary = useBattleStore((state) => state.reviewDuelPrimary)
  const mission = getDuelMission(session, playerId)
  const config = getCauldronConfig(session)
  const disposition = config.playerConfigs[playerId].forceDisposition
  const opponentId = session.state.turnOrder.find((id) => id !== playerId)
  const opponentDisposition = opponentId && config.playerConfigs[opponentId].forceDisposition
  const conditions = window ? getDuelConditions(session, playerId, window) : []
  const reviewed = window ? getDuelPrimaryCommit(session, playerId, window) : undefined
  let preview = { raw: 0, awarded: 0, scoredInRound: 0 }
  try { if (window) preview = duelPrimaryPreview(session, playerId, window, selections) } catch { /* Show the precise validation error when submitted. */ }

  function change(condition: DuelCondition, value: number) {
    setError('')
    setSelections((current) => {
      const next = { ...current, [condition.id]: value }
      if (condition.group && value) for (const other of conditions) if (other.group === condition.group && other.id !== condition.id) next[other.id] = 0
      if (condition.cumulativeWith && value > (next[condition.cumulativeWith] ?? 0)) next[condition.cumulativeWith] = value
      if (!value) for (const other of conditions) if (other.cumulativeWith === condition.id) next[other.id] = 0
      return next
    })
  }

  function submit() {
    try {
      duelPrimaryPreview(session, playerId, window!, selections)
      reviewDuelPrimary(playerId, window!, selections)
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }

  return <section className="panel turn-review-section duel-primary-panel">
    <div className="section-heading"><div><span className="eyebrow">{tr("11th edition Primary · ")}{disposition ? DISPOSITION_NAMES[disposition] : ''}</span><h2>{session.state.players[playerId]?.name}: {mission.name}</h2></div><strong>{session.state.players[playerId]?.score.primary ?? 0} {tr(" / 45 VP")}</strong></div>
    <InfoDisclosure label={tr("Primary card & pairing layout")}>
    <p className="context-note">{tr("Your card from the Force Disposition matrix. Read the ")}<a href={mission.url} target="_blank" rel="noreferrer">{tr("full Primary card")}</a> {tr(" for exact wording. ")}{disposition && opponentDisposition && <>{tr("Open ")}<a href={`https://gdmissions.app/11th/layouts/${disposition}/${opponentDisposition}`} target="_blank" rel="noreferrer">{tr("the pairing layouts")}</a> {tr(" and select ")}{['A (1)', 'B (2)', 'C (3)'][(config.officialLayout ?? 1) - 1]} {tr(" to match your setup. ")}</>}{tr("The physical layout sets objectives and terrain. Each scoring window is locked after confirmation.")}</p>
    </InfoDisclosure>
    {mission.rule && <p><strong>{tr("Special rule:")}</strong> {mission.rule}</p>}
    {mission.action && <p><strong>{tr("Objective Action:")}</strong> {mission.action}</p>}
    {window ? <>
      <h3>{WINDOW_LABEL[window]} {tr(" · Battle Round ")}{session.state.round}</h3>
      {session.state.round === 5 && window === 'turn' && <p className="context-note">{tr("In round 5, conditions normally scored at the end of Command score at the end of your turn instead.")}</p>}
      {conditions.length === 0 && <p>{tr("No Primary conditions score in this window. Confirm it to close the turn.")}</p>}
      {conditions.map((condition) => <div className="centre-oc-row duel-primary-condition" key={condition.id}>
        <span><strong>{condition.vp} {tr(" VP")}{condition.count ? tr(' each') : ''}</strong><small>{tr(condition.label)}</small>{condition.group && <small>{tr("Choose one alternative · ")}{condition.group}</small>}</span>
        {reviewed ? <strong>{(reviewed.selections[condition.id] ?? 0) * condition.vp} {tr(" VP")}</strong> : condition.count ? <label>{tr("Count ")}<input type="number" min={0} max={20} step={1} value={selections[condition.id] ?? 0} disabled={!editable} onChange={(event) => change(condition, Number(event.target.value))} />
        </label> : <label className="review-check-row"><input type="checkbox" checked={!!selections[condition.id]} disabled={!editable} onChange={(event) => change(condition, event.target.checked ? 1 : 0)} /><span>{tr("Met")}</span></label>}
      </div>)}
      {reviewed ? <p className="secondary-feedback" role="status">{tr("✓ Reviewed · +")}{reviewed.pointsAwarded} {tr(" VP.")}</p> : <>
        <p className="context-note">{tr("Confirmed ")}{preview.raw} {tr(" VP → award ")}{preview.awarded} {tr(" VP after the 15 VP round and 45 VP battle limits. Current round: ")}{preview.scoredInRound} {tr(" VP.")}</p>
        {error && <p className="alert alert--danger">{tr(error)}</p>}
        {editable && <button className="button--gold" type="button" onClick={submit}>{tr("Confirm ")}{WINDOW_LABEL[window].toLowerCase()} · +{preview.awarded} {tr(" VP")}</button>}
      </>}
    </> : <details className="duel-primary-conditions"><summary>{tr("Conditions by scoring window")}</summary>
      {(['command', 'turn', 'either', 'battle'] as const).map((timing) => {
        const checks = mission.conditions.filter((entry) => entry.window === timing)
        return checks.length ? <div key={timing}><strong>{timing === 'command' ? tr('Command phase (rounds 2–4; turn end in round 5)') : timing === 'battle' ? tr('End of battle') : timing === 'either' ? tr('End of either player’s turn') : tr('End of your turn')}</strong><ul>{checks.map((entry) => <li key={entry.id}>{entry.vp} {tr(" VP")}{entry.count ? tr(' each') : ''} · {tr(entry.label)}{entry.from || entry.through ? tr(` (rounds ${entry.from ?? 1}–${entry.through ?? 5})`, " (rounds {0}–{1})") : ''}</li>)}</ul></div> : null
      })}
    </details>}
  </section>
}

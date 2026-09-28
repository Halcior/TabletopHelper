import { useState } from 'react'
import type { BattleSession } from '../../domain/battle/types'
import {
  DISPOSITION_NAMES, duelPrimaryPreview, getCauldronConfig, getDuelConditions, getDuelMission,
  getDuelPrimaryCommit, type DuelCondition, type DuelReviewWindow,
} from '../../rulesets/cauldronFFA3'
import { useBattleStore } from '../../stores/battleStore'

const WINDOW_LABEL: Record<DuelReviewWindow, string> = {
  command: 'End of Command phase', turn: 'End of turn', battle: 'End of battle',
}

export function DuelPrimaryPanel({ session, playerId, window, editable }: {
  session: BattleSession
  playerId: string
  window?: DuelReviewWindow
  editable: boolean
}) {
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
    <div className="section-heading"><div><span className="eyebrow">11th edition Primary · {disposition ? DISPOSITION_NAMES[disposition] : ''}</span><h2>{session.state.players[playerId]?.name}: {mission.name}</h2></div><strong>{session.state.players[playerId]?.score.primary ?? 0} / 45 VP</strong></div>
    <p className="context-note">Your card from the Force Disposition matrix. Read the <a href={mission.url} target="_blank" rel="noreferrer">full Primary card</a> for exact wording. {disposition && opponentDisposition && <>Open <a href={`https://gdmissions.app/11th/layouts/${disposition}/${opponentDisposition}`} target="_blank" rel="noreferrer">the pairing layouts</a> and select {['A (1)', 'B (2)', 'C (3)'][(config.officialLayout ?? 1) - 1]} to match your setup. </>}The physical layout sets objectives and terrain. Each scoring window is locked after confirmation.</p>
    {mission.rule && <p><strong>Special rule:</strong> {mission.rule}</p>}
    {mission.action && <p><strong>Objective Action:</strong> {mission.action}</p>}
    {window ? <>
      <h3>{WINDOW_LABEL[window]} · Battle Round {session.state.round}</h3>
      {session.state.round === 5 && window === 'turn' && <p className="context-note">In round 5, conditions normally scored at the end of Command score at the end of your turn instead.</p>}
      {conditions.length === 0 && <p>No Primary conditions score in this window. Confirm it to close the turn.</p>}
      {conditions.map((condition) => <div className="centre-oc-row duel-primary-condition" key={condition.id}>
        <span><strong>{condition.vp} VP{condition.count ? ' each' : ''}</strong><small>{condition.label}</small>{condition.group && <small>Choose one alternative · {condition.group}</small>}</span>
        {reviewed ? <strong>{(reviewed.selections[condition.id] ?? 0) * condition.vp} VP</strong> : condition.count ? <label>Count
          <input type="number" min={0} max={20} step={1} value={selections[condition.id] ?? 0} disabled={!editable} onChange={(event) => change(condition, Number(event.target.value))} />
        </label> : <label className="review-check-row"><input type="checkbox" checked={!!selections[condition.id]} disabled={!editable} onChange={(event) => change(condition, event.target.checked ? 1 : 0)} /><span>Met</span></label>}
      </div>)}
      {reviewed ? <p className="secondary-feedback" role="status">✓ Reviewed · +{reviewed.pointsAwarded} VP.</p> : <>
        <p className="context-note">Confirmed {preview.raw} VP → award {preview.awarded} VP after the 15 VP round and 45 VP battle limits. Current round: {preview.scoredInRound} VP.</p>
        {error && <p className="alert alert--danger">{error}</p>}
        {editable && <button className="button--gold" type="button" onClick={submit}>Confirm {WINDOW_LABEL[window].toLowerCase()} · +{preview.awarded} VP</button>}
      </>}
    </> : <div className="duel-primary-conditions">
      {(['command', 'turn', 'either', 'battle'] as const).map((timing) => {
        const checks = mission.conditions.filter((entry) => entry.window === timing)
        return checks.length ? <div key={timing}><strong>{timing === 'command' ? 'Command phase (rounds 2–4; turn end in round 5)' : timing === 'battle' ? 'End of battle' : timing === 'either' ? 'End of either player’s turn' : 'End of your turn'}</strong><ul>{checks.map((entry) => <li key={entry.id}>{entry.vp} VP{entry.count ? ' each' : ''} · {entry.label}{entry.from || entry.through ? ` (rounds ${entry.from ?? 1}–${entry.through ?? 5})` : ''}</li>)}</ul></div> : null
      })}
    </div>}
  </section>
}

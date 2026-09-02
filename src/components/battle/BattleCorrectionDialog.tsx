import { useState } from 'react'
import type { BattleCorrection, BattleSession, ScoreCategory } from '../../domain/battle/types'

type CorrectionKind = BattleCorrection['kind']

type BattleCorrectionDialogProps = {
  session: BattleSession
  onApply: (correction: BattleCorrection, reason: string) => void
  onClose: () => void
}

const kinds: Array<{ value: CorrectionKind; label: string }> = [
  { value: 'CP', label: 'Command Points' },
  { value: 'SCORE', label: 'Score' },
  { value: 'UNIT_MODELS', label: 'Unit models alive' },
  { value: 'UNIT_WOUNDS', label: 'Unit wounds' },
  { value: 'UNIT_BATTLESHOCK', label: 'Unit Battle-shock' },
  { value: 'OBJECTIVE_CONTROL', label: 'Objective controller' },
  { value: 'OBJECTIVE_OC', label: 'Objective OC' },
]

export function BattleCorrectionDialog({ session, onApply, onClose }: BattleCorrectionDialogProps) {
  const [kind, setKind] = useState<CorrectionKind>('CP')
  const [playerId, setPlayerId] = useState(session.state.turnOrder[0])
  const [unitId, setUnitId] = useState('')
  const [objectiveId, setObjectiveId] = useState(Object.keys(session.state.objectives)[0] ?? '')
  const [category, setCategory] = useState<ScoreCategory>('adjustment')
  const [value, setValue] = useState(0)
  const [battleShocked, setBattleShocked] = useState(false)
  const [controllerPlayerId, setControllerPlayerId] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const player = session.state.players[playerId]
  const units = Object.values(player?.units ?? {})
  const selectedUnitId = units.some((unit) => unit.unitId === unitId) ? unitId : units[0]?.unitId ?? ''

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const cleanReason = reason.trim()
    if (!cleanReason) return
    let correction: BattleCorrection
    switch (kind) {
      case 'CP': correction = { kind, playerId, value }; break
      case 'SCORE': correction = { kind, playerId, category, value }; break
      case 'UNIT_MODELS': correction = { kind, playerId, unitId: selectedUnitId, value }; break
      case 'UNIT_WOUNDS': correction = { kind, playerId, unitId: selectedUnitId, value }; break
      case 'UNIT_BATTLESHOCK': correction = { kind, playerId, unitId: selectedUnitId, value: battleShocked }; break
      case 'OBJECTIVE_CONTROL': correction = { kind, objectiveId, controllerPlayerId }; break
      case 'OBJECTIVE_OC': correction = { kind, objectiveId, playerId, value }; break
    }
    onApply(correction, cleanReason)
    onClose()
  }

  const needsPlayer = kind !== 'OBJECTIVE_CONTROL'
  const needsUnit = kind === 'UNIT_MODELS' || kind === 'UNIT_WOUNDS' || kind === 'UNIT_BATTLESHOCK'
  const needsObjective = kind === 'OBJECTIVE_CONTROL' || kind === 'OBJECTIVE_OC'
  const needsNumber = kind !== 'UNIT_BATTLESHOCK' && kind !== 'OBJECTIVE_CONTROL'

  return <div className="battle-confirmation-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="panel battle-confirmation correction-dialog" role="dialog" aria-modal="true" aria-labelledby="correction-title" onMouseDown={(event) => event.stopPropagation()}>
      <span className="eyebrow">Recorded administration</span>
      <h2 id="correction-title">Correct battle state</h2>
      <p>This records a new correction in the battle log. It does not delete or rewrite earlier actions.</p>
      <form className="correction-form" onSubmit={submit}>
        <label><span>What is wrong?</span><select value={kind} onChange={(event) => setKind(event.target.value as CorrectionKind)}>
          {kinds.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select></label>
        {needsPlayer && <label><span>Commander</span><select value={playerId} onChange={(event) => { setPlayerId(event.target.value); setUnitId('') }}>
          {session.state.turnOrder.map((id) => <option key={id} value={id}>{session.state.players[id].name}</option>)}
        </select></label>}
        {needsUnit && <label><span>Unit</span><select value={selectedUnitId} onChange={(event) => setUnitId(event.target.value)}>
          {units.map((unit) => {
            const definition = player?.armyId ? session.setup.armies[player.armyId]?.units.find((item) => item.id === unit.unitId) : undefined
            return <option key={unit.unitId} value={unit.unitId}>{definition?.name ?? unit.unitId}</option>
          })}
        </select></label>}
        {needsObjective && <label><span>Objective</span><select value={objectiveId} onChange={(event) => setObjectiveId(event.target.value)}>
          {Object.values(session.state.objectives).map((objective) => <option key={objective.id} value={objective.id}>{objective.name}</option>)}
        </select></label>}
        {kind === 'SCORE' && <label><span>Score category</span><select value={category} onChange={(event) => setCategory(event.target.value as ScoreCategory)}>
          <option value="primary">Primary</option><option value="secondary">Secondary</option><option value="plan">Operational Plan</option><option value="adjustment">Adjustment</option>
        </select></label>}
        {kind === 'OBJECTIVE_CONTROL' && <label><span>Controller</span><select value={controllerPlayerId ?? ''} onChange={(event) => setControllerPlayerId(event.target.value || null)}>
          <option value="">Uncontrolled</option>
          {session.state.turnOrder.map((id) => <option key={id} value={id}>{session.state.players[id].name}</option>)}
        </select></label>}
        {kind === 'UNIT_BATTLESHOCK' && <label className="correction-check"><input type="checkbox" checked={battleShocked} onChange={(event) => setBattleShocked(event.target.checked)} /><span>Unit is Battle-shocked</span></label>}
        {needsNumber && <label><span>Correct value</span><input type="number" min="0" step="1" value={value} onChange={(event) => setValue(Number(event.target.value))} /></label>}
        <label className="correction-reason"><span>Reason</span><input maxLength={160} placeholder="e.g. accidental double tap" required value={reason} onChange={(event) => setReason(event.target.value)} /></label>
        <div className="battle-confirmation__actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="button--gold" disabled={!reason.trim() || (needsUnit && !selectedUnitId) || (needsObjective && !objectiveId)}>Record correction</button>
        </div>
      </form>
    </section>
  </div>
}

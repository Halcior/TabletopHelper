import { useState } from 'react'
import type { UnitDefinition, UnitState } from '../../domain/army/types'
import type { BattleEventInput, CombatAttribution, CombatResolution } from '../../domain/battle/types'
import { combatProfiles, combatStatus, readCombatState } from '../../domain/battle/combatState'

export function CombatControls({ unit, state, playerId, source = {}, dispatch, canEdit = true, damageOnly = false, compact = false }: {
  unit: UnitDefinition; state: UnitState; playerId: string; source?: CombatAttribution
  dispatch: (event: BattleEventInput) => void; canEdit?: boolean; damageOnly?: boolean; compact?: boolean
}) {
  const profiles = combatProfiles(unit)
  const groups = readCombatState(unit, state)
  const [selected, setSelected] = useState(profiles.length === 1 ? profiles[0].id : '')
  const [amount, setAmount] = useState(1)
  const [measure, setMeasure] = useState<'wounds' | 'models'>('wounds')
  const [kind, setKind] = useState<CombatResolution['kind']>('damage')
  const [note, setNote] = useState('')
  const [acrossProfiles, setAcrossProfiles] = useState(false)
  const [profileAmounts, setProfileAmounts] = useState<Record<string, number>>({})
  const [detailed, setDetailed] = useState(false)
  const profile = profiles.find((candidate) => candidate.id === selected)
  const group = groups?.[selected]
  const known = group?.woundsPerModel !== undefined
  const alive = (group?.modelsAlive ?? 0) > 0
  const enabled = canEdit && Boolean(group)
  function record(operation: CombatResolution['kind'], value: number, metric: 'wounds' | 'models', useDetailedAllocation = false) {
    const useProfiles = useDetailedAllocation && acrossProfiles
    if (!enabled && !useProfiles) return
    if (!canEdit || !groups) return
    const allocations = useProfiles ? profiles.filter((item) => (profileAmounts[item.id] ?? 0) > 0).map((item) => ({ profileId: item.id, [metric]: profileAmounts[item.id] })) : [{ profileId: selected, [metric]: value }]
    dispatch({ type: 'UNIT_COMBAT_RESOLVED', payload: {
      playerId, unitId: unit.id, kind: operation,
      allocations,
      ...(operation === 'damage' ? source : {}),
      ...(detailed && note.trim() ? { note: note.trim() } : {}),
      ...(operation === 'restore' && state.destroyed ? { allowDestroyed: true } : {}),
    } })
  }
  return <div className={`combat-controls${compact ? ' combat-controls--compact' : ''}`}>
    <div className="combat-vitals"><strong>{state.modelsAlive} / {unit.startingModels} models</strong><span>{combatStatus(unit, state)}</span></div>
    {profiles.length > 1 && <label><span>Allocate to model profile</span><select aria-label={`Model profile for ${unit.name}`} value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">Choose profile…</option>{profiles.map((item) => <option key={item.id} value={item.id}>{item.name} · {groups?.[item.id]?.modelsAlive ?? '?'} / {item.startingModels}</option>)}</select></label>}
    {!groups && <p className="context-note">Old losses have no model profile allocation. Use Correct battle state → Combat profiles to confirm survivors.</p>}
    {group && <p className="combat-current">Current model: <strong>{alive ? group.currentModelWounds ?? '?' : 0} / {group.woundsPerModel ?? '?'} W</strong></p>}
    {group && !known && <small>Wounds unknown. Record model losses or confirm the profile in Correct battle state.</small>}
    <div className="combat-quick-actions">
      <button type="button" disabled={!enabled || !alive || !known} onClick={() => record('damage', 1, 'wounds')}>−1 W</button>
      {damageOnly ? <button type="button" disabled={!enabled || !alive || !known} onClick={() => record('damage', 3, 'wounds')}>−3 W</button> : <button type="button" disabled={!enabled || !alive || !known || group?.currentModelWounds === group?.woundsPerModel} onClick={() => record('heal', 1, 'wounds')}>+1 W</button>}
      <button type="button" disabled={!enabled || !alive} onClick={() => record('damage', 1, 'models')}>−1 Model</button>
      {!damageOnly && <button type="button" disabled={!enabled || state.destroyed || (group?.modelsAlive ?? 0) >= (profile?.startingModels ?? 0)} onClick={() => record('restore', 1, 'models')}>+1 Model</button>}
    </div>
    {!compact && alive && known && (group.woundsPerModel ?? 0) <= 6 && <div className="combat-wound-presets" aria-label="Set current model Wounds">{Array.from({ length: group.woundsPerModel! }, (_, index) => index + 1).map((value) => <button type="button" key={value} aria-label={`Set current model to ${value} W`} disabled={!enabled || value === group.currentModelWounds || (damageOnly && value > group.currentModelWounds!)} onClick={() => record(value < group.currentModelWounds! ? 'damage' : 'heal', Math.abs(value - group.currentModelWounds!), 'wounds')}>{value}/{group.woundsPerModel}</button>)}</div>}
    {!damageOnly && state.destroyed && <button type="button" disabled={!enabled} onClick={() => record('restore', 1, 'models')}>Return 1 model to battlefield</button>}
    <details className="combat-resolution" open={detailed} onToggle={(event) => setDetailed(event.currentTarget.open)}>
      <summary>Detailed Combat Logging</summary>
      <p>Enter Wounds actually lost after saves and allocation, not weapon Damage. One confirmation records one attack.</p>
      {!damageOnly && <label><span>Operation</span><select value={kind} onChange={(event) => { const value = event.target.value as CombatResolution['kind']; setKind(value); setMeasure(value === 'restore' ? 'models' : 'wounds') }}><option value="damage">Damage</option><option value="heal">Heal Wounds</option><option value="restore">Restore models</option></select></label>}
      <label><span>Record</span><select value={measure} onChange={(event) => setMeasure(event.target.value as 'wounds' | 'models')} disabled={kind !== 'damage'}><option value="wounds">Effective Wounds</option><option value="models">Models lost / restored</option></select></label>
      {profiles.length > 1 && <label><input type="checkbox" checked={acrossProfiles} onChange={(event) => setAcrossProfiles(event.target.checked)} />Allocate this resolution across profiles</label>}
      {acrossProfiles && profiles.map((item) => <label key={item.id}><span>{item.name} · {measure}</span><input type="number" min="0" max="10000" step="1" value={profileAmounts[item.id] ?? 0} onChange={(event) => setProfileAmounts((current) => ({ ...current, [item.id]: Number(event.target.value) }))} /></label>)}
      {!acrossProfiles && <label><span>Amount</span><input type="number" min="1" max="10000" step="1" value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></label>}
      <label><span>Attack note (optional)</span><input maxLength={240} value={note} onChange={(event) => setNote(event.target.value)} /></label>
      {state.destroyed && kind === 'restore' && <p>Confirm only if a rule allows this destroyed unit to return.</p>}
      <button type="button" disabled={acrossProfiles ? !canEdit || !groups || !Object.values(profileAmounts).some((value) => value > 0) || Object.values(profileAmounts).some((value) => !Number.isSafeInteger(value) || value < 0 || value > 10000) || (measure === 'wounds' && profiles.some((item) => (profileAmounts[item.id] ?? 0) > 0 && groups[item.id]?.woundsPerModel === undefined)) : !enabled || !Number.isSafeInteger(amount) || amount < 1 || amount > 10000 || (measure === 'wounds' && !known) || (kind !== 'restore' && !alive)} onClick={() => record(damageOnly ? 'damage' : kind, amount, measure, true)}>{kind === 'damage' ? 'Apply Damage' : kind === 'heal' ? 'Apply Healing' : 'Restore Models'}</button>
    </details>
  </div>
}

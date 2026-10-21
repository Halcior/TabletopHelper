import type { BattleSession, CombatAttribution } from '../../domain/battle/types'

export function CombatSourcePicker({ session, targetPlayerId, value, onChange, disabled }: {
  session: BattleSession
  targetPlayerId: string
  value: CombatAttribution
  onChange: (value: CombatAttribution) => void
  disabled: boolean
}) {
  const attackerId = value.destroyedByPlayerId ?? ''
  const player = session.setup.players.find((entry) => entry.id === attackerId)
  const army = player?.armyId ? session.setup.armies[player.armyId] : undefined
  const units = (army?.units ?? []).filter((unit) => !session.state.players[attackerId]?.units[unit.id]?.destroyed)
  return <section className="combat-source panel" aria-label="Combat attribution">
    <div><span className="eyebrow">Credit partial and final casualties</span><h3>Combat attribution</h3><p>Choose who inflicted the next losses. Quick Wounds, model casualties and full eliminations keep this source in Chronicle and the report. Change the attacker for split fire; earlier records will not change.</p></div>
    <div className="combat-source__selectors">
      <label><span>Damaged / models lost to</span><select disabled={disabled} value={attackerId} onChange={(event) => onChange({ destroyedByPlayerId: event.target.value || null, note: value.note })}>
        {session.setup.players.filter((entry) => entry.id !== targetPlayerId).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}{entry.id === session.state.activePlayerId ? ' · current' : ''}</option>)}
        <option value="">Unknown / environment</option>
      </select></label>
      <label><span>Attacking unit (optional)</span><select disabled={disabled || !attackerId} value={value.attackerUnitId ?? ''} onChange={(event) => onChange({ ...value, attackerUnitId: event.target.value || null })}>
        <option value="">Unknown unit · player attribution only</option>
        {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}{unit.leaderOfUnitId ? ' · Leader' : ''}</option>)}
      </select></label>
    </div>
    <details className="combat-source__note"><summary>Optional combat note</summary><label><span>Combat note (applies to following losses)</span><input disabled={disabled} maxLength={240} value={value.note ?? ''} placeholder="e.g. Split fire, eastern ruins" onChange={(event) => onChange({ ...value, note: event.target.value })} /></label></details>
  </section>
}

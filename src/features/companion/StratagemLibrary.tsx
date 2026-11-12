import { useState } from 'react'
import type { Army } from '../../domain/army/types'
import type { BattleSession } from '../../domain/battle/types'
import { BATTLE_PHASES } from '../../domain/battle/types'
import { doublesScorekeeperId } from '../../domain/battle/doubles'
import { createPortableUuid } from '../../multiplayer/uuid'
import { useBattleStore } from '../../stores/battleStore'
import { CommandDialog } from '../../components/ui/CommandDialog'
import { t } from '../i18n/locale'
import { type Row, type RulesBundle, ruleText, normalizeName, related } from './data'
import { armyStratagems, phaseVisible } from './matching'

export function StratagemLibrary({ army, bundle, session, playerId, shared, favorites, onFavorites, sheetId }: {
  army: Army; bundle: RulesBundle; session?: BattleSession; playerId?: string; shared: boolean
  favorites: string[]; onFavorites: (ids: string[]) => void; sheetId?: string
}) {
  const [query, setQuery] = useState(''), [phase, setPhase] = useState(''), [turn, setTurn] = useState(''), [kind, setKind] = useState('')
  const [onlyFavorites, setOnlyFavorites] = useState(false), [onlyRelated, setOnlyRelated] = useState(Boolean(sheetId))
  const [selected, setSelected] = useState<Row>(), [confirm, setConfirm] = useState(false)
  const [cost, setCost] = useState(''), [unitId, setUnitId] = useState(''), [operationId, setOperationId] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const available = armyStratagems(bundle, army)
  const relations = sheetId ? new Set(related(bundle, 'Datasheets_stratagems.csv', sheetId).map(row => row.stratagem_id)) : undefined
  const rows = available.filter(row => normalizeName(row.name).includes(normalizeName(query)) && phaseVisible(row, phase)
    && (!turn || !row.turn || !/your|opponent/i.test(row.turn) || /either|any/i.test(row.turn) || row.turn.toLowerCase().includes(turn))
    && (!kind || row.type === kind) && (!onlyFavorites || favorites.includes(row.id))
    && (!onlyRelated || !relations || relations.has(row.id)))
  const poolId = session && playerId ? doublesScorekeeperId(session.setup, playerId) : undefined
  const cp = poolId ? session?.state.players[poolId]?.cp : undefined
  const actual = cost.trim() === '' ? NaN : Number(cost)
  const valid = Number.isSafeInteger(actual) && actual >= 0 && cp !== undefined && actual <= cp
  const uses = session ? Object.values(session.state.companion?.uses ?? {}).filter(use => use.playerId === playerId).reverse() : []
  const canUse = Boolean(session?.state.status === 'active' && playerId && !shared)
  async function submit() {
    if (!selected || !session || !playerId || !valid || !canUse || busy) return
    setBusy(true); setError('')
    try {
      await useBattleStore.getState().recordCompanionUse({ operationId, playerId, stratagemId: selected.id, name: ruleText(selected.name),
        baseCost: /^\d+$/.test(selected.cp_cost) ? Number(selected.cp_cost) : null, cost: actual, datasetId: bundle.id,
        targetUnitId: unitId || undefined, round: session.state.round, phase: session.state.phase, activePlayerId: session.state.activePlayerId })
      setConfirm(false); setSelected(undefined)
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  return <section>
    <h2>{t('Stratagem library')}</h2>
    <p>{t('Filters help find rules; they do not validate legal use. Unknown timing remains visible.')}</p>
    {shared && <p className="alert">{t('Online: reference only. Automatic CP recording requires atomic server validation. Use the existing CP controls for manual tracking.')}</p>}
    <div className="companion-filters">
      <label>{t('Search stratagems')}<input type="search" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <label>{t('Phase')}<select value={phase} onChange={e => setPhase(e.target.value)}><option value="">{t('All phases')}</option>{BATTLE_PHASES.map(value => <option key={value} value={value}>{value.replace('_', ' ')}</option>)}</select></label>
      <label>{t('Turn')}<select value={turn} onChange={e => setTurn(e.target.value)}><option value="">{t('All turns')}</option><option value="your">{t('Your turn')}</option><option value="opponent">{t('Opponent turn')}</option></select></label>
      <label>{t('Type')}<select value={kind} onChange={e => setKind(e.target.value)}><option value="">{t('All types')}</option>{[...new Set(available.map(row => row.type))].map(value => <option key={value}>{value}</option>)}</select></label>
    </div>
    <div className="companion-actions"><button aria-pressed={onlyFavorites} onClick={() => setOnlyFavorites(!onlyFavorites)}>{t('Favorites')}</button>
      {sheetId && <button aria-pressed={onlyRelated} onClick={() => setOnlyRelated(!onlyRelated)}>{t('Related to selected unit')}</button>}
      {session && <button onClick={() => { setPhase(session.state.phase); setTurn(session.state.activePlayerId === poolId ? 'your' : 'opponent') }}>{t('Current battle context')}</button>}
    </div>
    {!rows.length && <p>{t('No matching stratagems. Check imported files, faction and detachment names, or clear the filters.')}</p>}
    {rows.map(row => <div key={row.id} className="companion-stratagem"><button onClick={() => { setSelected(row); setConfirm(false); setError('') }}><strong>{ruleText(row.name)}</strong><span>{row.cp_cost || '?'} CP · {ruleText(row.detachment || row.type)}</span><small>{row.phase ? ruleText(row.phase) : t('Other / check conditions')} · {ruleText(row.turn)}</small></button>
      <button aria-label={`${t('Favorite')} ${ruleText(row.name)}`} aria-pressed={favorites.includes(row.id)} onClick={() => onFavorites(favorites.includes(row.id) ? favorites.filter(id => id !== row.id) : [...favorites, row.id])}>{favorites.includes(row.id) ? '★' : '☆'}</button>
    </div>)}
    {!!uses.length && <section aria-label={t('Recorded stratagems')}><h3>{t('Recorded stratagems')}</h3>{uses.map(use => <div key={use.operationId} className="companion-use"><span>{use.name} · {use.cost} CP · {t(use.status)}{use.reason ? ` · ${use.reason}` : ''}</span>
      {use.status === 'used' && canUse && <button disabled={busy} onClick={() => {
        setBusy(true); setError('')
        void useBattleStore.getState().revertCompanionUse(use.playerId, use.operationId).catch(cause => setError(String(cause))).finally(() => setBusy(false))
      }}>{t('Undo use')}</button>}
    </div>)}</section>}
    {error && <p role="alert">{error}</p>}
    {selected && <CommandDialog label={t(confirm ? 'Confirm stratagem use' : 'Stratagem details')} onClose={() => { if (!busy) setSelected(undefined) }}><section className="companion-confirm">
      <div className="companion-actions"><h2>{ruleText(selected.name)}</h2><button disabled={busy} aria-label={t('Close')} onClick={() => setSelected(undefined)}>×</button></div>
      <p>Wahapedia · 11 · {bundle.upstreamUpdatedAt ?? t('Unknown source date')} · {t('Base cost')}: {selected.cp_cost || '?'} CP</p>
      <p>{ruleText(selected.phase)} · {ruleText(selected.turn)}</p><p className="companion-prose">{ruleText(selected.description)}</p>
      {!confirm ? <><p>{cp !== undefined ? `${session?.state.players[playerId!]?.name}: ${cp} CP` : t('Open an active local battle to record use.')}</p>
        <button disabled={!canUse} onClick={() => { setCost(/^\d+$/.test(selected.cp_cost) ? selected.cp_cost : ''); setUnitId(''); setOperationId(createPortableUuid()); setConfirm(true) }}>{t('Use stratagem')}</button></> : <>
        <p>{session?.state.players[playerId!]?.name} · {army.name}</p>
        {poolId !== playerId && <p>{t('Shared team CP pool')}: {session?.state.players[poolId!]?.name}</p>}
        <label>{t('Actual CP cost')}<input type="number" min="0" step="1" value={cost} onChange={e => setCost(e.target.value)} /></label>
        <strong className="companion-cp">{cp} → {valid ? cp! - actual : '—'} CP</strong>
        <label>{t('Target unit (optional)')}<select value={unitId} onChange={e => setUnitId(e.target.value)}><option value="">{t('No unit selected')}</option>{army.units.map((unit, i) => <option key={unit.id} value={unit.id}>{unit.name} · #{i + 1}</option>)}</select></label>
        <p>{t('You confirm the cost and legal conditions. No rule effects are applied automatically.')}</p>
        <div className="companion-actions"><button disabled={busy} onClick={() => setConfirm(false)}>{t('Cancel')}</button><button disabled={busy || !valid || !canUse} onClick={() => void submit()}>{t('Confirm')}</button></div>
        {error && <p role="alert">{error}</p>}
      </>}
    </section></CommandDialog>}
  </section>
}

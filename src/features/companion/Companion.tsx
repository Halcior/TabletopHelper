import { useEffect, useState } from 'react'
import type { Army } from '../../domain/army/types'
import type { BattleSession } from '../../domain/battle/types'
import { useBattleStore } from '../../stores/battleStore'
import { useRosterScope } from '../armyLibrary/scope'
import { t } from '../i18n/locale'
import { rulesCache, updatePreference } from './cache'
import { type RulesBundle, manifest, normalizeName } from './data'
import { matchSheet } from './matching'
import { RulesManager } from './RulesManager'
import { UnitSheet, RuleDescription } from './UnitSheet'
import { StratagemLibrary } from './StratagemLibrary'
import './companion.css'

export default function Companion({ army, session, playerId, shared = false, canSelect = true }: {
  army: Army; session?: BattleSession; playerId?: string; shared?: boolean; canSelect?: boolean
}) {
  const owner = useRosterScope(s => s.userId)
  const scope = `${owner ?? 'guest'}:${session ? `${session.setup.gameId}:${playerId}` : `army:${army.id}`}`
  const [bundles, setBundles] = useState<RulesBundle[]>([]), [selectedId, setSelectedId] = useState<string>()
  const [matches, setMatches] = useState<Record<string, string>>({}), [favorites, setFavorites] = useState<string[]>([])
  const [unitId, setUnitId] = useState(army.units[0]?.id ?? ''), [mobileDetail, setMobileDetail] = useState(false)
  const [query, setQuery] = useState(''), [tab, setTab] = useState('units'), [sheetId, setSheetId] = useState<string>()
  const [error, setError] = useState(''), [ready, setReady] = useState(false)
  const pinned = playerId ? session?.state.companion?.rules[playerId] : undefined
  const datasetId = session ? pinned?.id : selectedId
  const bundle = bundles.find(row => row.id === datasetId)
  const mappingKey = `${scope}:${datasetId ?? 'roster'}`
  function fail(cause: unknown) { setError(cause instanceof Error ? cause.message : String(cause)) }
  useEffect(() => {
    let active = true; setReady(false)
    Promise.all([rulesCache.bundles.toArray(), rulesCache.preferences.get(scope)]).then(([data, preference]) => {
      if (!active) return
      setBundles(data.sort((a, b) => b.importedAt.localeCompare(a.importedAt))); setSelectedId(preference?.datasetId)
      setUnitId(army.units.some(row => row.id === preference?.unitId) ? preference!.unitId! : army.units[0]?.id ?? '')
      setReady(true)
    }).catch(fail)
    return () => { active = false }
  }, [scope, army])
  useEffect(() => {
    let active = true; setMatches({}); setFavorites([])
    rulesCache.preferences.get(mappingKey).then(preference => { if (active) { setMatches(preference?.matches ?? {}); setFavorites(preference?.favorites ?? []) } }).catch(fail)
    return () => { active = false }
  }, [mappingKey])
  const unit = army.units.find(row => row.id === unitId)
  const filtered = army.units.filter(row => normalizeName(row.name).includes(normalizeName(query)))
  const detachments = new Set(army.detachments.map(row => normalizeName(row.name)))
  const matchedFactions = new Set((bundle?.tables['Factions.csv'] ?? []).filter(row => normalizeName(row.name) === normalizeName(army.faction)).map(row => row.id))
  const detachmentRules = (bundle?.tables['Detachment_abilities.csv'] ?? []).filter(row => matchedFactions.has(row.faction_id) && detachments.has(normalizeName(row.detachment)))
  async function choose(bundle: RulesBundle) {
    if (session && playerId) {
      useBattleStore.getState().dispatch({ type: 'COMPANION_RULES_SELECTED', payload: { playerId, manifest: manifest(bundle) } })
      const problem = useBattleStore.getState().error
      if (problem) throw new Error(problem)
    } else { await updatePreference(scope, { datasetId: bundle.id }); setSelectedId(bundle.id) }
  }
  return <div className="companion" data-testid="battle-companion">
    <header className="companion-header"><div><small>BATTLE COMPANION</small><h2>{army.name}</h2><p>{army.faction} · {army.detachments.map(row => row.name).join(' / ') || t('No detachment data')}</p></div>
      {session && <span>{t('Round')} {session.state.round} · {session.state.phase} · {session.state.players[session.state.activePlayerId]?.name}</span>}
    </header>
    {error && <p role="alert" className="alert">{error}</p>}
    <RulesManager bundles={bundles} selectedId={datasetId} onImported={value => setBundles(current => [value, ...current.filter(row => row.id !== value.id)])} onSelect={choose} canSelect={canSelect && (!session || session.state.status === 'active')} />
    {datasetId && <p className="companion-muted">{t('Selected snapshot')}: 11 · {(bundle ?? pinned)?.upstreamUpdatedAt ?? t('Unknown source date')} · {datasetId.slice(-12)}<br />{t('Imported')}: {(bundle ?? pinned)?.importedAt}</p>}
    {datasetId && !bundle && ready && <p className="alert">{t('The selected snapshot is not cached on this device. Import the matching CSV files or explicitly choose a different snapshot. Roster data remains available.')}</p>}
    {!!bundle?.warnings.length && <details><summary>{t('Incomplete rules data')} ({bundle.warnings.length})</summary><ul>{bundle.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></details>}
    <div className="companion-tabs"><button aria-pressed={tab === 'units'} onClick={() => setTab('units')}>{t('Units')}</button><button aria-pressed={tab === 'stratagems'} onClick={() => { setSheetId(undefined); setTab('stratagems') }}>{t('Stratagems')}</button><button aria-pressed={tab === 'army'} onClick={() => setTab('army')}>{t('Army rules')}</button></div>
    {tab === 'units' && <div className={`companion-layout${mobileDetail ? ' companion-layout--detail' : ''}`}>
      <aside className="companion-units"><label>{t('Search units')}<input type="search" value={query} onChange={e => setQuery(e.target.value)} /></label>
        {filtered.map(row => {
          const index = army.units.indexOf(row), match = bundle ? matchSheet(bundle, army, row, matches[row.id]) : undefined
          const state = playerId ? session?.state.players[playerId]?.units[row.id] : undefined
          return <button className={unitId === row.id ? 'selected' : ''} key={row.id} onClick={() => { setUnitId(row.id); setMobileDetail(true); void updatePreference(scope, { unitId: row.id }).catch(fail) }}>
            <strong>{row.name} <small>#{index + 1}</small></strong><span>{row.startingModels} {t('models in roster')}{state ? ` · ${state.modelsAlive} ${t('remaining')}` : ''}</span><small>{match?.sheet ? t(match.status === 'confirmed' ? 'Confirmed datasheet' : 'Matched datasheet') : t('Check datasheet match')}</small>
          </button>
        })}{!filtered.length && <p>{t('No matching units.')}</p>}
      </aside>
      <div className="companion-detail"><button className="companion-back" onClick={() => setMobileDetail(false)}>← {t('Units')}</button>
        {unit && <UnitSheet key={`${unit.id}:${datasetId}`} army={army} unit={unit} bundle={bundle} confirmedId={matches[unit.id]} phase={session?.state.phase ?? ''}
          onMatch={id => { const next = { ...matches, [unit.id]: id }; setMatches(next); void updatePreference(mappingKey, { matches: next }).catch(fail) }}
          onStratagems={id => { setSheetId(id); setTab('stratagems') }} />}
      </div>
    </div>}
    {tab === 'stratagems' && (bundle ? <StratagemLibrary key={`${mappingKey}:${sheetId}`} army={army} bundle={bundle} session={session} playerId={playerId} shared={shared} favorites={favorites} sheetId={sheetId} onFavorites={ids => { setFavorites(ids); void updatePreference(mappingKey, { favorites: ids }).catch(fail) }} /> : <p>{t('Choose rules data to browse stratagems.')}</p>)}
    {tab === 'army' && <section><h2>{t('Army rules')}</h2><p>{t('Faction abilities are shown on their linked datasheets. Detachment rules below require an exact faction and detachment name match; Force Disposition alone is not a match.')}</p>
      {!detachmentRules.length && <p>{t('No matched detachment rules. Check your roster configuration and imported files.')}</p>}
      {detachmentRules.map(row => <RuleDescription key={row.id} row={{ ...row, name: `${row.detachment} · ${row.name}` }} />)}
    </section>}
    <footer><a href="https://wahapedia.ru/" target="_blank" rel="noreferrer">Powered by Wahapedia</a><p>{t('Cached rules can be read without a connection. Keep this battle open on one device for local CP tracking. Manual matches and favorites are device preferences.')}</p></footer>
  </div>
}

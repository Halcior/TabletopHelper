import { useMemo, useState } from 'react'
import type { Army, UnitDefinition } from '../../domain/army/types'
import { t } from '../i18n/locale'
import { type RulesBundle, type Row, normalizeName, related, ruleText, safeSourceUrl, sheetAbilities } from './data'
import { matchSheet, selectedWeapon } from './matching'

function ProfileTable({ rows, columns }: { rows: Row[]; columns: string[] }) {
  return rows.length ? <div className="companion-table" tabIndex={0}><table><thead><tr>{columns.map(column => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{columns.map(column => <td key={column}>{ruleText(row[column]) || '—'}</td>)}</tr>)}</tbody></table></div> : <p>{t('No profile data available.')}</p>
}
export function RuleDescription({ row }: { row: Row }) {
  return <details className="companion-rule"><summary>{ruleText(row.name) || t('Unnamed rule')}{row.model ? ` · ${ruleText(row.model)}` : ''}{row.parameter ? ` · ${ruleText(row.parameter)}` : ''}</summary>
    {row.type && <small>{ruleText(row.type)}</small>}<p className="companion-prose">{ruleText(row.description) || t('Description unavailable.')}</p>
  </details>
}
export function UnitSheet({ army, unit, bundle, confirmedId, onMatch, onStratagems, phase }: {
  army: Army; unit: UnitDefinition; bundle?: RulesBundle; confirmedId?: string
  onMatch: (id: string) => void; onStratagems: (id: string) => void; phase: string
}) {
  const [mapping, setMapping] = useState(false), [query, setQuery] = useState(unit.name)
  const match = bundle ? matchSheet(bundle, army, unit, confirmedId) : undefined
  const sheet = match?.sheet
  const modelRows = bundle && sheet ? related(bundle, 'Datasheets_models.csv', sheet.id) : []
  const weapons = bundle && sheet ? related(bundle, 'Datasheets_wargear.csv', sheet.id)
    .sort((a, b) => Number(selectedWeapon(unit, b)) - Number(selectedWeapon(unit, a))) : []
  const abilities = useMemo(() => bundle && sheet ? sheetAbilities(bundle, sheet.id) : [], [bundle, sheet])
  const choices = (bundle?.tables['Datasheets.csv'] ?? []).filter(row => normalizeName(row.name).includes(normalizeName(query))).slice(0, 80)
  const source = bundle?.tables['Source.csv']?.find(row => row.id === sheet?.source_id)
  const differences = modelRows.length === 1 && unit.stats && Object.entries({ M: unit.stats.movement, T: unit.stats.toughness, Sv: unit.stats.save, W: unit.stats.wounds, Ld: unit.stats.leadership, OC: unit.stats.objectiveControl })
    .filter(([key, value]) => value !== undefined && modelRows[0][key] && normalizeName(String(value)) !== normalizeName(modelRows[0][key])).map(([key]) => key)
  const weaponDifferences = [...unit.rangedWeapons, ...unit.meleeWeapons].flatMap(weapon => {
    const candidates = weapons.filter(row => normalizeName(row.name) === normalizeName(weapon.name) && (row.type === 'Melee') === (weapon.type === 'melee'))
    if (candidates.length !== 1) return []
    const compared = { range: weapon.range, A: weapon.attacks, BS_WS: weapon.skill, S: weapon.strength, AP: weapon.ap, D: weapon.damage }
    return Object.entries(compared).some(([key, value]) => value !== undefined && candidates[0][key] && normalizeName(value) !== normalizeName(candidates[0][key])) ? [weapon.name] : []
  })
  return <article className="companion-sheet">
    <header><h2>{unit.name}</h2><p>{unit.startingModels} {t('models in roster')} · {unit.points} pts</p></header>
    <p className="companion-muted">{sheet ? `${t(match?.status === 'confirmed' ? 'Manually confirmed' : 'Exact name & faction match')} · ${sheet.name}` : t('Missing or uncertain datasheet match. Roster data remains available.')}</p>
    {bundle && <button onClick={() => setMapping(!mapping)}>{t('Choose datasheet manually')}</button>}
    {mapping && <div className="companion-matching"><label>{t('Search all datasheets')}<input value={query} onChange={event => setQuery(event.target.value)} /></label>
      <button onClick={() => { onMatch(''); setMapping(false) }}>{t('Clear manual match')}</button>
      {choices.map(row => <button key={row.id} onClick={() => { onMatch(row.id); setMapping(false) }}>{row.name} · {row.faction_id} · {row.id}</button>)}
      {choices.length === 80 && <p>{t('Showing 80 results. Refine your search.')}</p>}
    </div>}
    {unit.leaderOfUnitId && <p>{t('Leading')}: {army.units.find(row => row.id === unit.leaderOfUnitId)?.name ?? unit.leaderOfUnitId}</p>}
    {!!unit.ledByUnitIds.length && <p>{t('Leaders')}: {unit.ledByUnitIds.map(id => army.units.find(row => row.id === id)?.name ?? id).join(', ')}</p>}
    {!!unit.enhancements.length && <p>{t('Enhancements')}: {unit.enhancements.map(row => row.name).join(', ')}</p>}
    {!!differences && differences.length > 0 && <p role="status" className="alert">{t('Roster and rules differ')}: {differences.join(', ')}. {t('Both sources are preserved below.')}</p>}
    {weaponDifferences.length > 0 && <p role="status" className="alert">{t('Roster and rules differ')}: {weaponDifferences.join(', ')}. {t('Both sources are preserved below.')}</p>}
    {sheet && bundle && <>
      <p className="companion-muted">Wahapedia · {t('Edition')} 11 · {source?.name ?? t('Unknown source')}{source?.version ? ` · ${source.version}` : ''}{source?.errata_date ? ` · ${source.errata_date}` : ''}</p>
      {source?.edition && source.edition !== '11' && <p className="alert">{t('Source record lists a different edition. Check the source before use.')} ({source.edition})</p>}
      {safeSourceUrl(sheet.link) && <a href={safeSourceUrl(sheet.link)} target="_blank" rel="noreferrer">{t('Open source datasheet')}</a>}
      <h3>{t('Characteristics')}</h3><ProfileTable rows={modelRows} columns={['name', 'M', 'T', 'Sv', 'inv_sv', 'W', 'Ld', 'OC']} />
      {modelRows.filter(row => row.inv_sv_descr).map((row, i) => <p key={i} className="companion-prose">{ruleText(row.inv_sv_descr)}</p>)}
      <p>{related(bundle, 'Datasheets_keywords.csv', sheet.id).map(row => ruleText(row.keyword)).join(' · ') || t('Keywords unavailable.')}</p>
      <p>{t('Equipment marked “In roster” has an exact name match. Other profiles are available options; selection is unknown. Verify quantities and variants in the roster.')}</p>
      {['Range', 'Melee'].map(kind => <section key={kind} className={phase === (kind === 'Range' ? 'SHOOTING' : 'FIGHT') ? 'companion-phase-focus' : ''}>
        <h3>{t(kind === 'Range' ? 'Ranged weapons' : 'Melee weapons')}</h3>
        {weapons.filter(row => row.type.toLowerCase() === kind.toLowerCase()).map((row, i) => <div className="companion-weapon" key={i}>
          <h4>{ruleText(row.name)} <small>{t(selectedWeapon(unit, row) ? 'In roster' : 'Selection unknown')}</small></h4>
          <ProfileTable rows={[row]} columns={['range', 'A', 'BS_WS', 'S', 'AP', 'D']} /><p className="companion-prose">{ruleText(row.description)}</p>
        </div>)}
        {!weapons.some(row => row.type.toLowerCase() === kind.toLowerCase()) && <p>{t('No profile data available.')}</p>}
      </section>)}
      <h3>{t('Abilities')} · {t('Other / check conditions')}</h3>
      <p className="companion-muted">{t('Ability timing is not structured in this export. All abilities remain visible.')}</p>
      {abilities.map((row, i) => <RuleDescription key={i} row={row} />)}{!abilities.length && <p>{t('No ability data available.')}</p>}
      {!!sheet.damaged_description && <RuleDescription row={{ name: `Damaged · ${sheet.damaged_w}`, description: sheet.damaged_description }} />}
      {!!sheet.transport && <RuleDescription row={{ name: 'Transport', description: sheet.transport }} />}
      <details className="companion-rule"><summary>{t('Loadout & options')}</summary><p className="companion-prose">{ruleText(sheet.loadout)}</p>{related(bundle, 'Datasheets_options.csv', sheet.id).map((row, i) => <p className="companion-prose" key={i}>{ruleText(row.description)}</p>)}</details>
      <button onClick={() => onStratagems(sheet.id)}>{t('Related stratagems')}</button>
    </>}
    <details className="companion-rule" open={!sheet}><summary>{t('Original roster data')}</summary>
      <p>{t('Imported roster data is reference only; its date and rules accuracy are not verified.')}</p>
      {unit.stats && <ProfileTable rows={[Object.fromEntries(Object.entries(unit.stats).map(([key, value]) => [key, value == null ? '' : String(value)]))]} columns={Object.keys(unit.stats)} />}
      {unit.modelGroups.map((group, i) => <p key={i}>{group.startingCount} × {group.name}: {group.equipment.join(', ') || t('Equipment unknown')}</p>)}
      {[...unit.rangedWeapons, ...unit.meleeWeapons].map((weapon, i) => <div key={i}><strong>{weapon.name}</strong><ProfileTable rows={[weapon as unknown as Row]} columns={['range', 'attacks', 'skill', 'strength', 'ap', 'damage']} /><p>{weapon.keywords.join(', ')}</p></div>)}
      {unit.abilities.map((ability, i) => <RuleDescription key={i} row={{ name: ability.name, description: ability.description ?? '' }} />)}
      {unit.enhancements.map((enhancement, i) => <RuleDescription key={i} row={{ name: enhancement.name, description: enhancement.description ?? '' }} />)}
    </details>
  </article>
}

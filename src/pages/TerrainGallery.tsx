import { t as tr } from '../features/i18n/locale'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BattlefieldMapSvg, DEFAULT_TERRAIN_LAYERS, TerrainLayerControls, TerrainLegend } from '../components/battle/BattlefieldMapSvg'
import { battlefieldView, DISPOSITION_ORDER, FOOTPRINT_LIBRARY, OFFICIAL_BOARD_SOURCE, OFFICIAL_LAYOUTS, OFFICIAL_SOURCES } from '../domain/battlefield/layouts'
import type { BoardPresentation } from '../domain/battlefield/types'

const dispositionName = (value: string) => value.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ')

export default function TerrainGallery() {
  const [params, setParams] = useSearchParams()
  const [rotated, setRotated] = useState(false)
  const [layers, setLayers] = useState(DEFAULT_TERRAIN_LAYERS)
  const [selectedArea, setSelectedArea] = useState('D1')
  const a = DISPOSITION_ORDER.includes(params.get('a') ?? '') ? params.get('a')! : 'take-and-hold'
  const b = DISPOSITION_ORDER.includes(params.get('b') ?? '') ? params.get('b')! : 'take-and-hold'
  const variant = ['A','B','C'].includes(params.get('variant') ?? '') ? params.get('variant')! : 'A'
  const doubles = params.get('mode') === '2v2'
  function change(key: string, value: string) { setParams(current => { const next = new URLSearchParams(current); next.set(key,value); return next }, { replace: true }) }
  const pair = [a,b].sort((x,y) => DISPOSITION_ORDER.indexOf(x)-DISPOSITION_ORDER.indexOf(y))
  const layout = OFFICIAL_LAYOUTS[[...pair,variant].join('|')]
  if (!layout?.terrainAreas) return <div className="page-shell"><h1>{tr("Layout unavailable")}</h1><p>{tr("The requested source geometry could not be loaded.")}</p><Link to="/terrain-layouts">{tr("Reset gallery")}</Link></div>
  const view = battlefieldView(layout.widthCm, layout.heightCm, rotated)
  const presentation: BoardPresentation = {
    title: `${doubles ? 'Official Doubles 2v2' : 'Official Duel 1v1'} · Layout ${variant}`,
    official: true, terrain: layout,
    deploymentAreas: [{ zone:'A',path:layout.deploymentPaths.attacker },{zone:'B',path:layout.deploymentPaths.defender}],
    territoryPaths: layout.territoryPaths, unplacedIds: [],
  }
  const points = Object.entries(layout.objectives).flatMap(([category,positions]) => positions.map((point,index) => ({
    ...point, id: ({ homeAttacker:'A-HOME', homeDefender:'B-HOME', central:`CENTER-${index+1}`, expansion:`EXPANSION-${index+1}` } as Record<string,string>)[category],
  })))
  const area = layout.terrainAreas.find(value => value.id === selectedArea) ?? layout.terrainAreas[0]
  const nominal = FOOTPRINT_LIBRARY[area.footprintType]
  return <main className="page-shell terrain-gallery">
    <header className="terrain-gallery-heading"><div><span className="eyebrow">{tr("Battlefield atlas · 45 layouts")}</span><h1>{tr("Official terrain layouts")}</h1>
      <p>{tr("60″ × 44″ · Event Companion v")}{OFFICIAL_BOARD_SOURCE.version} {tr(" · updated ")}{OFFICIAL_BOARD_SOURCE.updatedAt}</p></div><Link to="/">{tr("Command Hub")}</Link></header>
    <section className="panel terrain-gallery-controls" aria-label={tr("Choose official layout")}>
      <label>{tr("Format")}<select aria-label={tr("Format")} value={doubles ? '2v2' : '1v1'} onChange={e => change('mode',e.target.value)}><option value="1v1">{tr("Official Duel 1v1")}</option><option value="2v2">{tr("Official Doubles 2v2")}</option></select></label>
      <label>{doubles ? tr('Team A Force Disposition') : tr('Force Disposition A')}<select aria-label={tr("Force Disposition A")} value={a} onChange={e => change('a',e.target.value)}>{DISPOSITION_ORDER.map(d => <option key={d} value={d}>{dispositionName(d)}</option>)}</select></label>
      <label>{doubles ? tr('Team B Force Disposition') : tr('Force Disposition B')}<select aria-label={tr("Force Disposition B")} value={b} onChange={e => change('b',e.target.value)}>{DISPOSITION_ORDER.map(d => <option key={d} value={d}>{dispositionName(d)}</option>)}</select></label>
      <label>{tr("Layout variant")}<select aria-label={tr("Layout variant")} value={variant} onChange={e => change('variant',e.target.value)}>{['A','B','C'].map(v => <option key={v} value={v}>{tr("Layout ")}{v}</option>)}</select></label>
    </section>
    <section className="terrain-plan" aria-label={tr("Official terrain plan")} data-layout-id={layout.layoutId}>
      <header className="battlefield-heading"><div><h2>{tr(presentation.title)}</h2><p>{dispositionName(a)} × {dispositionName(b)} {tr(" · source page ")}{layout.page}</p></div>
        <div className="battlefield-tools"><button aria-pressed={rotated} onClick={() => setRotated(!rotated)}>{tr("Rotate 180°")}</button><button onClick={() => window.print()}>{tr("Print table plan")}</button></div>
      </header>
      <p className="terrain-role-note">{doubles ? tr('Team A (two players)') : 'A'}{tr(": Attacker · ")}{doubles ? tr('Team B (two players)') : 'B'}{tr(": Defender. Rotate changes the view only.")}</p>
      <TerrainLayerControls layers={layers} onChange={setLayers} />
      <div className="battlefield-frame terrain-gallery-frame"><div className="battlefield-canvas" style={{ aspectRatio: `${view.widthCm} / ${view.heightCm}` }}>
        <BattlefieldMapSvg presentation={presentation} widthCm={layout.widthCm} heightCm={layout.heightCm} rotated={rotated} layers={layers} objectives={points} />
      </div><span className="terrain-scale">{tr("60″ / 152.4 cm wide · 44″ / 111.76 cm high · grid 5″")}</span></div>
      <TerrainLegend />
      <p className="terrain-provenance">{tr("Source page ")}{layout.page} · v{OFFICIAL_BOARD_SOURCE.version} {tr(" · verified ")}{OFFICIAL_BOARD_SOURCE.checkedAt}{tr(". Vector extraction; physical table check pending.")}</p>
      <p className="terrain-precision">{tr("Dimensions A–E are nominal. The Armageddon outlines include protrusions. Placement is read from the published diagram; frame scale discrepancy ")}{layout.frameAspectErrorPercent?.toFixed(2)}{tr("%. Use the source’s dimension callouts for final table measurement.")}</p>
      <div className="terrain-source-links"><a href={`${OFFICIAL_BOARD_SOURCE.url}#page=${layout.page}`} target="_blank" rel="noreferrer">{tr("Open source diagram · page ")}{layout.page}</a>
        {doubles && <a href={`${OFFICIAL_SOURCES.doubles.url}#page=2`} target="_blank" rel="noreferrer">{tr("Doubles Companion v1.1 · page 2")}</a>}
        <a href={OFFICIAL_SOURCES.footprints.url} target="_blank" rel="noreferrer">{tr("Armageddon footprint templates")}</a></div>
      <section className="panel terrain-inspector" aria-label={tr("Footprint measurements")}>
        <h3>{tr("Footprint measurements")}</h3>
        <label>{tr("Inspect area")}<select aria-label={tr("Inspect area")} value={area.id} onChange={e => setSelectedArea(e.target.value)}>{layout.terrainAreas.map(value => <option key={value.id}>{value.id}</option>)}</select></label>
        <p>{area.id} · {area.terrainFeatureClass ? 'contains verified ' + area.terrainFeatureClass + ' feature' : tr('feature class unverified')} {tr(" · nominal ")}{(nominal.nominalWidthCm/2.54).toFixed(1)}″ × {(nominal.nominalHeightCm/2.54).toFixed(1)}{tr("″. Outline bounds ")}{area.widthCm.toFixed(2)} × {area.heightCm.toFixed(2)} {tr(" cm.")}</p>
        <p>{tr("Centre ")}{area.position.x.toFixed(2)} {tr(" cm from left, ")}{area.position.y.toFixed(2)} {tr(" cm from top · clockwise rotation ")}{area.rotationDeg}{tr("°. Coordinates refer to the unrotated source.")}</p>
      </section>
      <details className="terrain-measurement-table" open><summary>{tr("All 16 areas · coordinates and dimensions")}</summary>
        <div className="terrain-table-scroll"><table><thead><tr><th>{tr("Area")}</th><th>{tr("Nominal cm")}</th><th>{tr("Centre X/Y cm")}</th><th>{tr("Rotation")}</th><th>{tr("Objective")}</th></tr></thead><tbody>
          {layout.terrainAreas.map(value => { const size=FOOTPRINT_LIBRARY[value.footprintType]; return <tr key={value.id}>
            <th>{value.id}</th><td>{size.nominalWidthCm.toFixed(2)} × {size.nominalHeightCm.toFixed(2)}</td>
            <td>{value.position.x.toFixed(2)} / {value.position.y.toFixed(2)}</td><td>{value.rotationDeg}°</td>
            <td>{Object.entries(layout.objectiveAssignments ?? {}).filter(([,ids]) => ids.includes(value.id)).map(([id])=>id).join(', ') || '—'}</td></tr> })}
        </tbody></table></div>
      </details>
      <p className="terrain-source-hash">{tr("SHA-256: ")}{OFFICIAL_BOARD_SOURCE.sha256}</p>
    </section>
  </main>
}

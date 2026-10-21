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
  if (!layout?.terrainAreas) return <div className="page-shell"><h1>Layout unavailable</h1><p>The requested source geometry could not be loaded.</p><Link to="/terrain-layouts">Reset gallery</Link></div>
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
    <header className="terrain-gallery-heading"><div><span className="eyebrow">Battlefield atlas · 45 layouts</span><h1>Official terrain layouts</h1>
      <p>60″ × 44″ · Event Companion v{OFFICIAL_BOARD_SOURCE.version} · updated {OFFICIAL_BOARD_SOURCE.updatedAt}</p></div><Link to="/">Command Hub</Link></header>
    <section className="panel terrain-gallery-controls" aria-label="Choose official layout">
      <label>Format<select aria-label="Format" value={doubles ? '2v2' : '1v1'} onChange={e => change('mode',e.target.value)}><option value="1v1">Official Duel 1v1</option><option value="2v2">Official Doubles 2v2</option></select></label>
      <label>{doubles ? 'Team A Force Disposition' : 'Force Disposition A'}<select aria-label="Force Disposition A" value={a} onChange={e => change('a',e.target.value)}>{DISPOSITION_ORDER.map(d => <option key={d} value={d}>{dispositionName(d)}</option>)}</select></label>
      <label>{doubles ? 'Team B Force Disposition' : 'Force Disposition B'}<select aria-label="Force Disposition B" value={b} onChange={e => change('b',e.target.value)}>{DISPOSITION_ORDER.map(d => <option key={d} value={d}>{dispositionName(d)}</option>)}</select></label>
      <label>Layout variant<select aria-label="Layout variant" value={variant} onChange={e => change('variant',e.target.value)}>{['A','B','C'].map(v => <option key={v} value={v}>Layout {v}</option>)}</select></label>
    </section>
    <section className="terrain-plan" aria-label="Official terrain plan" data-layout-id={layout.layoutId}>
      <header className="battlefield-heading"><div><h2>{presentation.title}</h2><p>{dispositionName(a)} × {dispositionName(b)} · source page {layout.page}</p></div>
        <div className="battlefield-tools"><button aria-pressed={rotated} onClick={() => setRotated(!rotated)}>Rotate 180°</button><button onClick={() => window.print()}>Print table plan</button></div>
      </header>
      <p className="terrain-role-note">{doubles ? 'Team A (two players)' : 'A'}: Attacker · {doubles ? 'Team B (two players)' : 'B'}: Defender. Rotate changes the view only.</p>
      <TerrainLayerControls layers={layers} onChange={setLayers} />
      <div className="battlefield-frame terrain-gallery-frame"><div className="battlefield-canvas" style={{ aspectRatio: `${view.widthCm} / ${view.heightCm}` }}>
        <BattlefieldMapSvg presentation={presentation} widthCm={layout.widthCm} heightCm={layout.heightCm} rotated={rotated} layers={layers} objectives={points} />
      </div><span className="terrain-scale">60″ / 152.4 cm wide · 44″ / 111.76 cm high · grid 5″</span></div>
      <TerrainLegend />
      <p className="terrain-provenance">Source page {layout.page} · v{OFFICIAL_BOARD_SOURCE.version} · verified {OFFICIAL_BOARD_SOURCE.checkedAt}. Vector extraction; physical table check pending.</p>
      <p className="terrain-precision">Dimensions A–E are nominal. The Armageddon outlines include protrusions. Placement is read from the published diagram; frame scale discrepancy {layout.frameAspectErrorPercent?.toFixed(2)}%. Use the source’s dimension callouts for final table measurement.</p>
      <div className="terrain-source-links"><a href={`${OFFICIAL_BOARD_SOURCE.url}#page=${layout.page}`} target="_blank" rel="noreferrer">Open source diagram · page {layout.page}</a>
        {doubles && <a href={`${OFFICIAL_SOURCES.doubles.url}#page=2`} target="_blank" rel="noreferrer">Doubles Companion v1.1 · page 2</a>}
        <a href={OFFICIAL_SOURCES.footprints.url} target="_blank" rel="noreferrer">Armageddon footprint templates</a></div>
      <section className="panel terrain-inspector" aria-label="Footprint measurements">
        <h3>Footprint measurements</h3>
        <label>Inspect area<select aria-label="Inspect area" value={area.id} onChange={e => setSelectedArea(e.target.value)}>{layout.terrainAreas.map(value => <option key={value.id}>{value.id}</option>)}</select></label>
        <p>{area.id} · {area.terrainFeatureClass ? 'contains verified ' + area.terrainFeatureClass + ' feature' : 'feature class unverified'} · nominal {(nominal.nominalWidthCm/2.54).toFixed(1)}″ × {(nominal.nominalHeightCm/2.54).toFixed(1)}″. Outline bounds {area.widthCm.toFixed(2)} × {area.heightCm.toFixed(2)} cm.</p>
        <p>Centre {area.position.x.toFixed(2)} cm from left, {area.position.y.toFixed(2)} cm from top · clockwise rotation {area.rotationDeg}°. Coordinates refer to the unrotated source.</p>
      </section>
      <details className="terrain-measurement-table" open><summary>All 16 areas · coordinates and dimensions</summary>
        <div className="terrain-table-scroll"><table><thead><tr><th>Area</th><th>Nominal cm</th><th>Centre X/Y cm</th><th>Rotation</th><th>Objective</th></tr></thead><tbody>
          {layout.terrainAreas.map(value => { const size=FOOTPRINT_LIBRARY[value.footprintType]; return <tr key={value.id}>
            <th>{value.id}</th><td>{size.nominalWidthCm.toFixed(2)} × {size.nominalHeightCm.toFixed(2)}</td>
            <td>{value.position.x.toFixed(2)} / {value.position.y.toFixed(2)}</td><td>{value.rotationDeg}°</td>
            <td>{Object.entries(layout.objectiveAssignments ?? {}).filter(([,ids]) => ids.includes(value.id)).map(([id])=>id).join(', ') || '—'}</td></tr> })}
        </tbody></table></div>
      </details>
      <p className="terrain-source-hash">SHA-256: {OFFICIAL_BOARD_SOURCE.sha256}</p>
    </section>
  </main>
}

import { useId } from 'react'
import type { BoardPresentation, TerrainArea, TerrainLayers } from '../../domain/battlefield/types'

export const DEFAULT_TERRAIN_LAYERS: TerrainLayers = {
  footprints: true, features: true, objectives: true, deployment: true, territory: true, labels: true,
}

/** Physical cm, shared by the battle, gallery and print view. Never stretch axes. */
export function terrainWorldPoints(area: TerrainArea) {
  const radians = area.rotationDeg * Math.PI / 180
  const c = Math.cos(radians), s = Math.sin(radians)
  return area.polygonPoints.map(p => ({
    x: area.position.x + p.x * c - p.y * s,
    y: area.position.y + p.x * s + p.y * c,
  }))
}

export function TerrainLayerControls({ layers, onChange }: {
  layers: TerrainLayers; onChange: (layers: TerrainLayers) => void
}) {
  return <fieldset className="terrain-layer-controls"><legend>Map layers</legend>
    {(['footprints', 'features', 'objectives', 'deployment', 'territory', 'labels'] as const).map(key =>
      <label key={key}><input type="checkbox" checked={layers[key]} onChange={e => onChange({ ...layers, [key]: e.target.checked })} />
        {{ footprints: 'Footprints', features: 'Terrain features', objectives: 'Objectives', deployment: 'Deployment zones', territory: 'Territory boundaries', labels: 'Area labels' }[key]}
      </label>)}
  </fieldset>
}

export function BattlefieldMapSvg({ presentation, widthCm, heightCm, rotated, layers, zoneColors, objectives }: {
  presentation: BoardPresentation
  widthCm: number
  heightCm: number
  rotated: boolean
  layers: TerrainLayers
  zoneColors?: Record<string, string>
  objectives?: Array<{ id: string; x: number; y: number }>
}) {
  const gridId = useId().replaceAll(':', '')
  return <svg className="battlefield-map-svg" viewBox={`0 0 ${widthCm} ${heightCm}`} aria-label="Technical battlefield plan" role="img">
    <defs><pattern id={gridId} width={12.7} height={12.7} patternUnits="userSpaceOnUse">
      <path d="M 12.7 0 L 0 0 L 0 12.7" fill="none" stroke="currentColor" strokeWidth=".12" />
    </pattern></defs>
    <rect width={widthCm} height={heightCm} fill={`url(#${gridId})`} />
    <g transform={rotated ? `rotate(180 ${widthCm / 2} ${heightCm / 2})` : undefined}>
      <g transform={`scale(${widthCm} ${heightCm})`}>
        {layers.deployment && presentation.deploymentAreas.map(area => <path key={area.zone} d={area.path} data-deployment-zone={area.zone}
          fill={zoneColors?.[area.zone] ?? (area.zone === 'A' ? '#bb6057' : '#4584ab')} fillOpacity=".16"
          stroke={zoneColors?.[area.zone] ?? (area.zone === 'A' ? '#bb6057' : '#4584ab')} strokeOpacity=".6" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
        {layers.territory && presentation.territoryPaths.map((path, index) => <path key={index} d={path} className="battlefield-territory"
          fill="none" strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />)}
      </g>
      {layers.footprints && presentation.terrain?.terrainAreas?.map(area => <g key={area.id}
        data-terrain-id={area.id} data-footprint-type={area.footprintType}
        data-rotation={area.rotationDeg} data-position-x={area.position.x} data-position-y={area.position.y}
        transform={`translate(${area.position.x} ${area.position.y}) rotate(${area.rotationDeg})`}>
        <polygon className={`official-terrain-area official-terrain-area--${area.terrainFeatureClass}`}
          points={area.polygonPoints.map(p => `${p.x},${p.y}`).join(' ')} vectorEffect="non-scaling-stroke">
          <title>{area.id} · {area.widthCm.toFixed(1)} × {area.heightCm.toFixed(1)} cm outline · {area.rotationDeg}°</title>
        </polygon>
      </g>)}
      {layers.features && presentation.terrain?.terrainFeatures?.map(feature => <g key={feature.id}
        className={`terrain-feature-cue terrain-feature-cue--${feature.class}`} data-terrain-feature={feature.id}
        transform={`translate(${feature.position.x} ${feature.position.y})${rotated ? ' rotate(180)' : ''}`}>
        <rect x={-2.5} y={-1.9} width={5} height={3.8} rx=".6" />
        <text textAnchor="middle" dominantBaseline="central">{feature.class === 'dense' ? 'D' : 'L'}</text>
        <title>{feature.class} terrain feature · area {feature.terrainAreaId}. Classification cue; see source for physical model arrangement.</title>
      </g>)}
      {layers.labels && presentation.terrain?.terrainAreas?.map(area => <text key={area.id} className="terrain-area-label"
        textAnchor="middle" transform={`translate(${area.position.x} ${area.position.y})${rotated ? ' rotate(180)' : ''}`} y={-2.6}>{area.id}</text>)}
      {layers.objectives && objectives?.map(point => <g key={point.id} data-plan-objective={point.id}
        transform={`translate(${point.x * widthCm} ${point.y * heightCm})${rotated ? ' rotate(180)' : ''}`}>
        <circle r="3.5" className="terrain-plan-objective" /><text className="terrain-objective-label" textAnchor="middle" y="6.5">{point.id}</text>
      </g>)}
    </g>
  </svg>
}

export function TerrainLegend() {
  return <div className="terrain-legend" aria-label="Terrain legend">
    <span><i className="terrain-key terrain-key--dense" />Dense feature (D)</span>
    <span><i className="terrain-key terrain-key--light" />Light feature (L)</span>
    <span>Grid: 5″ / 12.7 cm</span>
    <span>Area IDs A1–E2 are plan references. D/L badges indicate classification; use the source for physical model placement.</span>
  </div>
}

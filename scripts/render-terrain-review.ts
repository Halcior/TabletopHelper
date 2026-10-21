/** Generate review vectors from the same React component used in the app. */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { BattlefieldMapSvg, DEFAULT_TERRAIN_LAYERS } from '../src/components/battle/BattlefieldMapSvg'
import { OFFICIAL_LAYOUTS } from '../src/domain/battlefield/layouts'
import type { BoardPresentation } from '../src/domain/battlefield/types'

const folder = process.argv[2] ?? 'test-results/terrain-vectors'
mkdirSync(folder, { recursive: true })
const css = readFileSync('src/battlefield.css', 'utf8')
  .split('/* Exact source contours')[1].split('.terrain-layer-controls')[0]
  .replace(/^[\s\S]*?\*\//, '').replaceAll('var(--font-mono)', 'monospace') + '.battlefield-territory{stroke:#91a29c}'
for (const layout of Object.values(OFFICIAL_LAYOUTS)) {
  const presentation: BoardPresentation = {
    title: layout.layoutId!, official: true, terrain: layout, unplacedIds: [],
    deploymentAreas: [{ zone: 'A', path: layout.deploymentPaths.attacker }, { zone: 'B', path: layout.deploymentPaths.defender }],
    territoryPaths: layout.territoryPaths,
  }
  const objectives = Object.entries(layout.objectives).flatMap(([category, points]) => points.map((point, index) => ({ ...point, id: ({ homeAttacker:'A-HOME', homeDefender:'B-HOME', central:`CENTER-${index+1}`, expansion:`EXPANSION-${index+1}` } as Record<string,string>)[category] })))
  let svg = renderToStaticMarkup(React.createElement(BattlefieldMapSvg, {
    presentation, widthCm: layout.widthCm, heightCm: layout.heightCm,
    rotated: false, layers: DEFAULT_TERRAIN_LAYERS, objectives,
  }))
  svg = svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="440" height="600" style="background:#0a1113;color:#526267" ')
    .replace('<defs>', `<style>${css}</style><rect width="111.76" height="152.4" fill="#0a1113"/><defs>`)
  writeFileSync(`${folder}/${layout.page}.svg`, svg)
}
console.info(`Rendered ${Object.keys(OFFICIAL_LAYOUTS).length} app SVGs to ${folder}`)

import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { FILES, EXPORT_BASE, importRules, sheetAbilities, related, type ExportFile } from '../src/features/companion/data'
import { NewRecruitImporter } from '../src/importers/newRecruit'
import { matchSheet } from '../src/features/companion/matching'

// Download only with --download. Data stays outside git; never fetch unit pages.
const folder = process.argv[2]
if (!folder) throw new Error('Usage: npx vite-node scripts/check-companion-data.ts <csv-folder> [--download]')
await mkdir(folder, { recursive: true })
const files: Partial<Record<ExportFile, string>> = {}
for (const file of Object.keys(FILES) as ExportFile[]) {
  if (process.argv.includes('--download')) {
    const response = await fetch(`${EXPORT_BASE}${file}`, { signal: AbortSignal.timeout(45000) })
    if (!response.ok) throw new Error(`${file}: ${response.status}`)
    await writeFile(join(folder, file), await response.text())
  }
  files[file] = await readFile(join(folder, file), 'utf8')
}
const bundle = await importRules(files)
const result = NewRecruitImporter.import(JSON.parse(await readFile('test-data/1700.json', 'utf8')))
console.log(JSON.stringify({ id: bundle.id, upstreamUpdatedAt: bundle.upstreamUpdatedAt,
  bytes: Object.values(files).reduce((sum, file) => sum + Buffer.byteLength(file!), 0), warnings: bundle.warnings,
  roster: result.army?.name,
  rosterMatches: result.army?.units.map(unit => ({ name: unit.name, status: matchSheet(bundle, result.army!, unit).status })),
  custodes: ['Trajann Valoris', 'Allarus Custodians', 'Custodian Wardens', 'Telemon Heavy Dreadnought'].map(name => {
    const sheet = bundle.tables['Datasheets.csv']?.find(row => row.name === name && row.faction_id === 'AC')
    if (!sheet) throw new Error(`Missing real datasheet: ${name}`)
    const models = related(bundle, 'Datasheets_models.csv', sheet.id), weapons = related(bundle, 'Datasheets_wargear.csv', sheet.id), abilities = sheetAbilities(bundle, sheet.id)
    if (!models.length || !weapons.length || !abilities.length) throw new Error(`Incomplete real datasheet: ${name}`)
    return { name, id: sheet.id, models: models.length, weapons: weapons.length, abilities: abilities.length,
      missingAbilities: abilities.filter(row => !row.description || /^(Missing|Ambiguous) ability data/.test(row.description)).length }
  }),
}, null, 2))

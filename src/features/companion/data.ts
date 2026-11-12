/** Wahapedia 11th edition export schema, inspected 2026-11-12. IDs stay strings. */
export const EXPORT_BASE = 'https://wahapedia.ru/wh40k11ed/'
export const FILES = {
  'Factions.csv': ['id', 'name'],
  'Source.csv': ['id', 'name', 'edition'],
  'Datasheets.csv': ['id', 'name', 'faction_id'],
  'Datasheets_models.csv': ['datasheet_id', 'name', 'M', 'T', 'Sv', 'W', 'Ld', 'OC'],
  'Datasheets_wargear.csv': ['datasheet_id', 'name', 'type', 'range', 'A', 'BS_WS', 'S', 'AP', 'D'],
  'Datasheets_abilities.csv': ['datasheet_id', 'ability_id', 'name', 'description'],
  'Abilities.csv': ['id', 'name', 'description'],
  'Datasheets_keywords.csv': ['datasheet_id', 'keyword'],
  'Datasheets_options.csv': ['datasheet_id', 'description'],
  'Datasheets_unit_composition.csv': ['datasheet_id', 'description'],
  'Stratagems.csv': ['id', 'name', 'faction_id', 'cp_cost', 'description', 'phase', 'turn'],
  'Datasheets_stratagems.csv': ['datasheet_id', 'stratagem_id'],
  'Detachments.csv': ['id', 'name', 'faction_id'],
  'Detachment_abilities.csv': ['id', 'name', 'description', 'detachment_id'],
  'Datasheets_detachment_abilities.csv': ['datasheet_id', 'detachment_ability_id'],
  'Enhancements.csv': ['id', 'name', 'description', 'detachment_id'],
  'Last_update.csv': ['last_update'],
} as const
export type ExportFile = keyof typeof FILES
export type Row = Record<string, string>
export type RulesManifest = {
  id: string; edition: '11'; source: 'Wahapedia'; importedAt: string
  upstreamUpdatedAt?: string; files: string[]; warnings: string[]
}
export type RulesBundle = RulesManifest & { tables: Partial<Record<ExportFile, Row[]>> }

// Quotes in unquoted fields (e.g. 6") are literal. A quote only opens a quoted
// field at its start. Supports BOM, CRLF, quoted pipes/newlines and doubled quotes.
export function parseCsv(text: string, recordWidth?: number): string[][] {
  const records: string[][] = []; let row: string[] = [], field = '', quoted = false
  text = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (char === '"') quoted = false
      else field += char
    } else if (char === '"' && field === '') quoted = true
    else if (char === '|') { row.push(field); field = '' }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      // Wahapedia also emits unquoted line breaks inside HTML descriptions.
      // Its trailing delimiter makes a complete fixed-width record unambiguous.
      if (recordWidth && row.length < recordWidth - 1 && (row.length || field)) { field += '\n'; continue }
      row.push(field); if (row.some(Boolean)) records.push(row); row = []; field = ''
    } else field += char
  }
  if (quoted) throw new Error('Unclosed CSV quote.')
  if (field || row.length) { row.push(field); records.push(row) }
  return records
}

export function readTable(file: ExportFile, text: string): Row[] {
  const width = parseCsv(text.split(/\r?\n/)[0])[0]?.length
  const [header, ...records] = parseCsv(text, width)
  if (!header || FILES[file].some(column => !header.includes(column)))
    throw new Error(`${file}: missing columns; use the Wahapedia 11th edition export.`)
  return records.map((values, index) => {
    if (values.length !== header.length) throw new Error(`${file}: invalid column count at row ${index + 2}.`)
    return Object.fromEntries(header.flatMap((key, i) => key ? [[key, values[i]]] : []))
  })
}

export async function importRules(files: Partial<Record<ExportFile, string>>): Promise<RulesBundle> {
  for (const file of ['Factions.csv', 'Datasheets.csv'] as const)
    if (!files[file]) throw new Error(`Missing ${file}.`)
  const tables: RulesBundle['tables'] = {}
  const warnings: string[] = []
  for (const file of Object.keys(FILES) as ExportFile[]) {
    if (files[file] !== undefined) tables[file] = readTable(file, files[file]!)
    else warnings.push(`Missing ${file}`)
    const rows = tables[file]
    if (rows && FILES[file].some(column => column === 'id')) {
      const ids = rows.map(row => row.id)
      if (ids.some(id => !id)) throw new Error(`${file}: empty IDs.`)
      if (new Set(ids).size !== ids.length) {
        if (file !== 'Abilities.csv') throw new Error(`${file}: duplicate IDs.`)
        warnings.push('Abilities.csv: repeated IDs; resolved by datasheet faction, ambiguous definitions remain marked.')
      }
    }
  }
  if (!tables['Datasheets.csv']?.length) throw new Error('No datasheets in export.')
  const sheets = new Set(tables['Datasheets.csv']!.map(row => row.id))
  for (const [file, rows] of Object.entries(tables)) {
    const orphanCount = rows.filter(row => row.datasheet_id && !sheets.has(row.datasheet_id)).length
    if (orphanCount) warnings.push(`${file}: ${orphanCount} references to unavailable datasheets`)
  }
  const abilities = new Set(tables['Abilities.csv']?.map(row => row.id))
  const missing = tables['Datasheets_abilities.csv']?.filter(row => row.ability_id && !abilities.has(row.ability_id)).length
  if (missing) warnings.push(`${missing} unresolved ability references`)
  const canonical = JSON.stringify(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))
  const id = `waha-11-${Array.from(new Uint8Array(digest), v => v.toString(16).padStart(2, '0')).join('')}`
  return { id, edition: '11', source: 'Wahapedia', importedAt: new Date().toISOString(),
    upstreamUpdatedAt: tables['Last_update.csv']?.[0]?.last_update, files: Object.keys(files), warnings, tables }
}

export function manifest(bundle: RulesBundle): RulesManifest {
  const { tables: _tables, ...metadata } = bundle
  return metadata
}

/** Never render upstream HTML. Preserve paragraph/list boundaries as plain text. */
export function ruleText(html = ''): string {
  const plain = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(?:td|th)>/gi, ' · ')
    .replace(/<\/?(?:br|p|div|li|ul|tr|h[1-6])\b[^>]*>/gi, '\n').replace(/<[^>]*>/g, '')
  return plain.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|rsquo|lsquo|ndash|mdash);/gi, (all, entity: string) => {
    if (entity[0] === '#') {
      const value = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1))
      return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : all
    }
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ndash: '–', mdash: '—' } as Record<string, string>)[entity.toLowerCase()] ?? all
  }).replace(/\n[ \t]*\n+/g, '\n\n').trim()
}
export const normalizeName = (name: string) => ruleText(name).normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim()
export const related = (bundle: RulesBundle, file: ExportFile, id: string) => (bundle.tables[file] ?? []).filter(row => row.datasheet_id === id)
export function sheetAbilities(bundle: RulesBundle, id: string): Row[] {
  const faction = bundle.tables['Datasheets.csv']?.find(row => row.id === id)?.faction_id
  return related(bundle, 'Datasheets_abilities.csv', id).map(row => {
    if (!row.ability_id) return row
    const candidates = (bundle.tables['Abilities.csv'] ?? []).filter(ability => ability.id === row.ability_id)
    const exact = candidates.filter(ability => ability.faction_id === faction)
    const scoped = exact.length ? exact : candidates.filter(ability => !ability.faction_id)
    const unique = [...new Map(scoped.map(ability => [JSON.stringify(ability), ability])).values()]
    return unique.length === 1 ? { ...row, ...unique[0] } : { ...row, name: row.name || row.ability_id,
      description: unique.length ? 'Ambiguous ability data. Check source datasheet.' : 'Missing ability data.' }
  })
}
export function safeSourceUrl(link?: string): string | undefined {
  try { const url = new URL(link ?? ''); return url.protocol === 'https:' && url.hostname === 'wahapedia.ru' ? url.href : undefined } catch { return undefined }
}

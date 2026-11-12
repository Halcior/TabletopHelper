import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { NewRecruitImporter } from '../../importers/newRecruit'
import { companionCsv } from '../../../test-data/companion'
import { importRules, parseCsv, readTable, ruleText, sheetAbilities, safeSourceUrl } from './data'
import { armyStratagems, matchSheet, phaseVisible, selectedWeapon } from './matching'

describe('Wahapedia provider', () => {
  it('preserves ID zeros, inch marks, quoted pipes/newlines, escaped quotes and BOM', () => {
    expect(parseCsv('\uFEFFid|range|description|\r\n001|6"|"a|b\n""quote"""|\r\n')[1]).toEqual(['001', '6"', 'a|b\n"quote"', ''])
  })
  it('reads Wahapedia unquoted HTML line breaks without making fake rows', () => {
    const rows = readTable('Abilities.csv', 'id|name|description|\n001|Example|<div>First\n<div>second</div>\nthird</div>|\n002|Next|Normal|\n')
    expect(rows).toHaveLength(2)
    expect(rows[0].description).toContain('second')
    expect(() => readTable('Factions.csv', 'wrong|header|\n1|two|')).toThrow(/columns/)
    expect(() => parseCsv('"unterminated')).toThrow()
  })
  it('hashes content independently of file order and import time; reports missing tables', async () => {
    const bundle = await importRules(companionCsv)
    const again = await importRules(Object.fromEntries(Object.entries(companionCsv).reverse()))
    expect(bundle.id).toBe(again.id)
    expect(bundle.warnings).toContain('Missing Detachments.csv')
    expect((await importRules({ ...companionCsv, 'Last_update.csv': 'last_update|\nnew date|\n' })).id).not.toBe(bundle.id)
  })
  it('resolves repeated ability IDs by faction and keeps link parameters', async () => {
    const bundle = await importRules(companionCsv)
    expect(sheetAbilities(bundle, '001')[0]).toMatchObject({ name: 'Test defense', description: 'TEST ONLY', parameter: '5+' })
    expect(ruleText('<script>alert(1)</script><b>Safe</b><br>&lt;img src=x&gt; &#x2019;')).toBe('Safe\n<img src=x> ’')
    expect(safeSourceUrl('javascript:alert(1)')).toBeUndefined()
  })
  it('does not confuse NR IDs with Wahapedia IDs or silently pick ambiguous names', async () => {
    const bundle = await importRules(companionCsv)
    const { army } = NewRecruitImporter.import(JSON.parse(readFileSync('test-data/1700.json', 'utf8')))
    const unit = { ...army.units[0], sourceId: '001', name: 'Unknown' }
    expect(matchSheet(bundle, army, unit).sheet).toBeUndefined()
    unit.name = 'Test Sentinel'
    expect(matchSheet(bundle, army, unit).status).toBe('exact')
    bundle.tables['Datasheets.csv']!.push({ ...bundle.tables['Datasheets.csv']![0], id: '002' })
    expect(matchSheet(bundle, army, unit).status).toBe('ambiguous')
    expect(matchSheet(bundle, army, unit, '002').sheet?.id).toBe('002')
    expect(matchSheet(bundle, { ...army, faction: 'Unknown' }, unit).sheet).toBeUndefined()
    expect(selectedWeapon({ ...unit, modelGroups: [], rangedWeapons: [], meleeWeapons: [], wargear: [{ name: 'Test spear', points: 0 }] }, { name: 'Test spear – strike' })).toBe(false)
    expect(armyStratagems(bundle, army).map(row => row.id)).toEqual(['s1', 's3'])
    expect(phaseVisible({ phase: '' }, 'FIGHT')).toBe(true)
  })
})

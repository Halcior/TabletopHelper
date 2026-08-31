import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { NewRecruitImporter } from './index'

function loadFixture(): unknown {
  const file = path.resolve(process.cwd(), 'test-data', '1700.json')
  if (!fs.existsSync(file)) throw new Error('fixture test-data/1700.json not found')
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as unknown
}

describe('NewRecruitImporter real fixture', () => {
  it('imports the real roster identity and all logical units without a points warning', () => {
    const result = NewRecruitImporter.import(loadFixture())
    expect(result.army.faction).toBe('Adeptus Custodes')
    expect(result.army.totalPoints).toBe(1700)
    expect(result.army.pointsLimit).toBe(1750)
    expect(result.army.units).toHaveLength(11)
    expect(result.army.units.reduce((total, unit) => total + unit.points, 0)).toBe(1700)
    expect(result.warnings).toEqual([])

    expect(result.army.units.map((unit) => [unit.name, unit.points, unit.startingModels])).toEqual([
      ['Trajann Valoris', 135, 1],
      ['Blade Champion', 125, 1],
      ['Custodian Guard', 170, 4],
      ['Allarus Custodians', 165, 3],
      ['Custodian Wardens', 200, 4],
      ['Prosecutors', 50, 5],
      ['Witchseekers', 55, 5],
      ['Vertus Praetors', 215, 3],
      ['Caladius Grav-tank', 225, 1],
      ['Telemon Heavy Dreadnought', 250, 1],
      ['Inquisitor Draxus', 110, 1],
    ])
  })

  it('preserves paid enhancements, paid wargear, stats, weapons, and abilities', () => {
    const { army } = NewRecruitImporter.import(loadFixture())
    const byName = new Map(army.units.map((unit) => [unit.name, unit]))

    expect(byName.get('Blade Champion')?.enhancements).toContainEqual(expect.objectContaining({
      name: 'Auric Mantle',
      points: 15,
    }))
    expect(byName.get('Telemon Heavy Dreadnought')?.enhancements).toContainEqual(expect.objectContaining({
      name: 'Interred Expertise',
      points: 25,
    }))
    expect(byName.get('Caladius Grav-tank')?.wargear).toContainEqual({
      name: 'Twin arachnus heavy blaze cannon',
      points: 15,
    })

    expect(byName.get('Custodian Guard')?.stats).toEqual({
      movement: '6"',
      toughness: 6,
      save: '2+',
      wounds: 3,
      leadership: '6+',
      objectiveControl: 2,
      invulnerableSave: '4+',
    })
    expect(byName.get('Caladius Grav-tank')?.stats?.wounds).toBe(14)
    expect(byName.get('Caladius Grav-tank')?.stats?.objectiveControl).toBe(4)

    expect(byName.get('Trajann Valoris')?.rangedWeapons).toContainEqual({
      name: "Eagle's Scream",
      type: 'ranged',
      range: '24"',
      attacks: '2',
      skill: '2+',
      strength: '5',
      ap: '-2',
      damage: '3',
      keywords: ['Assault'],
    })
    expect(byName.get('Trajann Valoris')?.abilities.find((ability) => ability.name === 'Moment Shackle')?.description)
      .toContain('Once per battle')
  })

  it('keeps mixed model groups together as one logical unit', () => {
    const { army } = NewRecruitImporter.import(loadFixture())
    const wardens = army.units.find((unit) => unit.name === 'Custodian Wardens')
    expect(wardens?.startingModels).toBe(4)
    expect(wardens?.modelGroups).toEqual([
      expect.objectContaining({
        name: 'Custodian Warden (Castellan axe)',
        startingCount: 2,
        equipment: ['Castellan Axe'],
      }),
      expect.objectContaining({
        name: 'Custodian Warden (Guardian Spear)',
        startingCount: 2,
        equipment: ['Guardian Spear'],
      }),
    ])
  })

  it('resolves warlord and leader/bodyguard relationships to domain unit IDs', () => {
    const { army } = NewRecruitImporter.import(loadFixture())
    const byName = new Map(army.units.map((unit) => [unit.name, unit]))
    const trajann = byName.get('Trajann Valoris')
    const blade = byName.get('Blade Champion')
    const wardens = byName.get('Custodian Wardens')
    const draxus = byName.get('Inquisitor Draxus')
    const guard = byName.get('Custodian Guard')

    expect(trajann?.isWarlord).toBe(true)
    expect(blade?.leaderOfUnitId).toBe(wardens?.id)
    expect(wardens?.ledByUnitIds).toContain(blade?.id)
    expect(draxus?.leaderOfUnitId).toBe(guard?.id)
    expect(guard?.ledByUnitIds).toContain(draxus?.id)
  })

  it('rejects malformed input with a useful error', () => {
    expect(() => NewRecruitImporter.import({ roster: { forces: 'not-an-array' } }))
      .toThrow(/Invalid New Recruit roster/)
    expect(() => NewRecruitImporter.import(null)).toThrow(/No New Recruit JSON/)
  })

  it('returns a warning instead of crashing when roster points cannot be reconciled', () => {
    const changed = structuredClone(loadFixture()) as {
      roster: { costs: Array<{ name: string; value: number }> }
    }
    const points = changed.roster.costs.find((cost) => cost.name === 'pts')
    if (!points) throw new Error('fixture roster has no points cost')
    points.value = 1701

    const result = NewRecruitImporter.import(changed)
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'POINTS_MISMATCH' }))
    expect(result.army.units).toHaveLength(11)
  })
})

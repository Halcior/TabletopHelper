import type { Ability, UnitStats, WeaponProfile } from '../../domain/army/types'
import type { NewRecruitCharacteristic, NewRecruitProfile } from './schema'

function characteristicText(characteristic: NewRecruitCharacteristic): string | undefined {
  const value = characteristic.value ?? characteristic.$text
  if (value === undefined || value === null) return undefined
  const text = String(value).trim()
  return text.length ? text : undefined
}

export function characteristicMap(profile: NewRecruitProfile): Map<string, string> {
  const values = new Map<string, string>()
  for (const characteristic of profile.characteristics ?? []) {
    if (!characteristic.name) continue
    const value = characteristicText(characteristic)
    if (value !== undefined) values.set(characteristic.name.toLowerCase(), value)
  }
  return values
}

function finiteNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function profileToUnitStats(profile: NewRecruitProfile): UnitStats {
  const values = characteristicMap(profile)
  return {
    movement: values.get('m') ?? values.get('m.'),
    toughness: finiteNumber(values.get('t')),
    save: values.get('sv') ?? values.get('save'),
    wounds: finiteNumber(values.get('w')),
    leadership: values.get('ld'),
    objectiveControl: finiteNumber(values.get('oc')),
    invulnerableSave: values.get('insv') ?? values.get('in sv') ?? values.get('inv') ?? null,
  }
}

function splitKeywords(value: string | undefined): string[] {
  if (!value) return []
  return value.split(/[,;]/).map((keyword) => keyword.trim()).filter(Boolean)
}

export function profileToWeapon(profile: NewRecruitProfile, type: WeaponProfile['type']): WeaponProfile {
  const values = characteristicMap(profile)
  return {
    name: profile.name === undefined ? 'Unnamed weapon' : String(profile.name),
    type,
    range: values.get('range'),
    attacks: values.get('a') ?? values.get('attacks'),
    skill: values.get(type === 'ranged' ? 'bs' : 'ws') ?? values.get('skill'),
    strength: values.get('s') ?? values.get('strength'),
    ap: values.get('ap'),
    damage: values.get('d') ?? values.get('damage'),
    keywords: splitKeywords(values.get('keywords')),
  }
}

export function profileToAbility(profile: NewRecruitProfile): Ability {
  const values = characteristicMap(profile)
  return {
    name: profile.name === undefined ? 'Unnamed ability' : String(profile.name),
    description: values.get('description'),
  }
}

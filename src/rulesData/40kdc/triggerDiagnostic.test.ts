import fs from 'node:fs'
import path from 'node:path'
import { expect, it } from 'vitest'
import { NewRecruitImporter } from '../../importers/newRecruit'
import { create40kdcRulesDataProvider } from './index'

it('diagnoses real Custodes trigger coverage', () => {
  const fixture = JSON.parse(fs.readFileSync(path.resolve('test-data/1700.json'), 'utf8')) as unknown
  const imported = NewRecruitImporter.import(fixture)
  const resolved = create40kdcRulesDataProvider().resolveArmyStratagems(imported.army)
  const rows = resolved.stratagems.map((item) => ({
    name: item.definition.name,
    phases: item.definition.phases,
    sourceEvents: item.sourceTriggerEvents,
    mapped: item.mappedTriggers,
    manual: item.manualConfirmationRequired,
    reasons: item.manualConfirmationReasons,
  }))
  console.log('CUSTODES_TRIGGER_DIAGNOSTIC=' + JSON.stringify(rows))
  expect(rows).toHaveLength(9)
})

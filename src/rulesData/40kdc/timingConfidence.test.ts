import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { NewRecruitImporter } from '../../importers/newRecruit'
import { create40kdcRulesDataProvider } from './index'

describe('40kdc timing confidence metadata', () => {
  it('keeps reaction-card confidence aligned with adapter automation status', () => {
    const fixture = JSON.parse(fs.readFileSync(path.resolve('test-data/1700.json'), 'utf8')) as unknown
    const imported = NewRecruitImporter.import(fixture)
    const result = create40kdcRulesDataProvider().resolveArmyStratagems(imported.army)

    expect(result.stratagems.length).toBeGreaterThan(0)
    for (const record of result.stratagems) {
      expect(record.definition.timingConfidence).toBe(
        record.manualConfirmationRequired ? 'REQUIRES_CONFIRMATION' : 'VERIFIED',
      )
      expect(record.definition.timingConfidenceReasons ?? []).toEqual(record.manualConfirmationReasons)
    }
  })
})

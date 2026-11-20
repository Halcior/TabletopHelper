import { describe, expect, it } from 'vitest'
import { testArmy } from '../../rulesets/cauldronFFA3/cauldronTestUtils'
import { assessForceDispositions, detachmentEvidence } from './forceDisposition'
import { armyDataMayBeOutdated, validateArmy } from './roster'

describe('Force Disposition evidence and roster provenance', () => {
  const custodes = { ...testArmy('custodes'), faction: 'Adeptus Custodes', detachments: [{ id: 'lions', name: 'Lions of the Emperor' }] }
  const guard = { ...testArmy('guard'), faction: 'Death Guard', detachments: [{ id: 'virulent', name: 'Virulent Vectorium' }] }

  it('shows the newer official Custodes cost without inheriting a historical disposition', () => {
    expect(detachmentEvidence(custodes)[0]).toMatchObject({ dp: 1, dispositions: [], status: 'partial' })
    expect(detachmentEvidence({ ...custodes, faction: 'Aeldari' })[0].status).toBe('unknown')
  })

  it('checks both Doubles armies and keeps incomplete or historical evidence unverified', () => {
    const assessment = assessForceDispositions([custodes, guard])
    expect(assessment.published.has('take-and-hold')).toBe(true)
    expect(assessment.current.size).toBe(0)
    expect(assessment.hasCompleteEvidence).toBe(false)
    expect(assessForceDispositions([custodes, undefined]).hasCompleteEvidence).toBe(false)
  })

  it('treats a dated pre-update import as possibly stale through a validated round trip', () => {
    const army = validateArmy({ ...custodes, importedRoster: {
      source: 'new-recruit', importedAt: '2026-10-13T18:00:00.000Z',
      gameSystemRevision: '17', catalogues: [{ name: 'Adeptus Custodes', revision: '6' }],
    } })
    expect(army.importedRoster?.catalogues[0].revision).toBe('6')
    expect(armyDataMayBeOutdated(army)).toBe(true)
    expect(armyDataMayBeOutdated(custodes)).toBe(false)
  })
})

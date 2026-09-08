import { describe, expect, it } from 'vitest'
import { cauldronObjectivesForPlayerCount } from './constants'

describe('Cauldron objective layouts', () => {
  it('keeps the classic FFA layout at six objectives', () => {
    expect(cauldronObjectivesForPlayerCount(3, 'classic-6').map((objective) => objective.id)).toEqual([
      'A-HOME', 'B-HOME', 'C-HOME', 'N1', 'N2', 'N3',
    ])
  })

  it('adds a neutral centre objective to the expanded FFA layout', () => {
    const objectives = cauldronObjectivesForPlayerCount(3, 'expanded-7')
    expect(objectives.map((objective) => objective.id)).toEqual([
      'A-HOME', 'B-HOME', 'C-HOME', 'N1', 'N2', 'N3', 'CENTER',
    ])
    expect(objectives.find((objective) => objective.id === 'CENTER')?.type).toBe('neutral')
  })

  it('leaves Duel objectives unchanged regardless of the FFA layout preference', () => {
    expect(cauldronObjectivesForPlayerCount(2, 'expanded-7').map((objective) => objective.id)).toEqual([
      'A-HOME', 'B-HOME', 'N1', 'N2', 'N3',
    ])
  })
})

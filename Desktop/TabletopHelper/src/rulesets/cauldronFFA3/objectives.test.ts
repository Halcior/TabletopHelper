import { describe, expect, it } from 'vitest'
import { resolveCauldronObjectiveController } from './objectives'

describe('Cauldron objective control', () => {
  it('selects the unique highest OC across three players', () => {
    expect(resolveCauldronObjectiveController({ a: 8, b: 5, c: 0 })).toBe('a')
    expect(resolveCauldronObjectiveController({ a: 2, b: 9, c: 7 })).toBe('b')
  })

  it('makes a tie for highest OC uncontrolled', () => {
    expect(resolveCauldronObjectiveController({ a: 8, b: 8, c: 3 })).toBeNull()
    expect(resolveCauldronObjectiveController({ a: 4, b: 4, c: 4 })).toBeNull()
  })

  it('does not award control when all OC values are zero', () => {
    expect(resolveCauldronObjectiveController({ a: 0, b: 0, c: 0 })).toBeNull()
  })
})

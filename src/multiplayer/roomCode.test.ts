import { describe, expect, it } from 'vitest'
import { createRoomCode, isValidRoomCode, normalizeRoomCode } from './roomCode'

describe('shared room codes', () => {
  it('normalizes user input for phone entry', () => {
    expect(normalizeRoomCode(' k7-f4 q2 ')).toBe('K7F4Q2')
  })

  it('rejects ambiguous or incomplete codes', () => {
    expect(isValidRoomCode('ABC12')).toBe(false)
    expect(isValidRoomCode('ABC1O2')).toBe(false)
  })

  it('creates a six-character code from the non-ambiguous alphabet', () => {
    expect(createRoomCode(() => 0)).toBe('AAAAAA')
    expect(isValidRoomCode(createRoomCode(() => 0.5))).toBe(true)
  })
})

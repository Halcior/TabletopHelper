import { describe, expect, it } from 'vitest'
import { buildSharedInviteUrl, roomCodeFromSearch } from './sharedInvite'

describe('shared invite links', () => {
  it('builds a room-aware shared URL', () => {
    expect(buildSharedInviteUrl('https://tabletop.example/', 'k7f4q2')).toBe('https://tabletop.example/shared?room=K7F4Q2')
  })

  it('reads only valid room codes from the query string', () => {
    expect(roomCodeFromSearch('?room=k7f4q2')).toBe('K7F4Q2')
    expect(roomCodeFromSearch('?room=BAD')).toBeNull()
    expect(roomCodeFromSearch('')).toBeNull()
  })
})

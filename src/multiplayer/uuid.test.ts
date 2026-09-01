import { describe, expect, it } from 'vitest'
import { createPortableUuid, type PortableCrypto } from './uuid'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

describe('createPortableUuid', () => {
  it('uses native randomUUID when it is available', () => {
    const expected = '123e4567-e89b-42d3-a456-426614174000'
    const source: PortableCrypto = { randomUUID: () => expected }
    expect(createPortableUuid(source)).toBe(expected)
  })

  it('still returns an RFC 4122 v4 UUID when randomUUID is unavailable on LAN HTTP', () => {
    const source: PortableCrypto = {
      getRandomValues: (array) => {
        array.forEach((_, index) => { array[index] = index })
        return array
      },
    }
    const result = createPortableUuid(source)
    expect(result).toMatch(UUID_V4)
    expect(result).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f')
  })

  it('keeps a valid UUID shape even without Web Crypto', () => {
    expect(createPortableUuid(undefined)).toMatch(UUID_V4)
  })
})

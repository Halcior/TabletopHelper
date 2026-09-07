import { describe, expect, it } from 'vitest'
import {
  assertSharedSchemaVersion,
  SHARED_SCHEMA_MIGRATION,
  SHARED_SCHEMA_VERSION,
  sharedBackendMessage,
} from './sharedBackend'

describe('shared backend compatibility', () => {
  it('accepts the current or a newer schema version', () => {
    expect(() => assertSharedSchemaVersion(SHARED_SCHEMA_VERSION)).not.toThrow()
    expect(() => assertSharedSchemaVersion(SHARED_SCHEMA_VERSION + 1)).not.toThrow()
  })

  it('rejects missing and outdated schema versions', () => {
    expect(() => assertSharedSchemaVersion(undefined)).toThrow(/older than required/)
    expect(() => assertSharedSchemaVersion(SHARED_SCHEMA_VERSION - 1)).toThrow(/older than required/)
  })

  it('points every known schema mismatch to the cumulative migration', () => {
    for (const marker of ['shared_schema_version', 'started_at', 'is_ready', 'start_shared_room']) {
      expect(sharedBackendMessage(new Error(marker))).toContain(SHARED_SCHEMA_MIGRATION)
    }
  })

  it('explains missing Data API grants separately', () => {
    const result = sharedBackendMessage(new Error('permission denied for table shared_rooms'))
    expect(result).toContain('Data API')
    expect(result).toContain(SHARED_SCHEMA_MIGRATION)
  })
})

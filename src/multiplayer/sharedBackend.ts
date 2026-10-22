export const SHARED_SCHEMA_VERSION = 9
export const SHARED_SCHEMA_MIGRATION = 'supabase/migrations/20261022142100_host_lobby_settings.sql'

function detail(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function assertSharedSchemaVersion(version: unknown): asserts version is number {
  if (typeof version !== 'number' || !Number.isInteger(version) || version < SHARED_SCHEMA_VERSION) {
    throw new Error(`Shared schema version ${String(version)} is older than required version ${SHARED_SCHEMA_VERSION}.`)
  }
}

export function sharedBackendMessage(error: unknown): string {
  const message = detail(error)
  const normalized = message.toLocaleLowerCase()
  const schemaOutdated = [
    'bring_your_army',
    'shared_rosters',
    'stage_shared_roster',
    'set_shared_seat_settings',
    'set_host_lobby_settings',
    'get_host_lobby_settings',
    'social_action',
    'shared_schema_version',
    'shared schema version',
    'started_at',
    'is_ready',
    'start_shared_room',
  ].some((marker) => normalized.includes(marker))

  if (schemaOutdated) {
    return `Supabase is connected, but its shared-room schema is out of date. Run ${SHARED_SCHEMA_MIGRATION} in SQL Editor.`
  }
  if (normalized.includes('permission denied')) {
    return `Supabase rejected Data API access. Re-run ${SHARED_SCHEMA_MIGRATION} to restore the required anon grants and RLS policies.`
  }
  return `Supabase connection check failed. ${message}`
}

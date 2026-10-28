import { readFileSync } from 'node:fs'
import { createTestDatabase } from './testDatabase.mjs'
const db = await createTestDatabase()
try {
  await db.exec(
    readFileSync('supabase/tests/friends_shared_armies.sql', 'utf8'),
  )
  await db.exec(readFileSync('supabase/tests/lobby_player_settings.sql', 'utf8'))
  await db.exec(readFileSync('supabase/tests/host_doubles_settings.sql', 'utf8'))
  await db.exec(readFileSync('supabase/tests/battle_clock.sql', 'utf8'))
  await db.exec(readFileSync('supabase/tests/unit_tracking_rls.sql', 'utf8'))
  console.log('PostgreSQL social/lobby, seat settings Battle Clock and Unit Tracking RLS integration passed; all test transactions rolled back.')
} finally {
  await db.close()
}

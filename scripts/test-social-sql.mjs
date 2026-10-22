import { readFileSync } from 'node:fs'
import { createTestDatabase } from './testDatabase.mjs'
const db = await createTestDatabase()
try {
  await db.exec(
    readFileSync('supabase/tests/friends_shared_armies.sql', 'utf8'),
  )
  await db.exec(readFileSync('supabase/tests/lobby_player_settings.sql', 'utf8'))
  console.log('PostgreSQL social/lobby and per-seat settings integration passed; both transactions rolled back.')
} finally {
  await db.close()
}

import { readFileSync } from 'node:fs'
import { createTestDatabase } from './testDatabase.mjs'
const db = await createTestDatabase()
try {
  await db.exec(
    readFileSync('supabase/tests/friends_shared_armies.sql', 'utf8'),
  )
  console.log(
    'PostgreSQL social/lobby integration: A, B, C and anon passed; transaction rolled back.',
  )
} finally {
  await db.close()
}

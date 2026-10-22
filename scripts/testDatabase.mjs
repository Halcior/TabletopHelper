// Real embedded PostgreSQL (PGlite), not a JavaScript RLS mock. Auth helpers
// emulate Supabase's JWT GUCs; hosted Auth/PostgREST are verified separately.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
export async function createTestDatabase() {
  const db = new PGlite()
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
    create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    grant usage on schema auth to anon,authenticated; grant execute on all functions in schema auth to anon,authenticated;`)
  for (const path of [
    'supabase/shared_sessions.sql',
    'supabase/migrations/20261013094351_battlefield_geometry_host_policy.sql',
    'supabase/migrations/20261014121951_gw_doubles_four_seat_lobby.sql',
    'supabase/migrations/20261021124245_private_user_armies.sql',
    'supabase/migrations/20261021125543_enforce_roster_mutation_inputs.sql',
    'supabase/migrations/20261022082448_friends_shared_armies.sql',
    'supabase/migrations/20261022103500_lobby_player_settings.sql',
  ])
    await db.exec(readFileSync(path, 'utf8'))
  return db
}

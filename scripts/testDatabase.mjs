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
    grant usage on schema auth to anon,authenticated; grant execute on all functions in schema auth to anon,authenticated;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    create function storage.foldername(t text) returns text[] language sql immutable as $$select string_to_array(substring(t from 1 for length(t)-length(split_part(t,'/',array_length(string_to_array(t,'/'),1)))-1),'/')$$;
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated; grant select,insert,update,delete on storage.objects to authenticated;`)
  for (const path of [
    'supabase/shared_sessions.sql',
    'supabase/migrations/20261013094351_battlefield_geometry_host_policy.sql',
    'supabase/migrations/20261014121951_gw_doubles_four_seat_lobby.sql',
    'supabase/migrations/20261021124245_private_user_armies.sql',
    'supabase/migrations/20261021125543_enforce_roster_mutation_inputs.sql',
    'supabase/migrations/20261022082448_friends_shared_armies.sql',
    'supabase/migrations/20261022103500_lobby_player_settings.sql',
    'supabase/migrations/20261022142000_cloud_army_media.sql',
    'supabase/migrations/20261022142100_host_lobby_settings.sql',
    'supabase/migrations/20261022144000_fix_host_doubles_freeze.sql',
  ])
    await db.exec(readFileSync(path, 'utf8'))
  return db
}

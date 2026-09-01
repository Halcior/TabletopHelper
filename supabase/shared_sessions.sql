-- Tabletop Companion shared-session MVP
--
-- This schema is intentionally optimized for private tabletop testing: the room
-- code + unguessable UUID act as capability-style identifiers and the browser
-- uses the public anon key. The RLS policies below allow anonymous read/write
-- access to these three dedicated tables. Do NOT reuse these policies for a
-- public production deployment. Before public launch, move mutations behind
-- authenticated users or an Edge Function/RPC that validates a room secret.

create table if not exists public.shared_rooms (
  id uuid primary key,
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  battle_id text not null,
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  session_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shared_participants (
  id uuid primary key,
  room_id uuid not null references public.shared_rooms(id) on delete cascade,
  client_id text not null,
  player_id text not null,
  display_name text not null,
  is_host boolean not null default false,
  last_seen_at timestamptz not null default now(),
  unique (room_id, player_id),
  unique (room_id, client_id)
);

create table if not exists public.shared_events (
  sequence bigint generated always as identity primary key,
  room_id uuid not null references public.shared_rooms(id) on delete cascade,
  event_id text not null,
  action_id text not null,
  actor_player_id text,
  event_payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (room_id, event_id)
);

create index if not exists shared_rooms_code_idx on public.shared_rooms(code);
create index if not exists shared_events_room_sequence_idx on public.shared_events(room_id, sequence);
create index if not exists shared_participants_room_seen_idx on public.shared_participants(room_id, last_seen_at desc);

alter table public.shared_rooms enable row level security;
alter table public.shared_participants enable row level security;
alter table public.shared_events enable row level security;

drop policy if exists "shared rooms read" on public.shared_rooms;
drop policy if exists "shared rooms create" on public.shared_rooms;
drop policy if exists "shared rooms update" on public.shared_rooms;
create policy "shared rooms read" on public.shared_rooms for select to anon using (true);
create policy "shared rooms create" on public.shared_rooms for insert to anon with check (true);
create policy "shared rooms update" on public.shared_rooms for update to anon using (true) with check (true);

drop policy if exists "shared participants read" on public.shared_participants;
drop policy if exists "shared participants create" on public.shared_participants;
drop policy if exists "shared participants update" on public.shared_participants;
create policy "shared participants read" on public.shared_participants for select to anon using (true);
create policy "shared participants create" on public.shared_participants for insert to anon with check (true);
create policy "shared participants update" on public.shared_participants for update to anon using (true) with check (true);

drop policy if exists "shared events read" on public.shared_events;
drop policy if exists "shared events create" on public.shared_events;
create policy "shared events read" on public.shared_events for select to anon using (true);
create policy "shared events create" on public.shared_events for insert to anon with check (true);

grant select, insert, update on public.shared_rooms to anon;
grant select, insert, update on public.shared_participants to anon;
grant select, insert on public.shared_events to anon;
grant usage, select on sequence public.shared_events_sequence_seq to anon;

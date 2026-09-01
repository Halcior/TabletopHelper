-- Tabletop Companion shared-session MVP
--
-- The public Supabase key is safe to ship in the browser, but it must not grant
-- global access to every tabletop room. Each request therefore carries the
-- six-character room code in the x-room-code header. RLS limits reads/writes to
-- rows belonging to that room. This is a capability-style private-play guard,
-- not full user authentication; public production should additionally validate
-- authenticated player identity or a stronger room secret server-side.

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

create or replace function public.request_shared_room_code()
returns text
language sql
stable
set search_path = ''
as $$
  select upper(coalesce(
    nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-room-code',
    ''
  ));
$$;

grant execute on function public.request_shared_room_code() to anon;

drop policy if exists "shared rooms read" on public.shared_rooms;
drop policy if exists "shared rooms create" on public.shared_rooms;
drop policy if exists "shared rooms update" on public.shared_rooms;
create policy "shared rooms read" on public.shared_rooms
  for select to anon
  using (code = public.request_shared_room_code());
create policy "shared rooms create" on public.shared_rooms
  for insert to anon
  with check (code = public.request_shared_room_code());
create policy "shared rooms update" on public.shared_rooms
  for update to anon
  using (code = public.request_shared_room_code())
  with check (code = public.request_shared_room_code());

drop policy if exists "shared participants read" on public.shared_participants;
drop policy if exists "shared participants create" on public.shared_participants;
drop policy if exists "shared participants update" on public.shared_participants;
create policy "shared participants read" on public.shared_participants
  for select to anon
  using (exists (
    select 1 from public.shared_rooms room
    where room.id = shared_participants.room_id
      and room.code = public.request_shared_room_code()
  ));
create policy "shared participants create" on public.shared_participants
  for insert to anon
  with check (exists (
    select 1 from public.shared_rooms room
    where room.id = shared_participants.room_id
      and room.code = public.request_shared_room_code()
  ));
create policy "shared participants update" on public.shared_participants
  for update to anon
  using (exists (
    select 1 from public.shared_rooms room
    where room.id = shared_participants.room_id
      and room.code = public.request_shared_room_code()
  ))
  with check (exists (
    select 1 from public.shared_rooms room
    where room.id = shared_participants.room_id
      and room.code = public.request_shared_room_code()
  ));

drop policy if exists "shared events read" on public.shared_events;
drop policy if exists "shared events create" on public.shared_events;
create policy "shared events read" on public.shared_events
  for select to anon
  using (exists (
    select 1 from public.shared_rooms room
    where room.id = shared_events.room_id
      and room.code = public.request_shared_room_code()
  ));
create policy "shared events create" on public.shared_events
  for insert to anon
  with check (exists (
    select 1 from public.shared_rooms room
    where room.id = shared_events.room_id
      and room.code = public.request_shared_room_code()
  ));

grant select, insert, update on public.shared_rooms to anon;
grant select, insert, update on public.shared_participants to anon;
grant select, insert on public.shared_events to anon;
grant usage, select on sequence public.shared_events_sequence_seq to anon;

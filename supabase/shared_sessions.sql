-- Tabletop Companion shared-session MVP
--
-- The public Supabase key is safe to ship in the browser, but it must not grant
-- global access to every tabletop room. Each request carries the six-character
-- room code in x-room-code. Mutating requests additionally carry x-client-id.
-- RLS binds writes to the claimed seat and reserves room lifecycle changes for
-- the host device. This is still capability-style private-play protection rather
-- than full user authentication; public production should add authenticated
-- player identity or a stronger room secret server-side.

create table if not exists public.shared_rooms (
  id uuid primary key,
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  battle_id text not null,
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  session_snapshot jsonb not null,
  host_client_id text not null,
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

create or replace function public.request_shared_client_id()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-client-id',
    ''
  );
$$;

grant execute on function public.request_shared_room_code() to anon;
grant execute on function public.request_shared_client_id() to anon;

drop policy if exists "shared rooms read" on public.shared_rooms;
drop policy if exists "shared rooms create" on public.shared_rooms;
drop policy if exists "shared rooms update" on public.shared_rooms;
create policy "shared rooms read" on public.shared_rooms
  for select to anon
  using (code = public.request_shared_room_code());
create policy "shared rooms create" on public.shared_rooms
  for insert to anon
  with check (
    code = public.request_shared_room_code()
    and host_client_id = public.request_shared_client_id()
    and host_client_id <> ''
  );
create policy "shared rooms update" on public.shared_rooms
  for update to anon
  using (
    code = public.request_shared_room_code()
    and host_client_id = public.request_shared_client_id()
  )
  with check (
    code = public.request_shared_room_code()
    and host_client_id = public.request_shared_client_id()
  );

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
  with check (
    client_id = public.request_shared_client_id()
    and client_id <> ''
    and exists (
      select 1 from public.shared_rooms room
      where room.id = shared_participants.room_id
        and room.code = public.request_shared_room_code()
        and (shared_participants.is_host = false or room.host_client_id = shared_participants.client_id)
    )
  );
create policy "shared participants update" on public.shared_participants
  for update to anon
  using (
    exists (
      select 1 from public.shared_rooms room
      where room.id = shared_participants.room_id
        and room.code = public.request_shared_room_code()
    )
    and (
      shared_participants.client_id = public.request_shared_client_id()
      or (
        shared_participants.is_host = false
        and shared_participants.last_seen_at < now() - interval '30 seconds'
      )
    )
  )
  with check (
    shared_participants.client_id = public.request_shared_client_id()
    and shared_participants.client_id <> ''
    and exists (
      select 1 from public.shared_rooms room
      where room.id = shared_participants.room_id
        and room.code = public.request_shared_room_code()
        and (shared_participants.is_host = false or room.host_client_id = shared_participants.client_id)
    )
  );

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
  with check (
    actor_player_id is not null
    and actor_player_id = event_payload ->> 'actorPlayerId'
    and exists (
      select 1
      from public.shared_participants participant
      join public.shared_rooms room on room.id = participant.room_id
      where participant.room_id = shared_events.room_id
        and participant.client_id = public.request_shared_client_id()
        and participant.player_id = shared_events.actor_player_id
        and room.code = public.request_shared_room_code()
    )
  );

grant select, insert, update on public.shared_rooms to anon;
grant select, insert, update on public.shared_participants to anon;
grant select, insert on public.shared_events to anon;
grant usage, select on sequence public.shared_events_sequence_seq to anon;

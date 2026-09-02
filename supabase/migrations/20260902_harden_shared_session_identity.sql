alter table public.shared_rooms
  add column if not exists host_client_id text;

update public.shared_rooms room
set host_client_id = participant.client_id
from public.shared_participants participant
where participant.room_id = room.id
  and participant.is_host = true
  and room.host_client_id is null;

alter table public.shared_rooms
  alter column host_client_id set not null;

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

grant execute on function public.request_shared_client_id() to anon;

drop policy if exists "shared rooms create" on public.shared_rooms;
drop policy if exists "shared rooms update" on public.shared_rooms;
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

drop policy if exists "shared participants create" on public.shared_participants;
drop policy if exists "shared participants update" on public.shared_participants;
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

drop policy if exists "shared events create" on public.shared_events;
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

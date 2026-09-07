-- Cumulative compatibility migration for every shared-session database created
-- before Duel 1v1 and dynamic two/three-seat lobbies. Safe to run repeatedly.

alter table public.shared_rooms
  add column if not exists started_at timestamptz;

alter table public.shared_participants
  add column if not exists is_ready boolean not null default false;

-- Rooms created before the readiness lobby were already active. Mark them as
-- started so the new lobby guard does not interrupt an in-progress battle.
drop trigger if exists enforce_shared_lobby_start on public.shared_rooms;

update public.shared_rooms
set started_at = created_at
where started_at is null
  and exists (
    select 1
    from public.shared_events event
    where event.room_id = shared_rooms.id
  );

alter table public.shared_rooms
  drop constraint if exists shared_rooms_started_after_created;

alter table public.shared_rooms
  add constraint shared_rooms_started_after_created
  check (started_at is null or started_at >= created_at);

create or replace function public.enforce_shared_lobby_start()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  required_seats integer;
  ready_online_seats integer;
begin
  if old.started_at is null and new.started_at is not null then
    required_seats := coalesce(
      jsonb_array_length(new.session_snapshot -> 'setup' -> 'players'),
      0
    );

    if required_seats not between 2 and 3 then
      raise exception 'Shared battle snapshot must contain two or three player seats.'
        using errcode = '23514';
    end if;

    select count(*) into ready_online_seats
    from public.shared_participants participant
    where participant.room_id = new.id
      and participant.is_ready = true
      and participant.last_seen_at > now() - interval '20 seconds';

    if ready_online_seats <> required_seats then
      raise exception 'All % player seats must be online and ready before starting.', required_seats
        using errcode = '23514';
    end if;

    new.started_at := now();
    new.updated_at := new.started_at;
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_shared_lobby_start() from public;
create trigger enforce_shared_lobby_start
  before update of started_at on public.shared_rooms
  for each row execute function public.enforce_shared_lobby_start();

create or replace function public.start_shared_room(p_room_id uuid)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result timestamptz;
begin
  update public.shared_rooms
  set started_at = now(), updated_at = now()
  where id = p_room_id and started_at is null
  returning started_at into result;

  if result is null then
    select room.started_at into result
    from public.shared_rooms room
    where room.id = p_room_id;
  end if;

  return result;
end;
$$;

create or replace function public.shared_schema_version()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select 5;
$$;

revoke all on function public.start_shared_room(uuid) from public;
revoke all on function public.shared_schema_version() from public;
grant execute on function public.start_shared_room(uuid) to anon;
grant execute on function public.shared_schema_version() to anon;

-- Explicit grants are required for Data API exposure on new Supabase projects.
grant select, insert, update on public.shared_rooms to anon;
grant select, insert, update on public.shared_participants to anon;
grant select, insert on public.shared_events to anon;
grant usage, select on sequence public.shared_events_sequence_seq to anon;

-- Preserve the lobby and host-correction guard when upgrading from any earlier
-- shared-session migration level.
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
        and room.started_at is not null
        and (
          shared_events.event_payload ->> 'type' <> 'STATE_CORRECTED'
          or participant.is_host = true
        )
    )
  );

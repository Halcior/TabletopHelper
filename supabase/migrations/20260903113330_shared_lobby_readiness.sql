-- Add a synchronized three-seat lobby to an existing shared-session database.
-- Existing rooms are treated as already started so applying this migration does
-- not interrupt an in-progress playtest.

alter table public.shared_rooms
  add column if not exists started_at timestamptz;

update public.shared_rooms
set started_at = created_at
where started_at is null;

alter table public.shared_rooms
  drop constraint if exists shared_rooms_started_after_created;

alter table public.shared_rooms
  add constraint shared_rooms_started_after_created
  check (started_at is null or started_at >= created_at);

alter table public.shared_participants
  add column if not exists is_ready boolean not null default false;

create or replace function public.enforce_shared_lobby_start()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.started_at is null and new.started_at is not null then
    if (
      select count(*)
      from public.shared_participants participant
      where participant.room_id = new.id
        and participant.is_ready = true
        and participant.last_seen_at > now() - interval '20 seconds'
    ) <> 3 then
      raise exception 'All three player seats must be online and ready before starting.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_shared_lobby_start() from public;
drop trigger if exists enforce_shared_lobby_start on public.shared_rooms;
create trigger enforce_shared_lobby_start
  before update of started_at on public.shared_rooms
  for each row execute function public.enforce_shared_lobby_start();

-- Events cannot be appended while the room is still in its lobby. The client
-- applies the same guard, but the database remains the security boundary.
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

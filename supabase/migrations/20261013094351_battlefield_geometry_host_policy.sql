-- Keep actor, client identity, room-code and started-room requirements.
-- Geometry changes, like state corrections, are restricted to the room host.

begin;
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
          shared_events.event_payload ->> 'type' not in ('STATE_CORRECTED', 'BATTLEFIELD_LAYOUT_CHANGED')
          or participant.is_host = true
        )
    )
  );
create or replace function public.shared_schema_version()
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select 6;
$$;
revoke all on function public.shared_schema_version() from public;
grant execute on function public.shared_schema_version() to anon;
commit;

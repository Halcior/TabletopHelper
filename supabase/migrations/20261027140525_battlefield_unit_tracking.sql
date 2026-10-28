-- Tactical map commands use the canonical shared event stream.
-- Each seat owns its army even when two seats belong to the same Doubles force.
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
          shared_events.event_payload ->> 'type' not in ('STATE_CORRECTED', 'BATTLEFIELD_LAYOUT_CHANGED', 'UNIT_TRACKING_CHANGED')
          or (participant.is_host = true and room.host_client_id = participant.client_id)
        )
        and (
          shared_events.event_payload ->> 'type' <> 'UNIT_MAP_CHANGED'
          or shared_events.event_payload -> 'payload' ->> 'playerId' = participant.player_id
          or (participant.is_host = true and room.host_client_id = participant.client_id)
        )
    )
  );
create or replace function public.shared_schema_version() returns integer
  language sql stable security invoker set search_path='' as $$select 12$$;
revoke all on function public.shared_schema_version() from public;
grant execute on function public.shared_schema_version() to anon;
commit;

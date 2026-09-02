-- STATE_CORRECTED may target another commander's state, so it is reserved for
-- the room host at the database boundary as well as in the client policy.
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
        and (
          shared_events.event_payload ->> 'type' <> 'STATE_CORRECTED'
          or participant.is_host = true
        )
    )
  );

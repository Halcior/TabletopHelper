-- Integration check against the installed schema, including the actual anon role.
-- All test rows are rolled back; identity sequence gaps are harmless.
begin;
create temporary table battlefield_rls_context as
select gen_random_uuid() as room_id,
  left(translate(upper(gen_random_uuid()::text), '-01', ''), 6) as code,
  gen_random_uuid()::text as host_client,
  gen_random_uuid()::text as peer_client;
grant select on battlefield_rls_context to anon;

insert into public.shared_rooms(id, code, battle_id, session_snapshot, host_client_id, started_at)
select room_id, code, 'battlefield-rls-verification',
  '{"setup":{"players":[{"id":"rls-host"},{"id":"rls-peer"}]}}'::jsonb, host_client, now()
from battlefield_rls_context;
insert into public.shared_participants(id, room_id, client_id, player_id, display_name, is_host, is_ready)
select gen_random_uuid(), room_id, host_client, 'rls-host', 'RLS test host', true, true from battlefield_rls_context
union all
select gen_random_uuid(), room_id, peer_client, 'rls-peer', 'RLS test peer', false, true from battlefield_rls_context;

set local role anon;
select set_config('request.headers', jsonb_build_object('x-room-code', code, 'x-client-id', host_client)::text, true)
from battlefield_rls_context;
insert into public.shared_events(room_id, event_id, action_id, actor_player_id, event_payload)
select room_id, 'rls-host-geometry', 'rls-host-geometry', 'rls-host',
  '{"type":"BATTLEFIELD_LAYOUT_CHANGED","actorPlayerId":"rls-host","payload":{"geometry":{}}}'::jsonb
from battlefield_rls_context;

select set_config('request.headers', jsonb_build_object('x-room-code', code, 'x-client-id', peer_client)::text, true)
from battlefield_rls_context;
do $$
begin
  begin
    insert into public.shared_events(room_id, event_id, action_id, actor_player_id, event_payload)
    select room_id, 'rls-peer-geometry', 'rls-peer-geometry', 'rls-peer',
      '{"type":"BATTLEFIELD_LAYOUT_CHANGED","actorPlayerId":"rls-peer","payload":{"geometry":{}}}'::jsonb
    from battlefield_rls_context;
    raise exception 'Non-host geometry was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.shared_events(room_id, event_id, action_id, actor_player_id, event_payload)
    select room_id, 'rls-spoof-host', 'rls-spoof-host', 'rls-host',
      '{"type":"BATTLEFIELD_LAYOUT_CHANGED","actorPlayerId":"rls-host","payload":{"geometry":{}}}'::jsonb
    from battlefield_rls_context;
    raise exception 'Peer client spoofed the host actor';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.shared_events(room_id, event_id, action_id, actor_player_id, event_payload)
    select room_id, 'rls-peer-correction', 'rls-peer-correction', 'rls-peer',
      '{"type":"STATE_CORRECTED","actorPlayerId":"rls-peer","payload":{}}'::jsonb
    from battlefield_rls_context;
    raise exception 'Non-host correction was accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;
insert into public.shared_events(room_id, event_id, action_id, actor_player_id, event_payload)
select room_id, 'rls-peer-control', 'rls-peer-control', 'rls-peer',
  '{"type":"OBJECTIVE_CONTROL_CHANGED","actorPlayerId":"rls-peer","payload":{"objectiveId":"CENTER","controllerPlayerId":"rls-peer"}}'::jsonb
from battlefield_rls_context;
select public.shared_schema_version() as schema_version,
  (select count(*) = 2 from public.shared_events event join battlefield_rls_context context on context.room_id = event.room_id) as host_geometry_and_peer_control_passed;
rollback;

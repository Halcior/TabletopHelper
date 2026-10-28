-- Real PostgreSQL RLS verification; no persistent test rooms or events.
begin;
select set_config('request.headers','{}',true);
create temporary table tracking_context as
select gen_random_uuid() room_id, left(translate(upper(gen_random_uuid()::text), '-01', ''), 6) code,
  gen_random_uuid()::text host_client, gen_random_uuid()::text peer_client;
grant select on tracking_context to anon;
insert into public.shared_rooms(id,code,battle_id,session_snapshot,host_client_id,started_at)
select room_id,code,'tracking-test','{"setup":{"players":[{"id":"host"},{"id":"peer"},{"id":"ally"},{"id":"enemy"}]}}',host_client,now() from tracking_context;
insert into public.shared_participants(id,room_id,client_id,player_id,display_name,is_host,is_ready)
select gen_random_uuid(),room_id,host_client,'host','Host',true,true from tracking_context
union all select gen_random_uuid(),room_id,peer_client,'peer','Peer',false,true from tracking_context;
set local role anon;
select set_config('request.headers',jsonb_build_object('x-room-code',code,'x-client-id',host_client)::text,true) from tracking_context;
insert into public.shared_events(room_id,event_id,action_id,actor_player_id,event_payload)
select room_id,'tracking-enable','tracking-enable','host','{"type":"UNIT_TRACKING_CHANGED","actorPlayerId":"host","payload":{"enabled":true}}' from tracking_context;
insert into public.shared_events(room_id,event_id,action_id,actor_player_id,event_payload)
select room_id,'host-correction','host-correction','host','{"type":"UNIT_MAP_CHANGED","actorPlayerId":"host","payload":{"playerId":"peer"}}' from tracking_context;
select set_config('request.headers',jsonb_build_object('x-room-code',code,'x-client-id',peer_client)::text,true) from tracking_context;
insert into public.shared_events(room_id,event_id,action_id,actor_player_id,event_payload)
select room_id,'peer-position','peer-position','peer','{"type":"UNIT_MAP_CHANGED","actorPlayerId":"peer","payload":{"playerId":"peer"}}' from tracking_context;
do $$
declare target text;
begin
  foreach target in array array['host','ally','enemy'] loop
    begin
      insert into public.shared_events(room_id,event_id,action_id,actor_player_id,event_payload)
      select room_id,'peer-forbidden-'||target,'peer-forbidden','peer',jsonb_build_object('type','UNIT_MAP_CHANGED','actorPlayerId','peer','payload',jsonb_build_object('playerId',target)) from tracking_context;
      raise exception 'Peer moved another army: %',target;
    exception when insufficient_privilege then null; end;
  end loop;
  begin
    insert into public.shared_events(room_id,event_id,action_id,actor_player_id,event_payload)
    select room_id,'peer-toggle','peer-toggle','peer','{"type":"UNIT_TRACKING_CHANGED","actorPlayerId":"peer","payload":{"enabled":false}}' from tracking_context;
    raise exception 'Peer changed tracking configuration';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.shared_events(room_id,event_id,action_id,actor_player_id,event_payload)
    select room_id,'spoof-host','spoof-host','host','{"type":"UNIT_MAP_CHANGED","actorPlayerId":"host","payload":{"playerId":"enemy"}}' from tracking_context;
    raise exception 'Peer spoofed host identity';
  exception when insufficient_privilege then null; end;
  if (select count(*) from public.shared_events e join tracking_context c on e.room_id=c.room_id) <> 3 then raise exception 'Unexpected accepted events'; end if;
end $$;
rollback;

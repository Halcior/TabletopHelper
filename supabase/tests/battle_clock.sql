-- Rollback-only real PostgreSQL integration: authorization, CAS, turn triggers,
-- durable anchors, duplicate delivery, teams and immutable end statistics.
begin;
create function pg_temp.clock_denied(q text) returns void language plpgsql as $$
declare rejected boolean:=false;
begin
 begin execute q; exception when insufficient_privilege or invalid_parameter_value then rejected:=true; end;
 assert rejected, 'Expected rejection: '||q;
end $$;
set local role anon;
select set_config('request.headers','{"x-room-code":"CLK234","x-client-id":"host","x-seat-credential":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',true);
insert into public.shared_rooms(id,code,battle_id,host_client_id,session_snapshot) values
('cc000000-0000-4000-8000-000000000001','CLK234','clock-battle','host',
'{"setup":{"players":[{"id":"p1","name":"Custodes"},{"id":"p2","name":"Death Guard"}],"armies":{},"turnOrder":["p1","p2"]},"state":{"events":[]}}');
insert into public.shared_participants(id,room_id,client_id,player_id,display_name,is_host) values
('ca000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000001','host','p1','Custodes',true);
select public.battle_clock_action('cc000000-0000-4000-8000-000000000001','configure',p_config:='{"preset":"custom","limitMs":60000}');
select pg_temp.clock_denied($q$select public.battle_clock_action('cc000000-0000-4000-8000-000000000001','configure',p_config:='{"preset":"custom","limitMs":null}')$q$);
select pg_temp.clock_denied($q$select public.battle_clock_action('cc000000-0000-4000-8000-000000000001','configure',p_config:='{"preset":"custom","limitMs":-1}')$q$);
select set_config('request.headers','{"x-room-code":"CLK234","x-client-id":"guest","x-seat-credential":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}',true);
insert into public.shared_participants(id,room_id,client_id,player_id,display_name) values
('cb000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000001','guest','p2','Death Guard');
select pg_temp.clock_denied($q$select public.battle_clock_action('cc000000-0000-4000-8000-000000000001','configure',p_config:='{"preset":"casual","limitMs":1}')$q$);
update public.shared_participants set is_ready=true where client_id='guest';
select set_config('request.headers','{"x-room-code":"CLK234","x-client-id":"host","x-seat-credential":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',true);
update public.shared_participants set is_ready=true where client_id='host';
-- Configuring clears Ready for both commanders.
select public.battle_clock_action('cc000000-0000-4000-8000-000000000001','configure',p_config:='{"preset":"custom","limitMs":60000}');
do $$begin assert not exists(select 1 from public.shared_participants where is_ready); end $$;
update public.shared_participants set is_ready=true where client_id='host';
select set_config('request.headers','{"x-room-code":"CLK234","x-client-id":"guest","x-seat-credential":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}',true);
update public.shared_participants set is_ready=true where client_id='guest';
select set_config('request.headers','{"x-room-code":"CLK234","x-client-id":"host","x-seat-credential":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',true);
select public.start_shared_room('cc000000-0000-4000-8000-000000000001');
do $$declare x jsonb; begin
 x:=public.battle_clock_action('cc000000-0000-4000-8000-000000000001');
 assert x#>>'{clock,activeBudgetId}'='p1';
 assert x#>>'{clock,running}'='false';
 assert jsonb_array_length(x#>'{clock,budgets}')=2;
 assert (x->>'serverNow')::bigint>1700000000000;
 x:=public.battle_clock_action('cc000000-0000-4000-8000-000000000001','resume',0);
 assert (x->>'applied')::boolean;
 -- Two clients that saw revision 1: only the first handoff may apply.
 x:=public.battle_clock_action('cc000000-0000-4000-8000-000000000001','pass',1,'p2');
 assert (x->>'applied')::boolean and x#>>'{clock,revision}'='2';
 x:=public.battle_clock_action('cc000000-0000-4000-8000-000000000001','pass',1,'p2');
 assert not (x->>'applied')::boolean and x#>>'{clock,revision}'='2';
 assert x#>>'{clock,budgets,0,manualPasses}'='1';
end $$;
-- A copied public client ID isn't a seat credential.
select set_config('request.headers','{"x-room-code":"CLK234","x-client-id":"host","x-seat-credential":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}',true);
select pg_temp.clock_denied($q$select public.battle_clock_action('cc000000-0000-4000-8000-000000000001','pause',2)$q$);
select pg_temp.clock_denied($q$select public.battle_clock_action('cc000000-0000-4000-8000-000000000001')$q$);
select pg_temp.clock_denied($q$insert into public.shared_events(room_id,event_id,action_id,actor_player_id,event_payload) values('cc000000-0000-4000-8000-000000000001','spoof','spoof','p1','{"actorPlayerId":"p1","type":"TURN_STARTED","payload":{"playerId":"p2"}}')$q$);
select set_config('request.headers','{"x-room-code":"OTHER2","x-client-id":"host","x-seat-credential":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',true);
select pg_temp.clock_denied($q$select public.battle_clock_action('cc000000-0000-4000-8000-000000000001','pause',2)$q$);
select set_config('request.headers','{"x-room-code":"CLK234","x-client-id":"host","x-seat-credential":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',true);
-- Simulate a long disconnect without sleeping: time is settled from one anchor.
reset role;
update social_private.battle_clocks set clock_state=jsonb_set(clock_state,'{anchorAt}',to_jsonb(floor(extract(epoch from clock_timestamp())*1000)::bigint-70000)) where room_id='cc000000-0000-4000-8000-000000000001';
set local role anon;
do $$declare x jsonb; begin
 x:=public.battle_clock_action('cc000000-0000-4000-8000-000000000001','pause',2);
 assert x#>>'{clock,running}'='false';
 assert (x#>>'{clock,budgets,1,usedMs}')::bigint>=70000;
 assert x#>>'{clock,revision}'='3';
 x:=public.battle_clock_action('cc000000-0000-4000-8000-000000000001','resume',3);
 assert x#>>'{clock,running}'='true';
end $$;
insert into public.shared_events(room_id,event_id,action_id,actor_player_id,event_payload) values
('cc000000-0000-4000-8000-000000000001','turn-2','turn-2','p1','{"actorPlayerId":"p1","type":"TURN_STARTED","payload":{"playerId":"p2"}}');
do $$declare x jsonb; begin
 x:=public.battle_clock_action('cc000000-0000-4000-8000-000000000001');
 assert x#>>'{clock,turnBudgetId}'='p2' and x#>>'{clock,revision}'='5';
 x:=public.battle_clock_action('cc000000-0000-4000-8000-000000000001','pass',5,'p1');
 assert x#>>'{clock,activeBudgetId}'='p1';
end $$;
insert into public.shared_events(room_id,event_id,action_id,actor_player_id,event_payload) values
('cc000000-0000-4000-8000-000000000001','fight','fight','p1','{"actorPlayerId":"p1","type":"PHASE_CHANGED","payload":{"phase":"FIGHT"}}');
do $$declare x jsonb; begin
 x:=public.battle_clock_action('cc000000-0000-4000-8000-000000000001');
 assert x#>>'{clock,activeBudgetId}'='p1' and x#>>'{clock,turnBudgetId}'='p2' and x#>>'{clock,revision}'='6';
end $$;
insert into public.shared_events(room_id,event_id,action_id,actor_player_id,event_payload) values
('cc000000-0000-4000-8000-000000000001','round-2','round-2','p1','{"actorPlayerId":"p1","type":"ROUND_STARTED","payload":{"round":2}}'),
('cc000000-0000-4000-8000-000000000001','ended','ended','p1','{"actorPlayerId":"p1","type":"GAME_ENDED","payload":{}}');
insert into public.shared_events(room_id,event_id,action_id,actor_player_id,event_payload) values
('cc000000-0000-4000-8000-000000000001','ended','ended','p1','{"actorPlayerId":"p1","type":"GAME_ENDED","payload":{}}') on conflict(room_id,event_id) do nothing;
do $$declare x jsonb; y jsonb; begin
 x:=public.battle_clock_action('cc000000-0000-4000-8000-000000000001');
 y:=public.battle_clock_action('cc000000-0000-4000-8000-000000000001');
 assert x->'clock'=y->'clock', 'Read/reload must not tick or rewrite the clock';
 assert x#>>'{clock,running}'='false' and x#>>'{clock,revision}'='8' and x#>>'{clock,round}'='2';
 assert x#>>'{clock,endedAt}' is not null;
 assert (select count(*) from public.shared_events)=4, 'No clock click events in combat history';
end $$;
reset role;
-- Teams use the final frozen roster topology, not per-device or per-seat time.
do $$declare s jsonb; cfg jsonb:='{"preset":"casual","limitMs":7200000}'; begin
 s:=social_private.clock_initial('{"setup":{"turnOrder":["c","a"],"doubles":{"forces":[{"id":"alpha","name":"Alpha","memberPlayerIds":["a","b"]},{"id":"bravo","name":"Bravo","memberPlayerIds":["c","d"]}]}}}',cfg,1000);
 assert jsonb_array_length(s->'budgets')=2 and s->>'activeBudgetId'='bravo';
 assert s#>'{budgets,0,playerIds}'='["a","b"]'::jsonb;
 s:=social_private.clock_initial('{"setup":{"turnOrder":["a","b","c"],"players":[{"id":"a","name":"A"},{"id":"b","name":"B"},{"id":"c","name":"C"}]}}',cfg,1000);
 assert jsonb_array_length(s->'budgets')=3 and s->>'activeBudgetId'='a';
end $$;
-- Post-start stale-seat reclaim rotates the proof without replacing its row.
update public.shared_participants set last_seen_at=now()-interval '1 minute'
 where room_id='cc000000-0000-4000-8000-000000000001' and player_id='p2';
set local role anon;
select set_config('request.headers','{"x-room-code":"CLK234","x-client-id":"replacement","x-seat-credential":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}',true);
update public.shared_participants set client_id='replacement',last_seen_at=now()
 where room_id='cc000000-0000-4000-8000-000000000001' and player_id='p2';
do $$begin
 assert public.battle_clock_action('cc000000-0000-4000-8000-000000000001')#>>'{clock,revision}'='8';
end $$;
select set_config('request.headers','{"x-room-code":"CLK234","x-client-id":"guest","x-seat-credential":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}',true);
select pg_temp.clock_denied($q$select public.battle_clock_action('cc000000-0000-4000-8000-000000000001')$q$);
reset role;

-- Sharing a live local battle starts at its current player and round, not setup order.
select set_config('request.headers','{"x-room-code":"CLK235","x-client-id":"host2","x-seat-credential":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',true);
insert into public.shared_rooms(id,code,battle_id,host_client_id,session_snapshot) values
('cc000000-0000-4000-8000-000000000002','CLK235','midbattle-clock','host2',
'{"setup":{"players":[{"id":"p1","name":"A"},{"id":"p2","name":"B"}],"armies":{},"turnOrder":["p1","p2"]},"state":{"events":[],"round":3,"activePlayerId":"p2"}}');
insert into public.shared_participants(id,room_id,client_id,player_id,display_name,is_host) values
('ca000000-0000-4000-8000-000000000002','cc000000-0000-4000-8000-000000000002','host2','p1','A',true),
('cb000000-0000-4000-8000-000000000002','cc000000-0000-4000-8000-000000000002','guest2','p2','B',false);
set local role anon;
select public.battle_clock_action('cc000000-0000-4000-8000-000000000002','configure',p_config:='{"preset":"casual","limitMs":7200000}');
reset role;
update public.shared_participants set is_ready=true where room_id='cc000000-0000-4000-8000-000000000002';
set local role anon;
select public.start_shared_room('cc000000-0000-4000-8000-000000000002');
do $$declare x jsonb;begin
 x:=public.battle_clock_action('cc000000-0000-4000-8000-000000000002');
 assert x#>>'{clock,activeBudgetId}'='p2' and x#>>'{clock,turnBudgetId}'='p2' and x#>>'{clock,round}'='3';
 assert x#>>'{clock,running}'='false';
end $$;
rollback;

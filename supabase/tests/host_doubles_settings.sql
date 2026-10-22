-- Rollback-only integration of host-selected partner and team turn order.
begin;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
select set_config('request.headers','{"x-room-code":"DUB234","x-client-id":"host","x-seat-credential":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',true);
insert into public.shared_rooms(id,code,battle_id,host_client_id,bring_your_army,session_snapshot)
 values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','DUB234','host-doubles-test','host',true,'{"setup":{"gameId":"host-doubles-test","rulesetId":"cauldron-ffa-3","players":[{"id":"player-a","name":"Commander player-a","deploymentZone":"A","turnPosition":1},{"id":"player-b","name":"Commander player-b","deploymentZone":"A","turnPosition":1},{"id":"player-c","name":"Commander player-c","deploymentZone":"B","turnPosition":2},{"id":"player-d","name":"Commander player-d","deploymentZone":"B","turnPosition":2}],"armies":{},"turnOrder":["player-a","player-c"],"rulesetConfig":{"mode":"doubles2v2","primaryDeck":"chapter-approved-duel","secondaryDeck":"chapter-approved","playerConfigs":{"player-a":{"forceDisposition":"take-and-hold","deploymentZone":"A","turnPosition":1},"player-b":{"forceDisposition":"take-and-hold","deploymentZone":"A","turnPosition":1},"player-c":{"forceDisposition":"purge-the-foe","deploymentZone":"B","turnPosition":2},"player-d":{"forceDisposition":"purge-the-foe","deploymentZone":"B","turnPosition":2}}},"doubles":{"rulesVersion":"GW-Doubles-1.0","forces":[{"id":"alpha","name":"Alpha","memberPlayerIds":["player-a","player-b"],"captainPlayerId":"player-a","forceDisposition":"take-and-hold","forceType":"convenience","warlord":{"playerId":"player-a","unitId":"hero-a"}},{"id":"bravo","name":"Bravo","memberPlayerIds":["player-c","player-d"],"captainPlayerId":"player-c","forceDisposition":"purge-the-foe","forceType":"convenience","warlord":{"playerId":"player-c","unitId":"hero-c"}}]}},"state":{"gameId":"host-doubles-test","status":"active","players":{"player-a":{"id":"player-a","name":"Commander player-a","units":{},"deploymentZone":"A","turnPosition":1},"player-b":{"id":"player-b","name":"Commander player-b","units":{},"deploymentZone":"A","turnPosition":1},"player-c":{"id":"player-c","name":"Commander player-c","units":{},"deploymentZone":"B","turnPosition":2},"player-d":{"id":"player-d","name":"Commander player-d","units":{},"deploymentZone":"B","turnPosition":2}},"turnOrder":["player-a","player-c"],"activePlayerId":"player-a","events":[{"type":"TURN_STARTED","payload":{"playerId":"player-a"}},{"type":"RULESET_EVENT","payload":{"action":"TURN_SNAPSHOT_CAPTURED","data":{"playerId":"player-a","round":1}}}]},"redoActions":[]}'::jsonb);
insert into public.shared_participants(id,room_id,client_id,player_id,display_name,is_host)
 values('11000000-0000-4000-8000-000000000000','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','host','player-a','Captain A',true);
select public.set_host_lobby_settings('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',array['player-c','player-a'],array['player-a','player-d']);
do $$begin
 assert public.get_host_lobby_settings('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')->'turnOrder'='["player-c","player-a"]'::jsonb;
 assert public.get_host_lobby_settings('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')->'teamAlpha'='["player-a","player-d"]'::jsonb;
end $$;
select set_config('request.headers','{"x-room-code":"DUB234","x-client-id":"b","x-seat-credential":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}',true);
insert into public.shared_participants(id,room_id,client_id,player_id,display_name)
 values('21000000-0000-4000-8000-000000000000','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','b','player-b','player-b');
select set_config('request.headers','{"x-room-code":"DUB234","x-client-id":"c","x-seat-credential":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}',true);
insert into public.shared_participants(id,room_id,client_id,player_id,display_name)
 values('22000000-0000-4000-8000-000000000000','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','c','player-c','player-c');
select set_config('request.headers','{"x-room-code":"DUB234","x-client-id":"d","x-seat-credential":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}',true);
insert into public.shared_participants(id,room_id,client_id,player_id,display_name)
 values('23000000-0000-4000-8000-000000000000','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','d','player-d','player-d');
-- A visible client ID is not a host credential.
select set_config('request.headers','{"x-room-code":"DUB234","x-client-id":"host","x-seat-credential":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}',true);
create function pg_temp.blocked(q text) returns void language plpgsql as $$
declare rejected boolean:=false;
begin
 begin execute q; exception when insufficient_privilege or check_violation or invalid_parameter_value then rejected:=true; end;
 assert rejected, 'Expected rejection: '||q;
end $$;
select pg_temp.blocked($q$select public.set_host_lobby_settings('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',array['player-a','player-c'],array['player-a','player-b'])$q$);
select set_config('request.headers','{"x-room-code":"DUB234","x-client-id":"host","x-seat-credential":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',true);
select public.stage_shared_roster('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','{"id":"roster-host","name":"Roster host","faction":"Custodes","units":[{"id":"hero-a","name":"Captain","points":100,"startingModels":1,"leaderOfUnitId":null,"isWarlord":true,"keywords":["CHARACTER"],"categories":[]}]}'::jsonb);
select public.set_shared_seat_settings('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','take-and-hold');
update public.shared_participants set is_ready=true where client_id='host';
select set_config('request.headers','{"x-room-code":"DUB234","x-client-id":"b","x-seat-credential":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}',true);
select public.stage_shared_roster('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','{"id":"roster-b","name":"Roster b","faction":"Custodes","units":[{"id":"hero-b","name":"Captain","points":100,"startingModels":1,"leaderOfUnitId":null,"isWarlord":true,"keywords":["CHARACTER"],"categories":[]}]}'::jsonb);
update public.shared_participants set is_ready=true where client_id='b';
select set_config('request.headers','{"x-room-code":"DUB234","x-client-id":"c","x-seat-credential":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}',true);
select public.stage_shared_roster('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','{"id":"roster-c","name":"Roster c","faction":"Custodes","units":[{"id":"hero-c","name":"Captain","points":100,"startingModels":1,"leaderOfUnitId":null,"isWarlord":true,"keywords":["CHARACTER"],"categories":[]}]}'::jsonb);
select public.set_shared_seat_settings('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','purge-the-foe');
update public.shared_participants set is_ready=true where client_id='c';
select set_config('request.headers','{"x-room-code":"DUB234","x-client-id":"d","x-seat-credential":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}',true);
select public.stage_shared_roster('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','{"id":"roster-d","name":"Roster d","faction":"Custodes","units":[{"id":"hero-d","name":"Captain","points":100,"startingModels":1,"leaderOfUnitId":null,"isWarlord":true,"keywords":["CHARACTER"],"categories":[]}]}'::jsonb);
update public.shared_participants set is_ready=true where client_id='d';
select set_config('request.headers','{"x-room-code":"DUB234","x-client-id":"host","x-seat-credential":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',true);
select public.start_shared_room('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
do $$declare snapshot jsonb; begin
 select session_snapshot into snapshot from public.shared_rooms where code='DUB234';
 assert snapshot#>'{setup,turnOrder}'='["player-c","player-a"]'::jsonb, 'host turn order';
 assert snapshot#>>'{state,events,0,payload,playerId}'='player-c', 'first event correct';
 assert snapshot#>>'{state,events,1,payload,data,playerId}'='player-c', 'turn snapshot correct';
 assert snapshot#>'{setup,doubles,forces,0,memberPlayerIds}'='["player-a","player-d"]'::jsonb, 'alpha team';
 assert snapshot#>'{setup,doubles,forces,1,memberPlayerIds}'='["player-b","player-c"]'::jsonb, 'bravo team';
 assert snapshot#>>'{setup,doubles,forces,0,warlord,playerId}' in ('player-a','player-d'), 'alpha Warlord';
 assert snapshot#>>'{setup,doubles,forces,1,warlord,playerId}' in ('player-b','player-c'), 'bravo Warlord';
end $$;
rollback;

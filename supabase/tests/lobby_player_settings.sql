-- Disposable PostgreSQL test for owner-sourced nicknames and mission choices.
begin;
insert into auth.users(id) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

create function pg_temp.denied(q text) returns void language plpgsql as $$
declare blocked boolean := false;
begin
 begin execute q; exception when check_violation or insufficient_privilege or invalid_parameter_value then blocked:=true; end;
 assert blocked, 'Expected rejection: '||q;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}',true);
select public.social_action('profile','{"display_name":"Captain Aurelius"}');
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
select public.social_action('profile','{"display_name":"Overlord Nemesor"}');

reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
select set_config('request.headers','{"x-room-code":"ABC456","x-client-id":"host","x-seat-credential":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',true);
insert into public.shared_rooms(id,code,battle_id,host_client_id,bring_your_army,session_snapshot) values(
'dddddddd-dddd-4ddd-8ddd-dddddddddddd','ABC456','bya-settings','host',true,
'{"setup":{"players":[{"id":"p1","name":"Player I"},{"id":"p2","name":"Player II"}],
"armies":{},"turnOrder":["p1","p2"],
"rulesetConfig":{"primaryDeck":"chapter-approved-duel",
"playerConfigs":{"p1":{"forceDisposition":"disruption"},"p2":{"forceDisposition":"priority-assets"}}}},
"state":{"events":[]}}');
insert into public.shared_participants(id,room_id,client_id,player_id,display_name,is_host) values
('10000000-0000-4000-8000-000000000000','dddddddd-dddd-4ddd-8ddd-dddddddddddd','host','p1','Player I',true);
select public.stage_shared_roster('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
'{"id":"host","name":"Custodes roster","faction":"Custodes","units":[{"id":"u1","name":"Captain","startingModels":1,"points":100,"leaderOfUnitId":null,"keywords":["CHARACTER"]}]}');
select pg_temp.denied($q$update public.shared_participants set is_ready=true where client_id='host'$q$);

-- A can only write as the actual claimed seat and derives profile name server-side.
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}',true);
select public.set_shared_seat_settings('dddddddd-dddd-4ddd-8ddd-dddddddddddd','take-and-hold');
reset role; set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$begin
 assert (select display_name='Captain Aurelius' from public.shared_participants where client_id='host');
 assert (select force_disposition='take-and-hold' from public.shared_participants where client_id='host');
end $$;

-- A visible client_id must never authorize someone else to change their seat.
select set_config('request.headers','{"x-room-code":"ABC456","x-client-id":"host","x-seat-credential":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}',true);
select pg_temp.denied($q$select public.set_shared_seat_settings('dddddddd-dddd-4ddd-8ddd-dddddddddddd','disruption')$q$);
select set_config('request.headers','{"x-room-code":"ABC456","x-client-id":"host","x-seat-credential":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',true);
reset role; set local role anon;
select set_config('request.jwt.claim.sub','',true);
-- Host may configure turn order but another room member cannot impersonate host.
select set_config('request.headers','{"x-room-code":"ABC456","x-client-id":"host","x-seat-credential":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}',true);
select pg_temp.denied($q$select public.set_host_lobby_settings('dddddddd-dddd-4ddd-8ddd-dddddddddddd',array['p2','p1'],'{}')$q$);
select set_config('request.headers','{"x-room-code":"ABC456","x-client-id":"host","x-seat-credential":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',true);
select public.set_host_lobby_settings('dddddddd-dddd-4ddd-8ddd-dddddddddddd',array['p2','p1'],'{}');
do $$begin
 assert public.get_host_lobby_settings('dddddddd-dddd-4ddd-8ddd-dddddddddddd')->'turnOrder'='["p2","p1"]'::jsonb;
end $$;
update public.shared_participants set display_name='FAKE',force_disposition='disruption' where client_id='host';
do $$begin
 assert (select display_name='Captain Aurelius' and force_disposition='take-and-hold'
  from public.shared_participants where client_id='host'), 'Direct room PATCH must not spoof identity/mission';
end $$;
update public.shared_participants set is_ready=true where client_id='host';

-- Owner changing their own disposition resets Ready.
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select public.set_shared_seat_settings('dddddddd-dddd-4ddd-8ddd-dddddddddddd','reconnaissance');
reset role; set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$begin assert not(select is_ready from public.shared_participants where client_id='host'); end $$;

reset role; set local role anon;
select set_config('request.jwt.claim.sub','',true);
update public.shared_participants set is_ready=true where client_id='host';
select set_config('request.headers','{"x-room-code":"ABC456","x-client-id":"guest","x-seat-credential":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}',true);
insert into public.shared_participants(id,room_id,client_id,player_id,display_name) values
('20000000-0000-4000-8000-000000000000','dddddddd-dddd-4ddd-8ddd-dddddddddddd','guest','p2','Player II');
select public.stage_shared_roster('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
'{"id":"guest","name":"Necron roster","faction":"Necrons","units":[{"id":"u2","name":"Overlord","startingModels":1,"points":100,"leaderOfUnitId":null,"keywords":["CHARACTER"]}]}');
select pg_temp.denied($q$update public.shared_participants set is_ready=true where client_id='guest'$q$);
set local role authenticated;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
select public.set_shared_seat_settings('dddddddd-dddd-4ddd-8ddd-dddddddddddd','purge-the-foe');
reset role; set local role anon;
select set_config('request.jwt.claim.sub','',true);
update public.shared_participants set is_ready=true where client_id='guest';
select set_config('request.headers','{"x-room-code":"ABC456","x-client-id":"host","x-seat-credential":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',true);
select public.start_shared_room('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
do $$declare result jsonb; begin
 select session_snapshot into result from public.shared_rooms where code='ABC456';
 assert result#>>'{setup,players,0,name}'='Captain Aurelius';
 assert result#>>'{setup,players,1,name}'='Overlord Nemesor';
 assert result#>'{setup,turnOrder}'='["p2","p1"]'::jsonb;
 assert result#>>'{state,activePlayerId}'='p2';
 assert result#>>'{setup,rulesetConfig,playerConfigs,p1,forceDisposition}'='reconnaissance';
 assert result#>>'{setup,rulesetConfig,playerConfigs,p2,forceDisposition}'='purge-the-foe';
 assert result#>>'{setup,armies,seat:p1,name}'='Custodes roster';
 assert result#>>'{setup,armies,seat:p2,name}'='Necron roster';
end $$;
select pg_temp.denied($q$select public.set_shared_seat_settings('dddddddd-dddd-4ddd-8ddd-dddddddddddd','disruption')$q$);
-- Historical waiting-room participant rows must not block account deletion.
reset role;
delete from auth.users where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
do $$begin assert (select profile_user_id is null from public.shared_participants where player_id='p2'); end $$;
rollback;

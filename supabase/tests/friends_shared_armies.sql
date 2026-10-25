-- Rollback-only integration test. Run on a disposable PostgreSQL/Supabase DB.
-- Provisioning identities uses the owner; every client operation below uses the
-- actual authenticated/anon role, never a service-role bypass.
begin;
insert into auth.users(id) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
create function pg_temp.denied(q text) returns void language plpgsql security invoker as $$
declare blocked boolean:=false;
begin
 begin execute q; exception when insufficient_privilege or check_violation or invalid_parameter_value then blocked:=true; end;
 assert blocked, 'Unexpected permission: '||q;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}',true);
select public.social_action('profile','{"display_name":"Custodes","avatar":"CU"}');
select set_config('test.a_code',(public.social_action('profile')->>'friend_code'),true);
select public.save_user_army('11111111-1111-4111-8111-111111111111',0,'11111111-1111-4111-8111-111111111110','{"id":"11111111-1111-4111-8111-111111111111","name":"Private Custodes","faction":"Custodes","totalPoints":100,"detachments":[],"units":[{"id":"u1","name":"Captain","startingModels":1,"points":100,"isWarlord":true,"keywords":["CHARACTER"],"categories":[],"leaderOfUnitId":null}],"localMediaId":"never-send"}');
select public.social_action('visibility','{"army_id":"11111111-1111-4111-8111-111111111111","visibility":"friends"}');
select public.save_user_army('22222222-2222-4222-8222-222222222222',0,'22222222-2222-4222-8222-222222222220','{"id":"22222222-2222-4222-8222-222222222222","name":"Always Private","faction":"Custodes","units":[]}');
select pg_temp.denied($q$select public.social_action('request','{"user_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}')$q$);

select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
select public.social_action('profile','{"display_name":"Necrons"}');
select set_config('test.b_code',(public.social_action('profile')->>'friend_code'),true);
do $$begin
 assert current_setting('test.a_code')<>current_setting('test.b_code'), 'Unique random codes';
 assert length(current_setting('test.a_code'))=32, '128-bit code';
 assert (select count(*) from public.player_profiles)=1, 'Profiles are owner-only';
 assert (select count(*) from public.user_armies)=0, 'A and B isolated';
 assert public.social_action('search',jsonb_build_object('code',current_setting('test.a_code')))->>'display_name'='Custodes';
end $$;
select pg_temp.denied($q$select public.social_action('shared','{"user_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}')$q$);
select pg_temp.denied($q$update public.player_profiles set display_name='spoof' where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$q$);
select pg_temp.denied($q$insert into public.friendships(user_a,user_b,sender_id,status) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','accepted')$q$);
select public.social_action('request','{"user_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}');
select public.social_action('request','{"user_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}');
select pg_temp.denied($q$select public.social_action('accept','{"user_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}')$q$);
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
-- Reverse request is idempotent; it must not silently accept an incoming request.
select public.social_action('request','{"user_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}');
do $$begin assert jsonb_array_length(public.social_action('list'))=1; assert public.social_action('list')->0->>'status'='pending'; end $$;
select public.social_action('accept','{"user_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}');
select public.social_action('accept','{"user_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}');
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
do $$declare x jsonb; begin
 x:=public.social_action('shared','{"user_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}');
 assert jsonb_array_length(x)=1, 'Only Friends list returned';
 assert not (x->0 ? 'revision') and not(x->0 ? 'mutation_id'), 'No cloud metadata';
 assert not (x->0->'army' ? 'localMediaId'), 'No local photo namespace';
 assert social_private.may_view_army_media('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111'), 'Friends must see explicitly shared army images';
 assert not social_private.may_view_army_media('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222'), 'Private army images are never shared';
end $$;
update public.user_armies set army_data='{}' where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
-- RLS update silently sees zero rows (allowed SQL privilege), so check owner-only data.
do $$begin assert (select count(*) from public.user_armies)=0; end $$;
select pg_temp.denied($q$select public.social_action('visibility','{"army_id":"11111111-1111-4111-8111-111111111111","visibility":"friends"}')$q$);
select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
select public.social_action('profile');
select pg_temp.denied($q$select public.social_action('shared','{"user_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}')$q$);
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
select public.social_action('remove','{"user_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}');
do $$begin assert not social_private.may_view_army_media('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111'), 'Unfriending revokes cloud media access'; end $$;
select pg_temp.denied($q$select public.social_action('shared','{"user_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}')$q$);
-- Cancel, reject, and repeated operations leave no phantom friendships.
select public.social_action('request','{"user_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}');
select public.social_action('cancel','{"user_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}');
select public.social_action('cancel','{"user_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}');
select public.social_action('request','{"user_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}');
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select public.social_action('reject','{"user_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}');
do $$begin assert public.social_action('list')='[]'::jsonb; end $$;
select public.social_action('request','{"user_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}');
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
select public.social_action('accept','{"user_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}');
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
select pg_temp.denied($q$select public.social_action('profile')$q$);
select pg_temp.denied($q$select * from public.user_armies$q$);
select pg_temp.denied($q$select * from public.player_profiles$q$);
select pg_temp.denied($q$select * from public.friendships$q$);
select pg_temp.denied($q$select * from public.game_invites$q$);
-- Lobby fixture with two independently owned seats.
select set_config('request.headers','{"x-room-code":"ABC234","x-client-id":"host","x-seat-credential":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',true);
insert into public.shared_rooms(id,code,battle_id,host_client_id,bring_your_army,session_snapshot) values
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','ABC234','bya','host',true,'{"setup":{"players":[{"id":"p1","name":"A"},{"id":"p2","name":"B"}],"armies":{},"turnOrder":["p1","p2"]},"state":{"events":[]}}');
insert into public.shared_participants(id,room_id,client_id,player_id,display_name,is_host) values('10000000-0000-4000-8000-000000000000','dddddddd-dddd-4ddd-8ddd-dddddddddddd','host','p1','A',true);
select pg_temp.denied($q$update public.shared_participants set is_ready=true where client_id='host'$q$);
select pg_temp.denied($q$select public.start_shared_room('dddddddd-dddd-4ddd-8ddd-dddddddddddd')$q$);
select public.stage_shared_roster('dddddddd-dddd-4ddd-8ddd-dddddddddddd','{"id":"local","name":"A roster","faction":"Custodes","units":[{"id":"u","name":"Guard","points":100,"startingModels":4,"leaderOfUnitId":null}]}');
update public.shared_participants set is_ready=true where client_id='host';
-- Repeated identical selection preserves Ready.
select public.stage_shared_roster('dddddddd-dddd-4ddd-8ddd-dddddddddddd','{"id":"local","name":"A roster","faction":"Custodes","units":[{"id":"u","name":"Guard","points":100,"startingModels":4,"leaderOfUnitId":null}]}');
do $$begin assert (select is_ready from public.shared_participants where client_id='host'); end $$;
-- Changing selection invalidates Ready.
select public.stage_shared_roster('dddddddd-dddd-4ddd-8ddd-dddddddddddd','{"id":"local2","name":"A changed","faction":"Custodes","units":[{"id":"u","name":"Guard","points":110,"startingModels":4,"leaderOfUnitId":null}]}');
do $$begin assert not(select is_ready from public.shared_participants where client_id='host'); end $$;
update public.shared_participants set is_ready=true where client_id='host';
select set_config('request.headers','{"x-room-code":"ABC234","x-client-id":"guest","x-seat-credential":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}',true);
insert into public.shared_participants(id,room_id,client_id,player_id,display_name) values('20000000-0000-4000-8000-000000000000','dddddddd-dddd-4ddd-8ddd-dddddddddddd','guest','p2','B');
select public.stage_shared_roster('dddddddd-dddd-4ddd-8ddd-dddddddddddd','{"id":"local","name":"B roster","faction":"Necrons","units":[{"id":"u","name":"Warriors","points":100,"startingModels":10,"leaderOfUnitId":null}]}');
update public.shared_participants set is_ready=true where client_id='guest';
select pg_temp.denied($q$update public.shared_rosters set army_data='{}'$q$);
select pg_temp.denied($q$insert into public.shared_events(room_id,event_id,action_id,event_payload) values('dddddddd-dddd-4ddd-8ddd-dddddddddddd','e','e','{}')$q$);
-- Logged-in staging cannot steal another account's roster, even with a valid seat.
reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
select pg_temp.denied($q$select public.stage_shared_roster('dddddddd-dddd-4ddd-8ddd-dddddddddddd','{"id":"11111111-1111-4111-8111-111111111111"}')$q$);
-- Invitations require friendship AND a host capability, then expire/cancel safely.
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select pg_temp.denied($q$select public.social_action('invite','{"user_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","room_id":"dddddddd-dddd-4ddd-8ddd-dddddddddddd"}')$q$);
select set_config('request.headers','{"x-room-code":"ABC234","x-client-id":"host","x-seat-credential":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',true);
select public.social_action('invite','{"user_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","room_id":"dddddddd-dddd-4ddd-8ddd-dddddddddddd"}');
select public.social_action('invite','{"user_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","room_id":"dddddddd-dddd-4ddd-8ddd-dddddddddddd"}');
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
do $$begin assert jsonb_array_length(public.social_action('invites'))=1; end $$;
select set_config('test.invite',public.social_action('invites')->0->>'id',true);
do $$begin assert public.social_action('resolve-invite',jsonb_build_object('id',current_setting('test.invite')))->>'room_code'='ABC234'; end $$;
select public.social_action('decline-invite',jsonb_build_object('id',public.social_action('invites')->0->>'id'));
do $$begin assert public.social_action('invites')='[]'::jsonb; end $$;
select pg_temp.denied($q$select public.social_action('resolve-invite',jsonb_build_object('id',current_setting('test.invite')))$q$);
reset role; set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.headers','{"x-room-code":"ABC234","x-client-id":"host","x-seat-credential":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',true);
select public.start_shared_room('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
-- Late lobby Leave is a database-filtered no-op after Start has committed.
update public.shared_rooms set status='abandoned' where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd' and started_at is null;
do $$begin assert (select status='active' from public.shared_rooms where code='ABC234'); assert public.shared_schema_version()=11; end $$;
do $$declare s jsonb; begin
 select session_snapshot into s from public.shared_rooms where code='ABC234';
 assert s#>>'{setup,players,0,armyId}'='seat:p1';
 assert s#>>'{setup,armies,seat:p1,name}'='A changed';
 assert s#>>'{setup,armies,seat:p2,name}'='B roster';
end $$;
select pg_temp.denied($q$select public.stage_shared_roster('dddddddd-dddd-4ddd-8ddd-dddddddddddd','{}')$q$);
select pg_temp.denied($q$update public.shared_rooms set session_snapshot='{}' where code='ABC234'$q$);
select pg_temp.denied($q$update public.shared_rooms set started_at=null where code='ABC234'$q$);
select set_config('request.headers','{"x-room-code":"ZZZ999","x-client-id":"host","x-seat-credential":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',true);
do $$begin assert (select count(*) from public.shared_rosters)=0; end $$;
rollback;

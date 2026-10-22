-- Additive migration; user_armies CAS, tombstones and owner-only RLS stay intact.
create schema if not exists social_private;
revoke all on schema social_private from public, anon;
grant usage on schema social_private to authenticated;

create table public.player_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check (length(trim(display_name)) between 1 and 60),
 friend_code text not null unique default replace(gen_random_uuid()::text, '-', ''),
 avatar text not null default '' check (length(avatar) <= 4),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.friendships (
 user_a uuid not null references public.player_profiles(user_id) on delete cascade,
 user_b uuid not null references public.player_profiles(user_id) on delete cascade,
 sender_id uuid not null references public.player_profiles(user_id),
 status text not null default 'pending' check (status in ('pending','accepted')),
 created_at timestamptz not null default now(),
 primary key(user_a,user_b), check(user_a < user_b), check(sender_id in (user_a,user_b))
);
create index friendships_b on public.friendships(user_b);
create table public.army_sharing (
 user_id uuid not null, army_id uuid not null, visibility text not null default 'private' check(visibility in ('private','friends')),
 primary key(user_id,army_id), foreign key(user_id,army_id) references public.user_armies(user_id,id) on delete cascade
);
create table public.game_invites (
 id uuid primary key default gen_random_uuid(), room_id uuid not null references public.shared_rooms(id) on delete cascade,
 sender_id uuid not null references public.player_profiles(user_id) on delete cascade,
 recipient_id uuid not null references public.player_profiles(user_id) on delete cascade,
 expires_at timestamptz not null default now()+interval '2 hours',
 unique(room_id,sender_id,recipient_id), check(sender_id <> recipient_id)
);
create index game_invites_recipient on public.game_invites(recipient_id);
alter table public.player_profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.army_sharing enable row level security;
alter table public.game_invites enable row level security;
revoke all on public.player_profiles, public.friendships, public.army_sharing, public.game_invites from public,anon,authenticated;
-- No direct write grants: atomic transitions and safe projections through RPC only.
grant select on public.player_profiles to authenticated;
create policy own_profile on public.player_profiles for select to authenticated using(user_id=(select auth.uid()));

create function social_private.social(p_action text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid := auth.uid(); other uuid; lo uuid; hi uuid; relation public.friendships;
 result jsonb; army uuid; rid uuid; room public.shared_rooms;
begin
 if me is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'Sign in required' using errcode='42501'; end if;
 insert into public.player_profiles(user_id,display_name) values(me,'Commander') on conflict do nothing;
 if p_action='profile' then
   if p_data ? 'display_name' then
     update public.player_profiles set display_name=trim(p_data->>'display_name'),avatar=coalesce(p_data->>'avatar',''),updated_at=now() where user_id=me;
   end if;
   return (select to_jsonb(p) from public.player_profiles p where user_id=me);
 elsif p_action='search' then
   return (select jsonb_build_object('user_id',p.user_id,'display_name',p.display_name,'friend_code',p.friend_code,'avatar',p.avatar)
     from public.player_profiles p where p.friend_code=lower(replace(trim(p_data->>'code'),'-','')));
 elsif p_action='list' then
   select coalesce(jsonb_agg(jsonb_build_object('user_id',p.user_id,'display_name',p.display_name,'friend_code',p.friend_code,'avatar',p.avatar,
      'status',f.status,'incoming',f.sender_id<>me,
      'army_count',(select count(*) from public.army_sharing s join public.user_armies a on a.user_id=s.user_id and a.id=s.army_id
          where s.user_id=p.user_id and s.visibility='friends' and a.deleted_at is null and f.status='accepted')) order by p.display_name),'[]'::jsonb)
     into result from public.friendships f join public.player_profiles p on p.user_id=case when f.user_a=me then f.user_b else f.user_a end
     where me in(f.user_a,f.user_b);
   return result;
 elsif p_action='visibility-list' then
   return (select coalesce(jsonb_object_agg(army_id,visibility),'{}'::jsonb) from public.army_sharing where user_id=me);
 elsif p_action='visibility' then
   army := (p_data->>'army_id')::uuid;
   if not exists(select 1 from public.user_armies where user_id=me and id=army and deleted_at is null) then raise exception 'Sync this roster before sharing it' using errcode='42501'; end if;
   insert into public.army_sharing values(me,army,p_data->>'visibility') on conflict(user_id,army_id) do update set visibility=excluded.visibility;
   return '{}'::jsonb;
 elsif p_action='resolve-invite' then
   select jsonb_build_object('room_code',r.code) into result
    from public.game_invites i join public.shared_rooms r on r.id=i.room_id
    where i.id=(p_data->>'id')::uuid and i.recipient_id=me and i.expires_at>now() and r.started_at is null and r.status='active'
      and exists(select 1 from public.friendships f where f.user_a=least(i.sender_id,i.recipient_id) and f.user_b=greatest(i.sender_id,i.recipient_id) and f.status='accepted');
   if result is null then raise exception 'Invitation expired or cancelled' using errcode='42501'; end if;
   return result;
 elsif p_action='invites' then
   return (select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'room_code',r.code,'room_id',r.id,'sender_id',i.sender_id,'recipient_id',i.recipient_id,'display_name',p.display_name,'expires_at',i.expires_at)),'[]'::jsonb)
    from public.game_invites i join public.shared_rooms r on r.id=i.room_id join public.player_profiles p on p.user_id=i.sender_id
    where me in(i.sender_id,i.recipient_id) and i.expires_at>now() and r.started_at is null and r.status='active'
      and exists(select 1 from public.friendships f where f.user_a=least(i.sender_id,i.recipient_id) and f.user_b=greatest(i.sender_id,i.recipient_id) and f.status='accepted'));
 elsif p_action in ('decline-invite','cancel-invite') then
   delete from public.game_invites where id=(p_data->>'id')::uuid and (case when p_action='decline-invite' then recipient_id else sender_id end)=me;
   return '{}'::jsonb;
 end if;
 other := (p_data->>'user_id')::uuid;
 if other is null or other=me then raise exception 'Choose another commander' using errcode='22023'; end if;
 lo:=least(me,other); hi:=greatest(me,other);
 -- Serializes all transitions of a pair, including simultaneous cross requests.
 perform pg_advisory_xact_lock(hashtextextended(lo::text||hi::text,0));
 select * into relation from public.friendships where user_a=lo and user_b=hi for update;
 if p_action='request' then
   insert into public.friendships(user_a,user_b,sender_id) values(lo,hi,me) on conflict do nothing;
 elsif p_action='accept' then
   if relation.status='pending' and relation.sender_id<>me then update public.friendships set status='accepted' where user_a=lo and user_b=hi;
   elsif relation.status is distinct from 'accepted' then raise exception 'No incoming request' using errcode='42501'; end if;
 elsif p_action in ('cancel','reject','remove') then
   if (p_action='cancel' and relation.status='pending' and relation.sender_id=me)
      or (p_action='reject' and relation.status='pending' and relation.sender_id<>me)
      or (p_action='remove' and relation.status='accepted') then
     delete from public.friendships where user_a=lo and user_b=hi;
     delete from public.game_invites where least(sender_id,recipient_id)=lo and greatest(sender_id,recipient_id)=hi;
   end if;
 elsif p_action='shared' then
   if relation.status is distinct from 'accepted' then raise exception 'Friend access required' using errcode='42501'; end if;
   return (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'army',
     (a.army_data - 'localMediaId' - 'library') || jsonb_build_object('units',
       (select coalesce(jsonb_agg(u - 'sourceMetadata' - 'sourceId'),'[]'::jsonb) from jsonb_array_elements(a.army_data->'units') u)))),'[]'::jsonb)
     from public.user_armies a join public.army_sharing s on s.user_id=a.user_id and s.army_id=a.id
     where a.user_id=other and a.deleted_at is null and s.visibility='friends');
 elsif p_action='invite' then
   if relation.status is distinct from 'accepted' then raise exception 'Friend access required' using errcode='42501'; end if;
   rid := (p_data->>'room_id')::uuid;
   select * into room from public.shared_rooms where id=rid and code=public.request_shared_room_code()
    and host_client_id=public.request_shared_client_id() and host_client_id<>'' and started_at is null and status='active' for update;
   if room.id is null or not exists(select 1 from public.shared_participants where room_id=rid and client_id=room.host_client_id and is_host) then raise exception 'Open your host lobby first' using errcode='42501'; end if;
   insert into public.game_invites(room_id,sender_id,recipient_id) values(rid,me,other)
    on conflict(room_id,sender_id,recipient_id) do update set expires_at=now()+interval '2 hours';
 else raise exception 'Unknown social action' using errcode='22023';
 end if;
 return '{}'::jsonb;
end $$;
revoke all on function social_private.social(text,jsonb) from public,anon;
grant execute on function social_private.social(text,jsonb) to authenticated;
create function public.social_action(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
 language sql security invoker set search_path='' as $$ select social_private.social(p_action,p_data) $$;
revoke all on function public.social_action(text,jsonb) from public,anon;
grant execute on function public.social_action(text,jsonb) to authenticated;

-- Existing rooms remain compatible. New rooms may opt into per-seat staging.
alter table public.shared_rooms add column bring_your_army boolean not null default false;
create table public.shared_rosters (
 room_id uuid not null, player_id text not null, client_id text not null,
 army_data jsonb not null, selection_id uuid not null default gen_random_uuid(),
 primary key(room_id,player_id),
 foreign key(room_id,player_id) references public.shared_participants(room_id,player_id) on delete cascade,
 check(jsonb_typeof(army_data)='object' and jsonb_typeof(army_data->'units')='array'),
 check(octet_length(army_data::text)<=8388608)
);
alter table public.shared_rosters enable row level security;
revoke all on public.shared_rosters from public,anon,authenticated;
grant select on public.shared_rosters to anon;
create policy room_rosters_read on public.shared_rosters for select to anon using(exists(select 1 from public.shared_rooms r where r.id=room_id and r.code=public.request_shared_room_code()));

-- Definer is isolated in a non-exposed schema. Every operation validates the
-- existing room AND claimed client capability. Auth is additional, never a seat.
create function social_private.stage_roster(p_room_id uuid,p_army jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare r public.shared_rooms; seat public.shared_participants; roster jsonb;
begin
 select * into r from public.shared_rooms where id=p_room_id and code=public.request_shared_room_code() for update;
 if r.id is null or r.started_at is not null or not r.bring_your_army or r.status<>'active' then raise exception 'Lobby unavailable' using errcode='42501'; end if;
 select * into seat from public.shared_participants where room_id=r.id and client_id=public.request_shared_client_id() and client_id<>'' for update;
 if seat.id is null then raise exception 'Claim a seat first' using errcode='42501'; end if;
 roster := p_army - 'localMediaId';
 if auth.uid() is not null then
   select army_data - 'localMediaId' into roster from public.user_armies where user_id=auth.uid() and id=(p_army->>'id')::uuid and deleted_at is null;
   if roster is null then raise exception 'Choose a synced army belonging to your account' using errcode='42501'; end if;
   if roster is distinct from (p_army - 'localMediaId') then raise exception 'Roster changed during sync. Review it and choose again' using errcode='22023'; end if;
 end if;
 if coalesce(jsonb_typeof(roster->'units'),'')<>'array' or coalesce(jsonb_array_length(roster->'units'),0)<1
   or coalesce(length(roster->>'id'),0)<1 or coalesce(length(trim(roster->>'name')),0)<1 or coalesce(length(roster->>'faction'),0)<1
   or jsonb_array_length(roster->'units')>2000 then raise exception 'Invalid roster' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(roster->'units') u where coalesce(u->>'id','')='' or coalesce((u->>'startingModels')::int,0)<1 or coalesce((u->>'points')::int,-1)<0)
    or (select count(*)<>count(distinct u->>'id') from jsonb_array_elements(roster->'units') u)
    or exists(select 1 from jsonb_array_elements(roster->'units') u where u->>'leaderOfUnitId' is not null and not exists(select 1 from jsonb_array_elements(roster->'units') t where t->>'id'=u->>'leaderOfUnitId' and t->>'id'<>u->>'id'))
 then raise exception 'Invalid roster units' using errcode='22023'; end if;
 if exists(select 1 from public.shared_rosters where room_id=r.id and player_id=seat.player_id and client_id=seat.client_id and army_data=roster) then return; end if;
 insert into public.shared_rosters(room_id,player_id,client_id,army_data) values(r.id,seat.player_id,seat.client_id,roster)
  on conflict(room_id,player_id) do update set client_id=excluded.client_id,army_data=excluded.army_data,selection_id=gen_random_uuid();
 update public.shared_participants set is_ready=false,last_seen_at=now() where id=seat.id;
end $$;
revoke all on function social_private.stage_roster(uuid,jsonb) from public;
grant usage on schema social_private to anon;
grant execute on function social_private.stage_roster(uuid,jsonb) to anon,authenticated;
create function public.stage_shared_roster(p_room_id uuid,p_army jsonb) returns void
 language sql security invoker set search_path='' as $$ select social_private.stage_roster(p_room_id,p_army) $$;
revoke all on function public.stage_shared_roster(uuid,jsonb) from public;
grant execute on function public.stage_shared_roster(uuid,jsonb) to anon,authenticated;

create function social_private.guard_seat_roster() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.shared_rooms;
begin
 select * into r from public.shared_rooms where id=new.room_id for update;
 if r.started_at is null and r.status<>'active' then raise exception 'Lobby closed' using errcode='23514'; end if;
 if not exists(select 1 from jsonb_array_elements(r.session_snapshot#>'{setup,players}') p where p->>'id'=new.player_id) then raise exception 'Unknown player seat' using errcode='23514'; end if;
 if tg_op='UPDATE' then
   if new.room_id<>old.room_id or new.player_id<>old.player_id then raise exception 'Seat identity is immutable' using errcode='23514'; end if;
   if new.client_id<>old.client_id then
     delete from public.shared_rosters where room_id=new.room_id and player_id=new.player_id;
     new.is_ready:=false;
   end if;
 end if;
 if r.bring_your_army and r.started_at is null and new.is_ready and not exists(select 1 from public.shared_rosters where room_id=new.room_id and player_id=new.player_id and client_id=new.client_id) then raise exception 'Choose an army before Ready' using errcode='23514'; end if;
 return new;
end $$;
revoke all on function social_private.guard_seat_roster() from public,anon,authenticated;
create trigger guard_seat_roster before insert or update on public.shared_participants for each row execute function social_private.guard_seat_roster();

create function social_private.freeze_lobby_rosters() returns trigger language plpgsql security definer set search_path='' as $$
declare player_entry jsonb; roster jsonb; players jsonb:='[]'; armies jsonb:='{}'; key text; forces jsonb:='[]'; f jsonb; w jsonb;
begin
 if tg_op='INSERT' then
   if new.bring_your_army and new.started_at is not null then raise exception 'Create a waiting lobby first' using errcode='23514'; end if;
   return new;
 end if;
 if new.bring_your_army<>old.bring_your_army then raise exception 'Lobby protocol is immutable' using errcode='23514'; end if;
 if old.bring_your_army and new.session_snapshot is distinct from old.session_snapshot then raise exception 'Lobby snapshot is server managed' using errcode='23514'; end if;
 if old.started_at is not null and new.started_at is distinct from old.started_at then raise exception 'Battle start is immutable' using errcode='23514'; end if;
 if old.bring_your_army and old.started_at is null and new.started_at is not null then
   if old.status<>'active' then raise exception 'Lobby closed' using errcode='23514'; end if;
   for player_entry in select * from jsonb_array_elements(old.session_snapshot#>'{setup,players}') loop
     select s.army_data into roster from public.shared_rosters s join public.shared_participants m on m.room_id=s.room_id and m.player_id=s.player_id and m.client_id=s.client_id
      where s.room_id=old.id and s.player_id=player_entry->>'id' and m.is_ready and m.last_seen_at>now()-interval '20 seconds';
     if roster is null then raise exception 'Every seat needs an army, readiness and a live connection' using errcode='23514'; end if;
     -- Seat namespaces avoid ID collisions when the same imported list is used twice.
     key := 'seat:'||(player_entry->>'id'); roster:=jsonb_set(roster,'{id}',to_jsonb(key));
     players:=players||jsonb_build_array(player_entry||jsonb_build_object('armyId',key,'faction',roster->>'faction'));
     armies:=armies||jsonb_build_object(key,roster);
   end loop;
   new.session_snapshot:=jsonb_set(jsonb_set(old.session_snapshot,'{setup,players}',players),'{setup,armies}',armies);
   if old.session_snapshot#>'{setup,doubles}' is not null and old.session_snapshot#>'{setup,doubles}'<>'null'::jsonb then
     for f in select * from jsonb_array_elements(old.session_snapshot#>'{setup,doubles,forces}') loop
       -- Preserve the selected team Warlord if still available; otherwise use a
       -- Warlord/CHARACTER in the staged team. Never retain a stale unit reference.
       select jsonb_build_object('playerId',p->>'id','unitId',u->>'id') into w
       from jsonb_array_elements(players) p cross join lateral jsonb_array_elements(armies->('seat:'||(p->>'id'))->'units') u
       where (f->'memberPlayerIds') ? (p->>'id') and ((u->>'isWarlord')::boolean or exists(select 1 from jsonb_array_elements_text(coalesce(u->'keywords','[]')||coalesce(u->'categories','[]')) k where upper(k)='CHARACTER'))
       order by ((f#>>'{warlord,playerId}')=p->>'id' and (f#>>'{warlord,unitId}')=u->>'id') desc, (u->>'isWarlord')::boolean desc, p->>'id',u->>'id' limit 1;
       if w is null then raise exception 'Each team needs a Warlord or CHARACTER' using errcode='23514'; end if;
       forces:=forces||jsonb_build_array(jsonb_set(f,'{warlord}',w));
     end loop;
     new.session_snapshot:=jsonb_set(new.session_snapshot,'{setup,doubles,forces}',forces);
   end if;
 end if;
 return new;
end $$;
revoke all on function social_private.freeze_lobby_rosters() from public,anon,authenticated;
-- Runs before enforce_shared_lobby_start; retain its 2/3/4-seat validation.
create trigger a_freeze_lobby_rosters before insert or update on public.shared_rooms for each row execute function social_private.freeze_lobby_rosters();

-- No canonical battle events may be published against a provisional BYA setup.
create function social_private.guard_staged_events() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.shared_rooms where id=new.room_id and bring_your_army and started_at is null) then
   raise exception 'Start the lobby before publishing battle events' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function social_private.guard_staged_events() from public,anon,authenticated;
create trigger guard_staged_events before insert on public.shared_events for each row execute function social_private.guard_staged_events();

-- Version 7 gates all social/BYA dependencies before entering these flows.
create or replace function public.shared_schema_version() returns integer
 language sql stable security invoker set search_path='' as $$ select 7 $$;
revoke all on function public.shared_schema_version() from public;
grant execute on function public.shared_schema_version() to anon, authenticated;

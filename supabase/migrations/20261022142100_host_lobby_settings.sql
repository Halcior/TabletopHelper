-- Host-only lobby topology; these rows are provisional until Start.
-- Keep the existing shared_rooms.session_snapshot immutable to clients.
create table social_private.host_lobby_settings(
 room_id uuid primary key references public.shared_rooms(id) on delete cascade,
 turn_order text[] not null,
 team_alpha text[] not null default '{}',
 updated_at timestamptz not null default now()
);
revoke all on social_private.host_lobby_settings from public,anon,authenticated;

create function social_private.host_lobby_configuration(p_room_id uuid,p_turn_order text[],p_team_alpha text[])
returns void language plpgsql security definer set search_path='' as $$
declare r public.shared_rooms; players text[]; host public.shared_participants;
  proof text:=coalesce(current_setting('request.headers',true)::jsonb->>'x-seat-credential','');
  default_a text; default_b text;
begin
 select * into r from public.shared_rooms
  where id=p_room_id and code=public.request_shared_room_code() for update;
 if r.id is null or r.started_at is not null or r.status<>'active'
  or not r.bring_your_army or r.host_client_id<>public.request_shared_client_id() then
  raise exception 'Host waiting lobby required' using errcode='42501';
 end if;
 select * into host from public.shared_participants
  where room_id=p_room_id and client_id=r.host_client_id and is_host for update;
 if host.id is null or not exists(select 1 from social_private.seat_credentials c
    where c.participant_id=host.id and c.token_hash=md5(proof))
 then raise exception 'Private host seat credential required' using errcode='42501'; end if;
 select array_agg(p->>'id' order by p->>'id') into players
 from jsonb_array_elements(r.session_snapshot#>'{setup,players}') p;
 if array_length(p_turn_order,1) is distinct from case when r.session_snapshot#>'{setup,doubles}' is null then array_length(players,1) else 2 end
  or (select count(distinct x) from unnest(p_turn_order)x)<>array_length(p_turn_order,1)
 then raise exception 'Invalid turn order' using errcode='22023'; end if;
 if r.session_snapshot#>'{setup,doubles}' is not null then
  default_a:=r.session_snapshot#>>'{setup,doubles,forces,0,captainPlayerId}';
  default_b:=r.session_snapshot#>>'{setup,doubles,forces,1,captainPlayerId}';
  if p_turn_order<>array[default_a,default_b] and p_turn_order<>array[default_b,default_a] then
   raise exception 'Doubles turns must include both team captains' using errcode='22023'; end if;
  if array_length(p_team_alpha,1)<>2 or not p_team_alpha@>array[default_a]
    or p_team_alpha@>array[default_b] or
    (select count(distinct x) from unnest(p_team_alpha)x)<>2
    or not (p_team_alpha<@players) then
    raise exception 'Team Alpha must contain its captain and one other commander' using errcode='22023';
  end if;
 else
  if p_turn_order<@players is not true or players<@p_turn_order is not true
    or coalesce(array_length(p_team_alpha,1),0)<>0 then
    raise exception 'Invalid player turn order' using errcode='22023'; end if;
 end if;
 insert into social_private.host_lobby_settings(room_id,turn_order,team_alpha)
  values(p_room_id,p_turn_order,coalesce(p_team_alpha,'{}'))
  on conflict(room_id) do update set turn_order=excluded.turn_order,
   team_alpha=excluded.team_alpha,updated_at=now();
 -- Avoid stale Ready after a team/turn change.
 update public.shared_participants set is_ready=false where room_id=p_room_id;
end $$;
revoke all on function social_private.host_lobby_configuration(uuid,text[],text[]) from public,anon;
grant execute on function social_private.host_lobby_configuration(uuid,text[],text[]) to anon,authenticated;
create function public.set_host_lobby_settings(p_room_id uuid,p_turn_order text[],p_team_alpha text[] default '{}')
returns void language sql security invoker set search_path='' as $$
 select social_private.host_lobby_configuration(p_room_id,p_turn_order,p_team_alpha)
$$;
revoke all on function public.set_host_lobby_settings(uuid,text[],text[]) from public;
grant execute on function public.set_host_lobby_settings(uuid,text[],text[]) to anon,authenticated;

create function social_private.read_host_lobby_configuration(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.shared_rooms; options social_private.host_lobby_settings;
begin
 select * into r from public.shared_rooms where id=p_room_id and code=public.request_shared_room_code();
 if r.id is null then raise exception 'Room not found' using errcode='42501'; end if;
 select * into options from social_private.host_lobby_settings where room_id=p_room_id;
 return jsonb_build_object(
  'turnOrder',coalesce(to_jsonb(options.turn_order),r.session_snapshot#>'{setup,turnOrder}'),
  'teamAlpha',coalesce(to_jsonb(options.team_alpha),r.session_snapshot#>'{setup,doubles,forces,0,memberPlayerIds}','[]'::jsonb)
 );
end $$;
revoke all on function social_private.read_host_lobby_configuration(uuid) from public,anon;
grant execute on function social_private.read_host_lobby_configuration(uuid) to anon,authenticated;
create function public.get_host_lobby_settings(p_room_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select social_private.read_host_lobby_configuration(p_room_id)
$$;
revoke all on function public.get_host_lobby_settings(uuid) from public;
grant execute on function public.get_host_lobby_settings(uuid) to anon,authenticated;

-- Runs after the existing roster and disposition freeze triggers. It is only
-- active when an unstarted Bring Your Army room transitions to started.
create function social_private.freeze_host_lobby_configuration() returns trigger
language plpgsql security definer set search_path='' as $$
declare opt social_private.host_lobby_settings; pid text; pos integer; zone text;
  p jsonb; players jsonb:='[]'; state_players jsonb; conf jsonb; force jsonb;
  forces jsonb:='[]'; members jsonb; w jsonb; captain text; a text[];
begin
 if old.started_at is not null or new.started_at is null or not old.bring_your_army then return new; end if;
 select * into opt from social_private.host_lobby_settings where room_id=new.id;
 if opt.room_id is null then return new; end if;
 state_players:=new.session_snapshot#>'{state,players}';
 conf:=new.session_snapshot#>'{setup,rulesetConfig,playerConfigs}';
 for p in select value from jsonb_array_elements(new.session_snapshot#>'{setup,players}') loop
  pid:=p->>'id';
  if new.session_snapshot#>'{setup,doubles}' is null then
   pos:=array_position(opt.turn_order,pid);
   zone:=chr(64+pos);
  else
   pos:=case when opt.turn_order[1]=new.session_snapshot#>>'{setup,doubles,forces,0,captainPlayerId}'
    then case when pid=any(opt.team_alpha) then 1 else 2 end
    else case when pid=any(opt.team_alpha) then 2 else 1 end end;
   zone:=case when pid=any(opt.team_alpha) then 'A' else 'B' end;
  end if;
  players:=players||jsonb_build_array(p||jsonb_build_object('deploymentZone',zone,'turnPosition',pos));
  state_players:=jsonb_set(state_players,array[pid,'deploymentZone'],to_jsonb(zone),true);
  state_players:=jsonb_set(state_players,array[pid,'turnPosition'],to_jsonb(pos),true);
  conf:=jsonb_set(conf,array[pid,'deploymentZone'],to_jsonb(zone),true);
  conf:=jsonb_set(conf,array[pid,'turnPosition'],to_jsonb(pos),true);
 end loop;
 new.session_snapshot:=jsonb_set(new.session_snapshot,'{setup,players}',players);
 new.session_snapshot:=jsonb_set(new.session_snapshot,'{setup,rulesetConfig,playerConfigs}',conf);
 new.session_snapshot:=jsonb_set(new.session_snapshot,'{state,players}',state_players);
 new.session_snapshot:=jsonb_set(new.session_snapshot,'{setup,turnOrder}',to_jsonb(opt.turn_order));
 new.session_snapshot:=jsonb_set(new.session_snapshot,'{state,turnOrder}',to_jsonb(opt.turn_order));
 new.session_snapshot:=jsonb_set(new.session_snapshot,'{state,activePlayerId}',to_jsonb(opt.turn_order[1]));
 if new.session_snapshot#>'{setup,doubles}' is not null then
  for force in select value from jsonb_array_elements(new.session_snapshot#>'{setup,doubles,forces}') loop
   captain:=force->>'captainPlayerId';
   if (force->>'id')=new.session_snapshot#>>'{setup,doubles,forces,0,id}' then
    a:=opt.team_alpha;
   else
    select array_agg(p->>'id') into a from jsonb_array_elements(players)p
      where not (p->>'id'=any(opt.team_alpha));
   end if;
   members:=to_jsonb(a);
   select jsonb_build_object('playerId',p->>'id','unitId',u->>'id') into w
    from jsonb_array_elements(players)p
    cross join lateral jsonb_array_elements(new.session_snapshot#>'{setup,armies}'->('seat:'||(p->>'id'))->'units')u
    where members ? (p->>'id')
      and (coalesce((u->>'isWarlord')::boolean,false)
       or exists(select 1 from jsonb_array_elements_text(
         coalesce(u->'keywords','[]'::jsonb)||coalesce(u->'categories','[]'::jsonb))k where upper(k)='CHARACTER'))
    order by coalesce((u->>'isWarlord')::boolean,false) desc limit 1;
   if w is null then raise exception 'Each assigned team needs a CHARACTER Warlord' using errcode='23514'; end if;
   forces:=forces||jsonb_build_array(force||jsonb_build_object('memberPlayerIds',members,'warlord',w));
  end loop;
  new.session_snapshot:=jsonb_set(new.session_snapshot,'{setup,doubles,forces}',forces);
 end if;
 return new;
end $$;
revoke all on function social_private.freeze_host_lobby_configuration() from public,anon,authenticated;
create trigger zz_freeze_host_lobby_configuration before update on public.shared_rooms
 for each row execute function social_private.freeze_host_lobby_configuration();

create or replace function public.shared_schema_version() returns integer
 language sql stable security invoker set search_path='' as $$select 9$$;

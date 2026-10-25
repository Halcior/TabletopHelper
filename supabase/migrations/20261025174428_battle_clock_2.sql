-- Existing transports already submit a high-entropy proof on seat claims.
-- Also capture it in new legacy waiting rooms, without breaking old clients
-- which never enable a clock and send no proof there.
create or replace function social_private.capture_seat_credential() returns trigger
language plpgsql security definer set search_path='' as $$
declare proof text; existing text; bya boolean;
begin
 select room.bring_your_army into bya from public.shared_rooms room where room.id=new.room_id and room.started_at is null;
 if not found then return new; end if;
 proof:=coalesce(current_setting('request.headers',true)::jsonb->>'x-seat-credential','');
 if proof !~ '^[0-9a-f]{64}$' then
  if not bya then return new; end if;
  raise exception 'A private seat credential is required' using errcode='42501';
 end if;
 select token_hash into existing from social_private.seat_credentials where participant_id=new.id;
 if tg_op='UPDATE' and old.client_id is not distinct from new.client_id and existing is not null then
  if existing<>md5(proof) then raise exception 'Seat credential does not match' using errcode='42501'; end if;
 else
  insert into social_private.seat_credentials(participant_id,client_id,token_hash)
   values(new.id,new.client_id,md5(proof))
   on conflict(participant_id) do update set client_id=excluded.client_id,token_hash=excluded.token_hash;
 end if;
 return new;
end $$;

-- Battle Clock 2.0: one durable anchor, server timestamps and compare-and-swap.
-- Private storage is deliberately outside the Data API. Public wrappers are
-- SECURITY INVOKER; the private implementation validates room AND seat proof.
create table social_private.battle_clocks (
 room_id uuid primary key references public.shared_rooms(id) on delete cascade,
 config jsonb not null default '{"preset":"off","limitMs":0}'::jsonb,
 clock_state jsonb
);
alter table social_private.battle_clocks enable row level security;
revoke all on social_private.battle_clocks from public,anon,authenticated;

create function social_private.clock_settle(s jsonb, t bigint) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare elapsed bigint; b jsonb; budgets jsonb:='[]'; r text;
begin
 if s is null then return null; end if;
 elapsed:=case when (s->>'running')::boolean and s->>'endedAt' is null
  then greatest(0,t-(s->>'anchorAt')::bigint) else 0 end;
 r:=s->>'round';
 for b in select value from jsonb_array_elements(s->'budgets') loop
  if b->>'id'=s->>'activeBudgetId' and elapsed>0 then
   b:=jsonb_set(b,'{usedMs}',to_jsonb((b->>'usedMs')::bigint+elapsed));
   b:=jsonb_set(b,array['rounds',r],to_jsonb(coalesce((b->'rounds'->>r)::bigint,0)+elapsed),true);
  end if;
  budgets:=budgets||jsonb_build_array(b);
 end loop;
 return s||jsonb_build_object('budgets',budgets,'anchorAt',greatest(t,(s->>'anchorAt')::bigint));
end $$;
revoke all on function social_private.clock_settle(jsonb,bigint) from public,anon,authenticated;

create function social_private.clock_initial(snapshot jsonb,cfg jsonb,t bigint) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare b jsonb; groups jsonb:='[]'; first_id text; first_player text:=snapshot#>>'{setup,turnOrder,0}';
begin
 if cfg->>'preset'='off' then return null; end if;
 if snapshot#>'{setup,doubles}' is not null then
  for b in select value from jsonb_array_elements(snapshot#>'{setup,doubles,forces}') loop
   groups:=groups||jsonb_build_array(jsonb_build_object('id',b->>'id','name',b->>'name','playerIds',b->'memberPlayerIds','usedMs',0,'rounds','{}'::jsonb,'manualPasses',0));
   if b->'memberPlayerIds' ? first_player then first_id:=b->>'id'; end if;
  end loop;
 else
  for b in select value from jsonb_array_elements(snapshot#>'{setup,players}') loop
   groups:=groups||jsonb_build_array(jsonb_build_object('id',b->>'id','name',b->>'name','playerIds',jsonb_build_array(b->>'id'),'usedMs',0,'rounds','{}'::jsonb,'manualPasses',0));
  end loop;
  first_id:=first_player;
 end if;
 return jsonb_build_object('version',1,'revision',0,'config',cfg,'budgets',groups,
  'activeBudgetId',first_id,'turnBudgetId',first_id,'round',1,'running',false,
  'anchorAt',t,'startedAt',null,'endedAt',null);
end $$;
revoke all on function social_private.clock_initial(jsonb,jsonb,bigint) from public,anon,authenticated;

create function social_private.battle_clock_action(p_room_id uuid,p_command text,p_revision bigint,p_target text,p_config jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.shared_rooms; seat public.shared_participants; c social_private.battle_clocks;
 proof text:=coalesce(current_setting('request.headers',true)::jsonb->>'x-seat-credential','');
 cfg jsonb; s jsonb; b jsonb; budgets jsonb:='[]'; t bigint; applied boolean:=true; preset text; limit_ms numeric;
begin
 -- Serialize mutations with room Start and its freeze triggers. Reads never lock.
 if p_command='read' then
  select * into r from public.shared_rooms where id=p_room_id and code=public.request_shared_room_code();
 else
  select * into r from public.shared_rooms where id=p_room_id and code=public.request_shared_room_code() for no key update;
 end if;
 if r.id is null then raise exception 'Room not found' using errcode='42501'; end if;
 select * into seat from public.shared_participants p where p.room_id=r.id and p.client_id=public.request_shared_client_id();
 select * into c from social_private.battle_clocks where room_id=r.id;
 cfg:=coalesce(c.config,'{"preset":"off","limitMs":0}'::jsonb);
 -- Old, clock-disabled rooms have no seat proof. Preserve their existing flow.
 if p_command='read' and c.clock_state is null and cfg->>'preset'='off' then
  return jsonb_build_object('config',cfg,'clock',null,'serverNow',floor(extract(epoch from clock_timestamp())*1000)::bigint,'applied',true);
 end if;
 if seat.id is null or not exists(select 1 from social_private.seat_credentials x
   where x.participant_id=seat.id and x.client_id=seat.client_id and x.token_hash=md5(proof))
 then raise exception 'Private player seat credential required' using errcode='42501'; end if;
 if p_command='configure' then
  if r.started_at is not null or r.status<>'active' or not seat.is_host or r.host_client_id<>seat.client_id then
   raise exception 'Only the host can configure a waiting room clock' using errcode='42501'; end if;
  preset:=p_config->>'preset';
  if preset is null or preset not in ('off','casual','competitive','custom') or jsonb_typeof(p_config->'limitMs') is distinct from 'number' then
   raise exception 'Invalid clock config' using errcode='22023'; end if;
  limit_ms:=(p_config->>'limitMs')::numeric;
  if preset='off' then limit_ms:=0;
  elsif preset='casual' then limit_ms:=7200000;
  elsif preset='competitive' then limit_ms:=5400000;
  elsif limit_ms<1000 or limit_ms>604800000 or trunc(limit_ms)<>limit_ms then
   raise exception 'Clock limit must be 1 second to 7 days' using errcode='22023'; end if;
  cfg:=jsonb_build_object('preset',preset,'limitMs',limit_ms);
  insert into social_private.battle_clocks(room_id,config) values(r.id,cfg)
   on conflict(room_id) do update set config=excluded.config;
  update public.shared_participants set is_ready=false where room_id=r.id;
 elsif p_command<>'read' then
  if p_command not in ('pass','pause','resume') then raise exception 'Invalid clock command' using errcode='22023'; end if;
  if r.started_at is null or r.status<>'active' or c.clock_state is null then
   raise exception 'Active Battle Clock required' using errcode='22023'; end if;
  select * into c from social_private.battle_clocks where room_id=r.id for update;
  s:=c.clock_state;
  if p_revision is null or p_revision<>(s->>'revision')::bigint or s->>'endedAt' is not null then applied:=false;
  elsif p_command='pass' and (p_target is null or p_target=s->>'activeBudgetId' or not exists(select 1 from jsonb_array_elements(s->'budgets') x where x->>'id'=p_target)) then applied:=false;
  elsif p_command='pause' and not (s->>'running')::boolean or p_command='resume' and (s->>'running')::boolean then applied:=false;
  else
   -- Timestamp AFTER acquiring locks; lock waits never create device-clock drift.
   t:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
   s:=social_private.clock_settle(s,t);
   if p_command='pass' then
    for b in select value from jsonb_array_elements(s->'budgets') loop
     if b->>'id'=s->>'activeBudgetId' then b:=jsonb_set(b,'{manualPasses}',to_jsonb((b->>'manualPasses')::bigint+1)); end if;
     budgets:=budgets||jsonb_build_array(b);
    end loop;
    s:=s||jsonb_build_object('activeBudgetId',p_target,'budgets',budgets);
   else
    s:=s||jsonb_build_object('running',p_command='resume');
    if p_command='resume' and s->>'startedAt' is null then s:=s||jsonb_build_object('startedAt',t); end if;
   end if;
   s:=s||jsonb_build_object('revision',(s->>'revision')::bigint+1);
   update social_private.battle_clocks set clock_state=s where room_id=r.id;
  end if;
 end if;
 select * into c from social_private.battle_clocks where room_id=r.id;
 return jsonb_build_object('config',coalesce(c.config,cfg),'clock',c.clock_state,
  'serverNow',floor(extract(epoch from clock_timestamp())*1000)::bigint,'applied',applied);
end $$;
revoke all on function social_private.battle_clock_action(uuid,text,bigint,text,jsonb) from public;
grant execute on function social_private.battle_clock_action(uuid,text,bigint,text,jsonb) to anon,authenticated;
create function public.battle_clock_action(p_room_id uuid,p_command text default 'read',p_revision bigint default null,p_target text default null,p_config jsonb default null)
returns jsonb language sql security invoker set search_path='' as $$
 select social_private.battle_clock_action(p_room_id,p_command,p_revision,p_target,p_config)
$$;
revoke all on function public.battle_clock_action(uuid,text,bigint,text,jsonb) from public;
grant execute on function public.battle_clock_action(uuid,text,bigint,text,jsonb) to anon,authenticated;

-- Follow actual persisted turn events, never a second system of turns. Ignored
-- duplicate event inserts cannot fire AFTER INSERT, so elapsed time isn't doubled.
create function social_private.clock_follow_battle() returns trigger
language plpgsql security definer set search_path='' as $$
declare c social_private.battle_clocks; s jsonb; kind text:=new.event_payload->>'type';
 t bigint; target_id text; b jsonb; seat_id uuid;
 proof text:=coalesce(current_setting('request.headers',true)::jsonb->>'x-seat-credential','');
begin
 if kind not in ('TURN_STARTED','ROUND_STARTED','GAME_ENDED','GAME_ABANDONED') then return new; end if;
 if not exists(select 1 from social_private.battle_clocks where room_id=new.room_id and clock_state is not null) then return new; end if;
 -- Same lock order as clock RPC and Start (room, then clock).
 perform 1 from public.shared_rooms where id=new.room_id for no key update;
 select * into c from social_private.battle_clocks where room_id=new.room_id for update;
 s:=c.clock_state;
 if s is null or s->>'endedAt' is not null then return new; end if;
 select p.id into seat_id from public.shared_participants p join social_private.seat_credentials x on x.participant_id=p.id
  where p.room_id=new.room_id and p.client_id=public.request_shared_client_id()
   and p.player_id=new.actor_player_id and x.client_id=p.client_id and x.token_hash=md5(proof);
 if seat_id is null then raise exception 'Private player seat credential required for clock turn sync' using errcode='42501'; end if;
 t:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
 if kind='TURN_STARTED' then
  select x->>'id' into target_id from jsonb_array_elements(s->'budgets')x where x->'playerIds' ? (new.event_payload#>>'{payload,playerId}');
  if target_id is null then raise exception 'Invalid clock player' using errcode='22023'; end if;
  if target_id=s->>'turnBudgetId' then return new; end if;
  s:=social_private.clock_settle(s,t)||jsonb_build_object('turnBudgetId',target_id,'activeBudgetId',target_id);
 elsif kind='ROUND_STARTED' then
  if (new.event_payload#>>'{payload,round}')::int=(s->>'round')::int then return new; end if;
  s:=social_private.clock_settle(s,t)||jsonb_build_object('round',(new.event_payload#>>'{payload,round}')::int);
 else
  s:=social_private.clock_settle(s,t)||jsonb_build_object('running',false,'endedAt',t);
 end if;
 s:=s||jsonb_build_object('revision',(s->>'revision')::bigint+1);
 update social_private.battle_clocks set clock_state=s where room_id=new.room_id;
 return new;
end $$;
revoke all on function social_private.clock_follow_battle() from public,anon,authenticated;
create trigger battle_clock_follow_events after insert on public.shared_events for each row execute function social_private.clock_follow_battle();

create function social_private.clock_room_lifecycle() returns trigger
language plpgsql security definer set search_path='' as $$
declare c social_private.battle_clocks; t bigint;
begin
 if old.started_at is not distinct from new.started_at and old.status=new.status then return new; end if;
 select * into c from social_private.battle_clocks where room_id=new.id for update;
 if c.room_id is null then return new; end if;
 t:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
 if old.started_at is null and new.started_at is not null then
  update social_private.battle_clocks set clock_state=social_private.clock_initial(new.session_snapshot,c.config,t) where room_id=new.id;
 elsif new.status<>'active' and c.clock_state is not null and c.clock_state->>'endedAt' is null then
  update social_private.battle_clocks set clock_state=social_private.clock_settle(c.clock_state,t)||jsonb_build_object('running',false,'endedAt',t,'revision',(c.clock_state->>'revision')::bigint+1) where room_id=new.id;
 end if;
 return new;
end $$;
revoke all on function social_private.clock_room_lifecycle() from public,anon,authenticated;
create trigger battle_clock_room_lifecycle after update on public.shared_rooms for each row execute function social_private.clock_room_lifecycle();

create or replace function public.shared_schema_version() returns integer
 language sql stable security invoker set search_path='' as $$select 10$$;

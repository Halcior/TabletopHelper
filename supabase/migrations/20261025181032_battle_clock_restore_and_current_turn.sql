-- Roll forward Battle Clock seat recovery and sharing an in-progress battle.
-- Existing participant UPDATE RLS still decides whether a stale guest seat can
-- be reclaimed. Rotate its private proof after that authorized claim, including
-- after Start; preserve a same-client proof instead of allowing replacement.
create or replace function social_private.capture_seat_credential() returns trigger
language plpgsql security definer set search_path='' as $$
declare proof text; existing text; bya boolean;
begin
 select room.bring_your_army into bya from public.shared_rooms room where room.id=new.room_id;
 if not found then return new; end if;
 proof:=coalesce(current_setting('request.headers',true)::jsonb->>'x-seat-credential','');
 if proof !~ '^[0-9a-f]{64}$' then
  if not bya and not exists(select 1 from social_private.battle_clocks c where c.room_id=new.room_id and c.config->>'preset'<>'off') then return new; end if;
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

-- Legacy sharing preserves the active player and round in its snapshot.
-- Fresh BYA lobbies already freeze these fields to the selected first turn.
create or replace function social_private.clock_initial(snapshot jsonb,cfg jsonb,t bigint) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare b jsonb; groups jsonb:='[]'; first_id text; first_player text:=coalesce(snapshot#>>'{state,activePlayerId}',snapshot#>>'{setup,turnOrder,0}');
 starting_round integer:=greatest(1,coalesce((snapshot#>>'{state,round}')::integer,1));
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
  'activeBudgetId',first_id,'turnBudgetId',first_id,'round',starting_round,'running',false,
  'anchorAt',t,'startedAt',null,'endedAt',null);
end $$;
revoke all on function social_private.clock_initial(jsonb,jsonb,bigint) from public,anon,authenticated;

create or replace function public.shared_schema_version() returns integer
 language sql stable security invoker set search_path='' as $$select 11$$;

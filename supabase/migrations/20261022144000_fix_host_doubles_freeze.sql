-- Correct ambiguous PL/pgSQL variable in Doubles Warlord freeze.
-- Replaces the function only; existing rooms and private host settings remain.
create or replace function social_private.freeze_host_lobby_configuration() returns trigger
language plpgsql security definer set search_path='' as $$
declare opt social_private.host_lobby_settings; pid text; pos integer; zone text;
  player_entry jsonb; players jsonb:='[]'; state_players jsonb; conf jsonb; force jsonb; evt jsonb; evts jsonb:='[]'::jsonb;
  forces jsonb:='[]'; members jsonb; w jsonb; captain text; a text[];
begin
 if old.started_at is not null or new.started_at is null or not old.bring_your_army then return new; end if;
 select * into opt from social_private.host_lobby_settings where room_id=new.id;
 if opt.room_id is null then return new; end if;
 state_players:=coalesce(new.session_snapshot#>'{state,players}','{}'::jsonb);
 conf:=new.session_snapshot#>'{setup,rulesetConfig,playerConfigs}';
 for player_entry in select value from jsonb_array_elements(new.session_snapshot#>'{setup,players}') loop
  pid:=player_entry->>'id';
  if new.session_snapshot#>'{setup,doubles}' is null then
   pos:=array_position(opt.turn_order,pid);
   zone:=chr(64+pos);
  else
   pos:=case when opt.turn_order[1]=new.session_snapshot#>>'{setup,doubles,forces,0,captainPlayerId}'
    then case when pid=any(opt.team_alpha) then 1 else 2 end
    else case when pid=any(opt.team_alpha) then 2 else 1 end end;
   zone:=case when pid=any(opt.team_alpha) then 'A' else 'B' end;
  end if;
  players:=players||jsonb_build_array(player_entry||jsonb_build_object('deploymentZone',zone,'turnPosition',pos));
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
 -- Rehydration projects state from events, not the serialized state fields.
 -- Rewrite the initial TURN_STARTED and corresponding tactical snapshot so
 -- all devices start on the host-selected commander after reconnect.
 for evt in select value from jsonb_array_elements(coalesce(new.session_snapshot#>'{state,events}','[]'::jsonb)) loop
  if evt->>'type'='TURN_STARTED' then
   evt:=jsonb_set(evt,'{payload,playerId}',to_jsonb(opt.turn_order[1]),true);
  elsif evt->>'type'='RULESET_EVENT' and evt#>>'{payload,action}'='TURN_SNAPSHOT_CAPTURED' then
   evt:=jsonb_set(evt,'{payload,data,playerId}',to_jsonb(opt.turn_order[1]),true);
  end if;
  evts:=evts||jsonb_build_array(evt);
 end loop;
 new.session_snapshot:=jsonb_set(new.session_snapshot,'{state,events}',evts);
 if new.session_snapshot#>'{setup,doubles}' is not null then
  for force in select value from jsonb_array_elements(new.session_snapshot#>'{setup,doubles,forces}') loop
   captain:=force->>'captainPlayerId';
   if (force->>'id')=new.session_snapshot#>>'{setup,doubles,forces,0,id}' then
    a:=opt.team_alpha;
   else
    select array_agg(remaining.value->>'id') into a from jsonb_array_elements(players) AS remaining(value)
      where not (remaining.value->>'id'=any(opt.team_alpha));
   end if;
   members:=to_jsonb(a);
   select jsonb_build_object('playerId',seat_player.value->>'id','unitId',u.value->>'id') into w
    from jsonb_array_elements(players) AS seat_player(value)
    cross join lateral jsonb_array_elements(new.session_snapshot#>'{setup,armies}'->('seat:'||(seat_player.value->>'id'))->'units') AS u(value)
    where members ? (seat_player.value->>'id')
      and (coalesce((u.value->>'isWarlord')::boolean,false)
       or exists(select 1 from jsonb_array_elements_text(
         coalesce(u.value->'keywords','[]'::jsonb)||coalesce(u.value->'categories','[]'::jsonb))k where upper(k)='CHARACTER'))
    order by coalesce((u.value->>'isWarlord')::boolean,false) desc limit 1;
   if w is null then raise exception 'Each assigned team needs a CHARACTER Warlord' using errcode='23514'; end if;
   forces:=forces||jsonb_build_array(force||jsonb_build_object('memberPlayerIds',members,'warlord',w));
  end loop;
  new.session_snapshot:=jsonb_set(new.session_snapshot,'{setup,doubles,forces}',forces);
 end if;
 return new;
end $$;

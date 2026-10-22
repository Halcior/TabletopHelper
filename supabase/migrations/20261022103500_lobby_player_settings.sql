-- Online player identity + own Force Disposition, applied only to new Bring Your Army rooms.
-- Existing battles, local mode, and legacy shared rooms are unchanged.
alter table public.shared_participants
 add column force_disposition text
 check(force_disposition is null or force_disposition in ('take-and-hold','purge-the-foe','reconnaissance','priority-assets','disruption'));

-- Changing the claimed client ID cannot inherit another person's settings.
create function social_private.reset_seat_settings() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.client_id is distinct from new.client_id then
   new.force_disposition := null;
 end if;
 return new;
end $$;
revoke all on function social_private.reset_seat_settings() from public,anon,authenticated;
create trigger a_reset_seat_settings before update on public.shared_participants
 for each row execute function social_private.reset_seat_settings();

-- A real seat capability, not a guessed player ID, is the authorization factor.
-- Profile names always come from player_profiles, never from request JSON.
create function social_private.set_seat_settings(p_room_id uuid, p_force_disposition text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.shared_rooms; seat public.shared_participants; profile_name text; deck text; doubles boolean; captain boolean; chosen text;
begin
 select * into r from public.shared_rooms
  where id=p_room_id and code=public.request_shared_room_code() for update;
 if r.id is null or not r.bring_your_army or r.started_at is not null or r.status<>'active' then
   raise exception 'Waiting lobby unavailable' using errcode='42501';
 end if;
 select * into seat from public.shared_participants
  where room_id=p_room_id and client_id=public.request_shared_client_id()
    and client_id<>'' for update;
 if seat.id is null then raise exception 'Claim your player seat first' using errcode='42501'; end if;
 deck:=r.session_snapshot#>>'{setup,rulesetConfig,primaryDeck}';
 doubles:=r.session_snapshot#>'{setup,doubles}' is not null
   and r.session_snapshot#>'{setup,doubles}'<>'null'::jsonb;
 captain:=not doubles or exists(
   select 1 from jsonb_array_elements(r.session_snapshot#>'{setup,doubles,forces}') f
   where f->>'captainPlayerId'=seat.player_id
 );
 if p_force_disposition is not null then
   if deck<>'chapter-approved-duel' or not captain or p_force_disposition not in
     ('take-and-hold','purge-the-foe','reconnaissance','priority-assets','disruption') then
     raise exception 'Invalid Force Disposition for this seat' using errcode='22023';
   end if;
 end if;
 if auth.uid() is not null then
   insert into public.player_profiles(user_id,display_name) values(auth.uid(),'Commander') on conflict do nothing;
   select display_name into profile_name from public.player_profiles where user_id=auth.uid();
 end if;
 chosen:=coalesce(p_force_disposition,seat.force_disposition);
 update public.shared_participants
  set display_name=coalesce(profile_name,seat.display_name),
      force_disposition=chosen,
      is_ready=case when chosen is distinct from seat.force_disposition
        or coalesce(profile_name,seat.display_name) is distinct from seat.display_name then false else seat.is_ready end,
      last_seen_at=now()
  where id=seat.id;
end $$;
revoke all on function social_private.set_seat_settings(uuid,text) from public,anon;
grant execute on function social_private.set_seat_settings(uuid,text) to anon,authenticated;
create function public.set_shared_seat_settings(p_room_id uuid,p_force_disposition text default null) returns void
language sql security invoker set search_path='' as $$
 select social_private.set_seat_settings(p_room_id,p_force_disposition)
$$;
revoke all on function public.set_shared_seat_settings(uuid,text) from public;
grant execute on function public.set_shared_seat_settings(uuid,text) to anon,authenticated;

-- Server-side Ready guard. Team captains choose for their force in Doubles.
create function social_private.guard_disposition_ready() returns trigger
language plpgsql security definer set search_path='' as $$
declare r public.shared_rooms; doubles boolean; captain boolean;
begin
 if not new.is_ready then return new; end if;
 select * into r from public.shared_rooms where id=new.room_id;
 if not r.bring_your_army or r.started_at is not null
   or r.session_snapshot#>>'{setup,rulesetConfig,primaryDeck}'<>'chapter-approved-duel'
 then return new; end if;
 doubles:=r.session_snapshot#>'{setup,doubles}' is not null
   and r.session_snapshot#>'{setup,doubles}'<>'null'::jsonb;
 captain:=not doubles or exists(
   select 1 from jsonb_array_elements(r.session_snapshot#>'{setup,doubles,forces}') f
    where f->>'captainPlayerId'=new.player_id
 );
 if captain and new.force_disposition is null then
   raise exception 'Choose your Force Disposition before Ready' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function social_private.guard_disposition_ready() from public,anon,authenticated;
create trigger z_guard_disposition_ready before insert or update on public.shared_participants
 for each row execute function social_private.guard_disposition_ready();

-- The existing a_freeze_lobby_rosters trigger snapshots armies and Warlords.
-- This next trigger freezes seat-owned names and Force Dispositions, and runs
-- before the existing enforce_shared_lobby_start checks, by trigger name order.
create function social_private.freeze_seat_settings() returns trigger
language plpgsql security definer set search_path='' as $$
declare m public.shared_participants; player_entry jsonb; result_players jsonb:='[]'::jsonb;
 deck text; doubles boolean; chosen text; f jsonb; updated_forces jsonb:='[]'::jsonb;
 config jsonb; chosen_pair jsonb;
begin
 if tg_op='INSERT' or not old.bring_your_army or old.started_at is not null or new.started_at is null then return new; end if;
 deck:=new.session_snapshot#>>'{setup,rulesetConfig,primaryDeck}';
 doubles:=new.session_snapshot#>'{setup,doubles}' is not null
  and new.session_snapshot#>'{setup,doubles}'<>'null'::jsonb;
 config:=new.session_snapshot#>'{setup,rulesetConfig,playerConfigs}';
 for player_entry in select value from jsonb_array_elements(new.session_snapshot#>'{setup,players}') loop
   select * into m from public.shared_participants
    where room_id=new.id and player_id=player_entry->>'id';
   if m.id is null or trim(m.display_name)='' then
     raise exception 'All seats need a player identity' using errcode='23514';
   end if;
   result_players:=result_players||jsonb_build_array(jsonb_set(player_entry,'{name}',to_jsonb(m.display_name)));
   if deck='chapter-approved-duel' and not doubles then
     if m.force_disposition is null then raise exception 'Every player must choose Force Disposition' using errcode='23514'; end if;
     config:=jsonb_set(config,array[m.player_id,'forceDisposition'],to_jsonb(m.force_disposition),true);
   end if;
 end loop;
 new.session_snapshot:=jsonb_set(new.session_snapshot,'{setup,players}',result_players);
 if deck='chapter-approved-duel' then
   if doubles then
     for f in select value from jsonb_array_elements(new.session_snapshot#>'{setup,doubles,forces}') loop
       select force_disposition into chosen from public.shared_participants
        where room_id=new.id and player_id=f->>'captainPlayerId';
       if chosen is null then raise exception 'Both team captains must choose Force Disposition' using errcode='23514'; end if;
       config:=jsonb_set(config,array[f->>'captainPlayerId','forceDisposition'],to_jsonb(chosen),true);
       updated_forces:=updated_forces||jsonb_build_array(jsonb_set(f,'{forceDisposition}',to_jsonb(chosen)));
     end loop;
     new.session_snapshot:=jsonb_set(new.session_snapshot,'{setup,doubles,forces}',updated_forces);
   end if;
   new.session_snapshot:=jsonb_set(new.session_snapshot,'{setup,rulesetConfig,playerConfigs}',config);
 end if;
 return new;
end $$;
revoke all on function social_private.freeze_seat_settings() from public,anon,authenticated;
create trigger b_freeze_seat_settings before update on public.shared_rooms
 for each row execute function social_private.freeze_seat_settings();

create or replace function public.shared_schema_version() returns integer
 language sql stable security invoker set search_path='' as $$select 8$$;
revoke all on function public.shared_schema_version() from public;
grant execute on function public.shared_schema_version() to anon,authenticated;

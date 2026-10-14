-- Applied as migration 20261014121951 to linked Supabase project.
-- Backwards-compatible: 2/3 seats unchanged; 4 seats only for valid GW Doubles.
CREATE OR REPLACE FUNCTION public.enforce_shared_lobby_start()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  required_seats integer;
  ready_online_seats integer;
  member_seats integer;
  unique_member_seats integer;
  force_count integer;
  invalid_members integer;
begin
  if old.started_at is null and new.started_at is not null then
    if jsonb_typeof(new.session_snapshot #> '{setup,players}') <> 'array' then
      raise exception 'Shared battle must have a player array.' using errcode = '23514';
    end if;
    required_seats := jsonb_array_length(new.session_snapshot #> '{setup,players}');
    if required_seats = 4 then
      if new.session_snapshot #>> '{setup,doubles,rulesVersion}' is distinct from 'GW-Doubles-1.0'
        or jsonb_typeof(new.session_snapshot #> '{setup,doubles,forces}') is distinct from 'array'
        or jsonb_typeof(new.session_snapshot #> '{setup,turnOrder}') is distinct from 'array'
      then
        raise exception 'Four seats require valid GW Doubles v1.0 setup.'
          using errcode = '23514';
      end if;
      force_count := jsonb_array_length(new.session_snapshot #> '{setup,doubles,forces}');
      if force_count <> 2 or jsonb_array_length(new.session_snapshot #> '{setup,turnOrder}') <> 2 then
        raise exception 'Doubles requires two forces and two shared turns.'
          using errcode = '23514';
      end if;
      if exists (
        select 1 from jsonb_array_elements(new.session_snapshot #> '{setup,doubles,forces}') f
        where jsonb_typeof(f -> 'memberPlayerIds') is distinct from 'array'
           or f ->> 'captainPlayerId' is null
           or not (new.session_snapshot #> '{setup,turnOrder}') ? (f ->> 'captainPlayerId')
      ) then
        raise exception 'Doubles forces must declare two valid captains in turn order.'
          using errcode = '23514';
      end if;
      select count(*), count(distinct m.id)
        into member_seats, unique_member_seats
      from jsonb_array_elements(new.session_snapshot #> '{setup,doubles,forces}') f
      cross join lateral jsonb_array_elements_text(f -> 'memberPlayerIds') m(id);
      if member_seats <> 4 or unique_member_seats <> 4 then
        raise exception 'Each Doubles player must occupy exactly one force seat.'
          using errcode = '23514';
      end if;
      select count(*) into invalid_members
      from jsonb_array_elements(new.session_snapshot #> '{setup,doubles,forces}') f
      cross join lateral jsonb_array_elements_text(f -> 'memberPlayerIds') m(id)
      where not exists (
        select 1 from jsonb_array_elements(new.session_snapshot #> '{setup,players}') p
        where p ->> 'id' = m.id
      );
      if invalid_members <> 0 then
        raise exception 'Doubles force contains an unknown commander.' using errcode = '23514';
      end if;
    elsif required_seats not between 2 and 3 then
      raise exception 'Shared battle requires 2 or 3 seats, or a valid four-seat Doubles force.'
        using errcode = '23514';
    end if;

    select count(distinct participant.player_id) into ready_online_seats
    from public.shared_participants participant
    where participant.room_id = new.id
      and participant.is_ready = true
      and participant.last_seen_at > now() - interval '20 seconds';
    if ready_online_seats <> required_seats then
      raise exception 'All % distinct player seats must be online and ready before starting.', required_seats
        using errcode = '23514';
    end if;

    new.started_at := now();
    new.updated_at := new.started_at;
  end if;
  return new;
end;
$function$
;
revoke all on function public.enforce_shared_lobby_start() from public;

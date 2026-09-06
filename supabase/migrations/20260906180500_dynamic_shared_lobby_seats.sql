-- Shared rooms can now host either Duel 1v1 (2 seats) or Cauldron FFA 3 (3 seats).
-- Derive the required ready/online seat count from the battle snapshot instead of
-- hard-coding three commanders in the database trigger.

create or replace function public.enforce_shared_lobby_start()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  required_seats integer;
  ready_online_seats integer;
begin
  if old.started_at is null and new.started_at is not null then
    required_seats := coalesce(
      jsonb_array_length(new.session_snapshot -> 'setup' -> 'players'),
      0
    );

    if required_seats < 2 then
      raise exception 'Shared battle snapshot must contain at least two player seats.'
        using errcode = '23514';
    end if;

    select count(*) into ready_online_seats
    from public.shared_participants participant
    where participant.room_id = new.id
      and participant.is_ready = true
      and participant.last_seen_at > now() - interval '20 seconds';

    if ready_online_seats <> required_seats then
      raise exception 'All % player seats must be online and ready before starting.', required_seats
        using errcode = '23514';
    end if;

    new.started_at := now();
    new.updated_at := new.started_at;
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_shared_lobby_start() from public;

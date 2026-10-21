-- Private roster storage. Does not change multiplayer tables, roles or headers.
create table public.user_armies (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id uuid not null,
  army_data jsonb not null,
  source_local_id text check (length(source_local_id) <= 100000),
  name text generated always as (army_data ->> 'name') stored,
  faction text generated always as (army_data ->> 'faction') stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1 check (revision > 0),
  mutation_id uuid not null,
  deleted_at timestamptz,
  primary key (user_id, id),
  constraint army_identity check (jsonb_typeof(army_data) = 'object' and army_data ->> 'id' = id::text),
  constraint army_shape check (coalesce(jsonb_typeof(army_data -> 'units') = 'array', false)
    and coalesce(length(army_data ->> 'name') between 1 and 250, false)
    and coalesce(length(army_data ->> 'faction') > 0, false)),
  constraint army_size check (octet_length(army_data::text) <= 8388608)
);
alter table public.user_armies enable row level security;
revoke all on public.user_armies from public, anon, authenticated;
grant select on public.user_armies to authenticated;
grant insert (id, user_id, army_data, mutation_id, deleted_at, source_local_id) on public.user_armies to authenticated;
grant update (army_data, mutation_id, deleted_at) on public.user_armies to authenticated;
-- No physical DELETE grant: tombstones must survive every device's offline cache.
create policy user_armies_select on public.user_armies for select to authenticated
  using ((select auth.uid()) = user_id);
create policy user_armies_insert on public.user_armies for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy user_armies_update on public.user_armies for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_armies_delete on public.user_armies for delete to authenticated
  using ((select auth.uid()) = user_id);

create function public.guard_user_army_version() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.user_id <> old.user_id then
      raise exception 'Roster identity is immutable' using errcode = '23514';
    end if;
    if old.deleted_at is not null then
      raise exception 'Deleted rosters cannot be resurrected; create a copy' using errcode = '23514';
    end if;
    new.revision := old.revision + 1;
    new.created_at := old.created_at;
  else
    new.revision := 1;
    new.created_at := now();
  end if;
  new.updated_at := clock_timestamp();
  if new.deleted_at is not null then new.deleted_at := new.updated_at; end if;
  return new;
end;
$$;
revoke all on function public.guard_user_army_version() from public, anon, authenticated;
create trigger user_armies_version before insert or update on public.user_armies
  for each row execute function public.guard_user_army_version();

-- Atomic optimistic concurrency. Ownership is taken from Auth, never a payload.
-- Returns the current row on conflicts so clients can preserve their local copy.
create function public.save_user_army(
  p_id uuid, p_expected_revision bigint, p_mutation_id uuid, p_army_data jsonb,
  p_deleted boolean default false, p_source_local_id text default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  owner uuid := auth.uid();
  current_row public.user_armies;
  saved public.user_armies;
  accepted boolean := false;
begin
  if owner is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_expected_revision < 0 or p_mutation_id is null or p_deleted is null then
    raise exception 'Invalid mutation' using errcode = '22023';
  end if;
  select * into current_row from public.user_armies where user_id = owner and id = p_id for update;
  if found then
    if current_row.mutation_id = p_mutation_id then
      return jsonb_build_object('applied', true, 'row', to_jsonb(current_row));
    end if;
    if current_row.revision <> p_expected_revision or current_row.deleted_at is not null then
      return jsonb_build_object('applied', false, 'row', to_jsonb(current_row));
    end if;
    update public.user_armies set army_data = p_army_data, mutation_id = p_mutation_id,
      deleted_at = case when p_deleted then now() else null end
      where user_id = owner and id = p_id returning * into saved;
    accepted := true;
  else
    if p_expected_revision <> 0 then raise exception 'Roster revision no longer exists' using errcode = '40001'; end if;
    insert into public.user_armies (user_id, id, army_data, mutation_id, deleted_at, source_local_id)
      values (owner, p_id, p_army_data, p_mutation_id, case when p_deleted then now() else null end, p_source_local_id)
      on conflict (user_id, id) do nothing returning * into saved;
    accepted := found;
    if not accepted then
      select * into saved from public.user_armies where user_id = owner and id = p_id;
      accepted := saved.mutation_id = p_mutation_id;
    end if;
  end if;
  return jsonb_build_object('applied', accepted, 'row', to_jsonb(saved));
end;
$$;
revoke all on function public.save_user_army(uuid, bigint, uuid, jsonb, boolean, text) from public, anon;
grant execute on function public.save_user_army(uuid, bigint, uuid, jsonb, boolean, text) to authenticated;

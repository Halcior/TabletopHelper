-- Reject malformed identity and null expected revisions at the DB boundary.
alter table public.user_armies drop constraint army_identity;
alter table public.user_armies add constraint army_identity check (
  jsonb_typeof(army_data) = 'object' and coalesce(army_data ->> 'id' = id::text, false)
);

create or replace function public.save_user_army(
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
  if p_expected_revision is null or p_expected_revision < 0 or p_mutation_id is null or p_deleted is null then
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

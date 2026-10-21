-- Run as postgres in a disposable/test database or inside this rollback-only
-- transaction. Exercises actual authenticated/anon roles and auth.uid().
begin;
create temporary table army_rls_context as select gen_random_uuid() a, gen_random_uuid() b, gen_random_uuid() roster;
grant select on army_rls_context to authenticated, anon;
insert into auth.users(id, aud, role, email)
select a, 'authenticated', 'authenticated', a::text || '@army-rls.invalid' from army_rls_context
union all select b, 'authenticated', 'authenticated', b::text || '@army-rls.invalid' from army_rls_context;
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub',a,'role','authenticated')::text,true) from army_rls_context;
do $$
declare ctx record; result jsonb; mutation uuid := gen_random_uuid(); data jsonb; affected bigint;
begin
  select * into ctx from army_rls_context;
  data := jsonb_build_object('id',ctx.roster,'name','RLS roster','faction','Test','units','[]'::jsonb);
  begin
    perform public.save_user_army(ctx.roster,null,gen_random_uuid(),data,false);
    raise exception 'Null CAS revision was accepted';
  exception when invalid_parameter_value then null; end;
  result := public.save_user_army(ctx.roster,0,mutation,data,false,'local-rls');
  assert (result->>'applied')::boolean and (result->'row'->>'revision')::int=1, 'First CAS write failed';
  result := public.save_user_army(ctx.roster,0,mutation,data,false,'local-rls');
  assert (result->>'applied')::boolean and (result->'row'->>'revision')::int=1, 'Retry was not idempotent';
  result := public.save_user_army(ctx.roster,0,gen_random_uuid(),data,false);
  assert not (result->>'applied')::boolean, 'Stale edit was accepted';
  begin
    insert into public.user_armies(user_id,id,army_data,mutation_id) values(ctx.a,gen_random_uuid(),data - 'id',gen_random_uuid());
    raise exception 'Missing roster identity was accepted';
  exception when check_violation then null; end;
  begin
    insert into public.user_armies(user_id,id,army_data,mutation_id) values(ctx.b,ctx.roster,data,gen_random_uuid());
    raise exception 'Foreign INSERT was accepted';
  exception when insufficient_privilege then null; end;
  begin
    update public.user_armies set user_id=ctx.b where id=ctx.roster;
    raise exception 'Ownership change was accepted';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.user_armies where id=ctx.roster;
    raise exception 'Physical DELETE was accepted (tombstones required)';
  exception when insufficient_privilege then null; end;
  begin
    update public.user_armies set revision=99 where id=ctx.roster;
    raise exception 'Revision spoof was accepted';
  exception when insufficient_privilege then null; end;
end;
$$;
select set_config('request.jwt.claims', jsonb_build_object('sub',b,'role','authenticated')::text,true) from army_rls_context;
do $$
declare ctx record; result jsonb; affected bigint; data jsonb;
begin
  select * into ctx from army_rls_context;
  assert (select count(*) from public.user_armies where user_id=ctx.a)=0, 'Foreign SELECT leaked a roster';
  update public.user_armies set army_data=army_data || '{"name":"stolen"}'::jsonb where user_id=ctx.a;
  get diagnostics affected = row_count;
  assert affected=0, 'Foreign UPDATE was accepted';
  begin
    delete from public.user_armies where user_id=ctx.a;
    raise exception 'Foreign DELETE was accepted';
  exception when insufficient_privilege then null; end;
  -- Identical IDs across accounts are independent. B cannot read or overwrite A.
  data := jsonb_build_object('id',ctx.roster,'name','B private','faction','Test','units','[]'::jsonb);
  result := public.save_user_army(ctx.roster,0,gen_random_uuid(),data,false);
  assert result->'row'->>'user_id'=ctx.b::text and result->'row'->>'name'='B private', 'RPC ownership isolation failed';
end;
$$;
select set_config('request.jwt.claims', jsonb_build_object('sub',a,'role','authenticated')::text,true) from army_rls_context;
do $$
declare ctx record; result jsonb; data jsonb;
begin
  select * into ctx from army_rls_context;
  select army_data into data from public.user_armies where id=ctx.roster;
  assert data->>'name'='RLS roster', 'B changed A data';
  result := public.save_user_army(ctx.roster,1,gen_random_uuid(),data || '{"name":"A edited"}',false);
  assert (result->>'applied')::boolean and (result->'row'->>'revision')::int=2, 'Owner UPDATE failed';
  result := public.save_user_army(ctx.roster,2,gen_random_uuid(),data,true);
  assert (result->>'applied')::boolean and result->'row'->>'deleted_at' is not null, 'Owner tombstone failed';
  result := public.save_user_army(ctx.roster,3,gen_random_uuid(),data,false);
  assert not (result->>'applied')::boolean, 'Deleted roster was resurrected';
  begin
    update public.user_armies set deleted_at=null where id=ctx.roster;
    raise exception 'Direct resurrection was accepted';
  exception when check_violation then null; end;
end;
$$;
set local role anon;
select set_config('request.jwt.claims','{}',true);
do $$
begin
  begin insert into public.user_armies(id,army_data,mutation_id) values(gen_random_uuid(),'{}',gen_random_uuid()); raise exception 'Guest INSERT was accepted'; exception when insufficient_privilege then null; end;
  begin update public.user_armies set army_data='{}'; raise exception 'Guest UPDATE was accepted'; exception when insufficient_privilege then null; end;
  begin delete from public.user_armies; raise exception 'Guest DELETE was accepted'; exception when insufficient_privilege then null; end;
  begin perform * from public.user_armies; raise exception 'Guest SELECT was accepted'; exception when insufficient_privilege then null; end;
  begin perform public.save_user_army(gen_random_uuid(),0,gen_random_uuid(),'{}',false); raise exception 'Guest RPC was accepted'; exception when insufficient_privilege then null; end;
end;
$$;
reset role;
select 'PASS: real roles A/B/anon; SELECT INSERT UPDATE physical DELETE, ownership, CAS, retries, tombstones' as result;
rollback;

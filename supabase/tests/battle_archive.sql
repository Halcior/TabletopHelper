begin;
insert into auth.users(id) values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select public.save_battle_archive('archive-test',0,'00000000-0000-0000-0000-000000000011','{"schemaVersion":1,"ownerId":"00000000-0000-0000-0000-000000000001","id":"archive-test","session":{"setup":{"gameId":"archive-test"},"state":{"status":"completed"}}}');
-- Lost acknowledgements return the existing revision.
select public.save_battle_archive('archive-test',0,'00000000-0000-0000-0000-000000000011','{}');
do $$ begin
 if (select count(*) from public.battle_archive)<>1 or (select revision from public.battle_archive)<>1 then raise exception 'Duplicate archive'; end if;
 begin
  perform public.save_battle_archive('archive-test',0,'00000000-0000-0000-0000-000000000012','{}');
  raise exception 'Stale write accepted';
 exception when serialization_failure then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
do $$ begin
 if exists(select 1 from public.battle_archive) then raise exception 'Private archive leaked'; end if;
 begin
  insert into public.battle_archive(user_id,game_id,record,mutation_id) values('00000000-0000-0000-0000-000000000001','spoof','{}',gen_random_uuid());
  raise exception 'Owner spoof accepted';
 exception when insufficient_privilege then null; end;
 update public.battle_archive set record='{}';
 if found then raise exception 'Other archive modified'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform * from public.battle_archive; raise exception 'Anonymous archive access'; exception when insufficient_privilege then null; end;
end $$;
rollback;

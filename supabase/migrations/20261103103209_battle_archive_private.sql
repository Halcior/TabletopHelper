-- Private historical snapshots; never changes live session RLS or schema version.
create table public.battle_archive (
 user_id uuid not null references auth.users(id) on delete cascade,
 game_id text not null,
 record jsonb not null,
 revision bigint not null default 1 check (revision > 0),
 mutation_id uuid not null,
 updated_at timestamptz not null default now(),
 primary key(user_id,game_id),
 check (record ?& array['schemaVersion','ownerId','id','session']),
 check (record @> '{"schemaVersion":1}'::jsonb),
 check (record->>'ownerId' = user_id::text),
 check (record->>'id' = game_id and record #>> '{session,setup,gameId}' = game_id),
 check (coalesce(record #>> '{session,state,status}' = 'completed',false)),
 check (octet_length(record::text) <= 15000000)
);
alter table public.battle_archive enable row level security;
grant select,insert,update,delete on public.battle_archive to authenticated;
create policy archive_owner on public.battle_archive for all to authenticated
 using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

create function public.save_battle_archive(p_game_id text,p_expected_revision bigint,p_mutation_id uuid,p_record jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved public.battle_archive;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select * into saved from public.battle_archive where user_id=auth.uid() and game_id=p_game_id for update;
 if found then
  if saved.mutation_id=p_mutation_id then return saved.record || jsonb_build_object('revision',saved.revision); end if;
  if saved.revision<>p_expected_revision then raise exception 'Archive conflict: reload before syncing' using errcode='40001'; end if;
  update public.battle_archive set record=p_record,revision=revision+1,mutation_id=p_mutation_id,updated_at=now() where user_id=auth.uid() and game_id=p_game_id returning * into saved;
 else
  if p_expected_revision<>0 then raise exception 'Archive revision missing' using errcode='40001'; end if;
  insert into public.battle_archive(user_id,game_id,record,mutation_id) values(auth.uid(),p_game_id,p_record,p_mutation_id) returning * into saved;
 end if;
 return saved.record || jsonb_build_object('revision',saved.revision);
end $$;
revoke all on function public.save_battle_archive(text,bigint,uuid,jsonb) from public,anon;
grant execute on function public.save_battle_archive(text,bigint,uuid,jsonb) to authenticated;

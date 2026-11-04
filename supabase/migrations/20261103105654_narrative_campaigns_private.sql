create table public.narrative_campaigns (
 id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 member_ids uuid[] not null,
 campaign jsonb not null,
 revision bigint not null default 1 check(revision>0),
 mutation_id uuid not null,
 updated_at timestamptz not null default now(),
 check (campaign @> '{"schemaVersion":1}'::jsonb),
 check (coalesce(campaign->>'ownerId'=owner_id::text and campaign->>'id'=id::text,false)),
 check (coalesce(jsonb_typeof(campaign->'participants')='array' and jsonb_array_length(campaign->'participants') between 2 and 6,false)),
 check (owner_id=any(member_ids) and cardinality(member_ids) between 1 and 6),
 check (octet_length(campaign::text)<=3000000)
);
alter table public.narrative_campaigns enable row level security;
revoke all on public.narrative_campaigns from public,anon;
grant select,insert,update,delete on public.narrative_campaigns to authenticated;
create policy campaign_read on public.narrative_campaigns for select to authenticated using ((select auth.uid())=owner_id or (select auth.uid())=any(member_ids));
create policy campaign_insert on public.narrative_campaigns for insert to authenticated with check ((select auth.uid())=owner_id);
create policy campaign_update on public.narrative_campaigns for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy campaign_delete on public.narrative_campaigns for delete to authenticated using ((select auth.uid())=owner_id);
create index narrative_campaigns_members_idx on public.narrative_campaigns using gin(member_ids);
create index narrative_campaigns_owner_idx on public.narrative_campaigns(owner_id);
create function public.save_narrative_campaign(p_id uuid,p_expected_revision bigint,p_mutation_id uuid,p_campaign jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved public.narrative_campaigns; members uuid[];
begin
 if auth.uid() is null or p_campaign->>'ownerId' is distinct from auth.uid()::text then raise exception 'Campaign host required' using errcode='42501'; end if;
 select array_agg(distinct member) into members from (
  select auth.uid() member union all select (p->>'profileId')::uuid from jsonb_array_elements(p_campaign->'participants') p where nullif(p->>'profileId','') is not null
 ) ids;
 select * into saved from public.narrative_campaigns where id=p_id for update;
 if found then
  if saved.owner_id<>auth.uid() then raise exception 'Campaign host required' using errcode='42501'; end if;
  if saved.mutation_id=p_mutation_id then return saved.campaign||jsonb_build_object('revision',saved.revision); end if;
  if saved.revision<>p_expected_revision then raise exception 'Campaign changed; reload before syncing' using errcode='40001'; end if;
  update public.narrative_campaigns set campaign=p_campaign,member_ids=members,revision=revision+1,mutation_id=p_mutation_id,updated_at=now() where id=p_id returning * into saved;
 else
  if p_expected_revision<>0 then raise exception 'Campaign revision missing' using errcode='40001'; end if;
  insert into public.narrative_campaigns(id,owner_id,member_ids,campaign,mutation_id) values(p_id,auth.uid(),members,p_campaign,p_mutation_id) returning * into saved;
 end if;
 return saved.campaign||jsonb_build_object('revision',saved.revision);
end $$;
revoke all on function public.save_narrative_campaign(uuid,bigint,uuid,jsonb) from public,anon;
grant execute on function public.save_narrative_campaign(uuid,bigint,uuid,jsonb) to authenticated;

-- Keep access membership identical to the explicitly linked campaign participants,
-- including direct table writes permitted to the host by RLS.
create function public.derive_campaign_members() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 select array_agg(distinct member) into new.member_ids from (
  select new.owner_id member union all select (p->>'profileId')::uuid from jsonb_array_elements(new.campaign->'participants') p where nullif(p->>'profileId','') is not null
 ) ids;
 return new;
end $$;
revoke all on function public.derive_campaign_members() from public,anon;
create trigger derive_campaign_members before insert or update on public.narrative_campaigns for each row execute function public.derive_campaign_members();

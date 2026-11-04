begin;
insert into auth.users(id) values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select public.save_narrative_campaign('00000000-0000-0000-0000-000000000010',0,'00000000-0000-0000-0000-000000000011','{"schemaVersion":1,"id":"00000000-0000-0000-0000-000000000010","ownerId":"00000000-0000-0000-0000-000000000001","participants":[{"id":"host","profileId":"00000000-0000-0000-0000-000000000001"},{"id":"friend","profileId":"00000000-0000-0000-0000-000000000002"}]}');
select public.save_narrative_campaign('00000000-0000-0000-0000-000000000010',0,'00000000-0000-0000-0000-000000000011','{"ownerId":"00000000-0000-0000-0000-000000000001"}');
do $$ begin if (select revision from public.narrative_campaigns)<>1 then raise exception 'Duplicate campaign mutation';end if;end $$;
-- Table writes cannot widen access outside the linked participants.
update public.narrative_campaigns set member_ids=array['00000000-0000-0000-0000-000000000003'::uuid];
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
do $$ begin if exists(select 1 from public.narrative_campaigns) then raise exception 'Unrelated account read campaign';end if;end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
do $$ begin
 if (select count(*) from public.narrative_campaigns)<>1 then raise exception 'Member cannot read';end if;
 update public.narrative_campaigns set revision=100;
 if found then raise exception 'Member changed campaign';end if;
 begin perform public.save_narrative_campaign('00000000-0000-0000-0000-000000000010',1,gen_random_uuid(),'{"ownerId":"00000000-0000-0000-0000-000000000001"}');raise exception 'Member spoofed host';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
update public.narrative_campaigns set campaign=jsonb_set(campaign,'{participants}','[{"id":"host"},{"id":"local"}]');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
do $$ begin if exists(select 1 from public.narrative_campaigns) then raise exception 'Removed member kept access';end if;end $$;
reset role;set local role anon;
do $$ begin begin perform * from public.narrative_campaigns;raise exception 'Anonymous campaign access';exception when insufficient_privilege then null;end;end $$;
rollback;

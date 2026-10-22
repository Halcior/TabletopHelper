-- Private, owner-controlled media with read access only to accepted friends
-- when the corresponding roster itself is shared. No public URLs are exposed.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('army-media','army-media',false,2097152,array['image/webp'])
 on conflict(id) do update set public=false,file_size_limit=2097152,allowed_mime_types=array['image/webp'];

create function social_private.may_view_army_media(p_owner text,p_army text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare owner_uuid uuid; army_uuid uuid; viewer uuid:=auth.uid();
begin
 if viewer is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then return false; end if;
 begin owner_uuid:=p_owner::uuid; army_uuid:=p_army::uuid;
 exception when invalid_text_representation then return false; end;
 if viewer=owner_uuid then return true; end if;
 return exists (
  select 1 from public.army_sharing s
  join public.user_armies a on a.user_id=s.user_id and a.id=s.army_id and a.deleted_at is null
  join public.friendships f on f.user_a=least(owner_uuid,viewer)
   and f.user_b=greatest(owner_uuid,viewer) and f.status='accepted'
  where s.user_id=owner_uuid and s.army_id=army_uuid and s.visibility='friends'
 );
end $$;
revoke all on function social_private.may_view_army_media(text,text) from public,anon;
grant execute on function social_private.may_view_army_media(text,text) to authenticated;

create policy "army media owner insert" on storage.objects for insert to authenticated
 with check(bucket_id='army-media'
   and (storage.foldername(name))[1]=(select auth.uid())::text
   and array_length(storage.foldername(name),1)=2);
create policy "army media visible download" on storage.objects for select to authenticated
 using(bucket_id='army-media'
   and social_private.may_view_army_media((storage.foldername(name))[1],(storage.foldername(name))[2]));
create policy "army media owner update" on storage.objects for update to authenticated
 using(bucket_id='army-media' and (storage.foldername(name))[1]=(select auth.uid())::text)
 with check(bucket_id='army-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "army media owner delete" on storage.objects for delete to authenticated
 using(bucket_id='army-media' and (storage.foldername(name))[1]=(select auth.uid())::text);

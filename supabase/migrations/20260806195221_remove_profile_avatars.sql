drop policy if exists "spirit_avatars_select_own" on storage.objects;
drop policy if exists "spirit_avatars_insert_own" on storage.objects;
drop policy if exists "spirit_avatars_update_own" on storage.objects;
drop policy if exists "spirit_avatars_delete_own" on storage.objects;

-- The bucket and its objects must be removed through the Storage API or the
-- Dashboard. Supabase intentionally blocks direct SQL deletion from Storage.
update storage.buckets
set public = false
where id = 'spirit-avatars';

revoke update (avatar_url) on table public.profiles from authenticated;

alter table public.profiles
drop column if exists avatar_url;

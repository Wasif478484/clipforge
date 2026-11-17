-- Share links: public storage bucket for user-published videos.
-- Public bucket = anyone with the link can watch (that's the feature).
-- Uploads/deletes stay owner-only under the authed user's uid folder.

insert into storage.buckets (id, name, public, file_size_limit)
values ('shared-videos', 'shared-videos', true, 262144000)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

drop policy if exists "Signed-in users can publish share videos" on storage.objects;
create policy "Signed-in users can publish share videos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'shared-videos'
  and (select auth.uid())::text = (storage.foldername(name))[1]
);

drop policy if exists "Owners can delete shared videos" on storage.objects;
create policy "Owners can delete shared videos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'shared-videos'
  and (select auth.uid())::text = (storage.foldername(name))[1]
);

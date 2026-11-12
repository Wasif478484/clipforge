-- Cloud media sync: private storage bucket + owner-only object policies.
-- Media files live at <auth.uid>/<project_id>/<asset_id> inside the bucket;
-- the leading folder must equal the caller's auth.uid() for every operation.

insert into storage.buckets (id, name, public, file_size_limit)
values ('project-assets', 'project-assets', false, 524288000)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

-- Convenience default so project_assets rows always carry an owner.
alter table public.project_assets
  alter column owner_id set default auth.uid();

drop policy if exists "Owners can upload project assets" on storage.objects;
create policy "Owners can upload project assets"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'project-assets'
  and (select auth.uid())::text = (storage.foldername(name))[1]
);

drop policy if exists "Owners can read project assets" on storage.objects;
create policy "Owners can read project assets"
on storage.objects for select
to authenticated
using (
  bucket_id = 'project-assets'
  and (select auth.uid())::text = (storage.foldername(name))[1]
);

drop policy if exists "Owners can update project assets" on storage.objects;
create policy "Owners can update project assets"
on storage.objects for update
to authenticated
using (
  bucket_id = 'project-assets'
  and (select auth.uid())::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'project-assets'
  and (select auth.uid())::text = (storage.foldername(name))[1]
);

drop policy if exists "Owners can delete project assets" on storage.objects;
create policy "Owners can delete project assets"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'project-assets'
  and (select auth.uid())::text = (storage.foldername(name))[1]
);

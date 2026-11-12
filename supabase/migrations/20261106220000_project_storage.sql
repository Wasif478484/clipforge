create extension if not exists pgcrypto;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 200),
  aspect text not null check (aspect in ('16:9', '9:16', '1:1')),
  snapshot jsonb not null default '{}'::jsonb,
  thumbnail text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists projects_owner_updated_idx
  on public.projects (owner_id, updated_at desc);

create table if not exists public.project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  version integer not null check (version > 0),
  snapshot jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (project_id, version)
);

create index if not exists project_versions_project_created_idx
  on public.project_versions (project_id, created_at desc);

create table if not exists public.project_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  asset_id text not null,
  name text not null check (char_length(trim(name)) between 1 and 500),
  kind text not null check (kind in ('video', 'audio', 'image')),
  storage_path text not null,
  mime_type text,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  duration double precision not null default 0 check (duration >= 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  created_at timestamptz not null default timezone('utc', now()),
  unique (project_id, asset_id)
);

create index if not exists project_assets_owner_idx
  on public.project_assets (owner_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

alter table public.projects enable row level security;
alter table public.project_versions enable row level security;
alter table public.project_assets enable row level security;

drop policy if exists "Owners can read projects" on public.projects;
create policy "Owners can read projects"
on public.projects for select
to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can create projects" on public.projects;
create policy "Owners can create projects"
on public.projects for insert
to authenticated
with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can update projects" on public.projects;
create policy "Owners can update projects"
on public.projects for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can delete projects" on public.projects;
create policy "Owners can delete projects"
on public.projects for delete
to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can read project versions" on public.project_versions;
create policy "Owners can read project versions"
on public.project_versions for select
to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can create project versions" on public.project_versions;
create policy "Owners can create project versions"
on public.project_versions for insert
to authenticated
with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can delete project versions" on public.project_versions;
create policy "Owners can delete project versions"
on public.project_versions for delete
to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can read project assets" on public.project_assets;
create policy "Owners can read project assets"
on public.project_assets for select
to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can create project assets" on public.project_assets;
create policy "Owners can create project assets"
on public.project_assets for insert
to authenticated
with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can update project assets" on public.project_assets;
create policy "Owners can update project assets"
on public.project_assets for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can delete project assets" on public.project_assets;
create policy "Owners can delete project assets"
on public.project_assets for delete
to authenticated
using ((select auth.uid()) = owner_id);

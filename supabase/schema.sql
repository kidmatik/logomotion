-- LogoMotion: accounts and saved projects.
-- Run once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to run again.

-- Projects: one row per project, the whole project (brand kit, scenes, music) as JSON.
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default 'Untitled project',
  data jsonb not null,
  thumbnail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_user_updated on public.projects (user_id, updated_at desc);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects for each row execute function public.touch_updated_at();

-- Everyone sees and changes only their own projects.
alter table public.projects enable row level security;
drop policy if exists "own projects: read" on public.projects;
drop policy if exists "own projects: add" on public.projects;
drop policy if exists "own projects: change" on public.projects;
drop policy if exists "own projects: delete" on public.projects;
create policy "own projects: read" on public.projects for select to authenticated using (user_id = auth.uid());
create policy "own projects: add" on public.projects for insert to authenticated with check (user_id = auth.uid());
create policy "own projects: change" on public.projects for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own projects: delete" on public.projects for delete to authenticated using (user_id = auth.uid());

-- Media files (uploads, captures, stock photos): a private bucket, one folder per user (<user id>/<media id>).
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', false, 104857600)
on conflict (id) do nothing;

drop policy if exists "own media: read" on storage.objects;
drop policy if exists "own media: add" on storage.objects;
drop policy if exists "own media: change" on storage.objects;
drop policy if exists "own media: delete" on storage.objects;
create policy "own media: read" on storage.objects for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own media: add" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own media: change" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own media: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

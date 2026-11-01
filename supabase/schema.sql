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

-- ---------------------------------------------------------------------------
-- Live brand pages: a public, read-only copy of a project at /s/<id>, with
-- comments and approval from whoever has the link (no account needed).
-- ---------------------------------------------------------------------------
create table if not exists public.shares (
  id text primary key check (id ~ '^[A-Za-z0-9]{10,32}$'),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  title text not null default '',
  owner_name text not null default '',
  data jsonb not null,
  allow_comments boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists shares_project on public.shares (project_id);
drop trigger if exists shares_touch on public.shares;
create trigger shares_touch before update on public.shares for each row execute function public.touch_updated_at();

-- Owners manage their own pages. Nobody can list pages; visitors read one page by its id (below).
alter table public.shares enable row level security;
drop policy if exists "own shares: read" on public.shares;
drop policy if exists "own shares: add" on public.shares;
drop policy if exists "own shares: change" on public.shares;
drop policy if exists "own shares: delete" on public.shares;
create policy "own shares: read" on public.shares for select to authenticated using (user_id = auth.uid());
create policy "own shares: add" on public.shares for insert to authenticated with check (user_id = auth.uid());
create policy "own shares: change" on public.shares for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own shares: delete" on public.shares for delete to authenticated using (user_id = auth.uid());

create table if not exists public.share_comments (
  id uuid primary key default gen_random_uuid(),
  share_id text not null references public.shares (id) on delete cascade,
  author text not null check (char_length(author) between 1 and 60),
  body text not null default '' check (char_length(body) <= 2000),
  at_time real check (at_time is null or (at_time >= 0 and at_time < 3600)),
  kind text not null default 'comment' check (kind in ('comment', 'approve', 'changes')),
  created_at timestamptz not null default now()
);
create index if not exists share_comments_share on public.share_comments (share_id, created_at);
alter table public.share_comments enable row level security;
drop policy if exists "own share comments: read" on public.share_comments;
drop policy if exists "own share comments: delete" on public.share_comments;
create policy "own share comments: read" on public.share_comments for select to authenticated
  using (exists (select 1 from public.shares s where s.id = share_id and s.user_id = auth.uid()));
create policy "own share comments: delete" on public.share_comments for delete to authenticated
  using (exists (select 1 from public.shares s where s.id = share_id and s.user_id = auth.uid()));

-- Visitors: read one page, read its comments, add a comment. Each checks the page exists.
create or replace function public.get_share(share text)
returns table (id text, title text, owner_name text, data jsonb, allow_comments boolean, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.id, s.title, s.owner_name, s.data, s.allow_comments, s.updated_at from public.shares s where s.id = share;
$$;

create or replace function public.list_share_comments(share text)
returns table (id uuid, author text, body text, at_time real, kind text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.author, c.body, c.at_time, c.kind, c.created_at from public.share_comments c
  where c.share_id = share order by c.created_at limit 500;
$$;

create or replace function public.add_share_comment(share text, author text, body text, at_time real, kind text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  recent int;
begin
  if not exists (select 1 from public.shares s where s.id = share and s.allow_comments) then
    raise exception 'Comments are closed on this page.';
  end if;
  -- A light brake on floods: at most 30 comments a minute per page.
  select count(*) into recent from public.share_comments c where c.share_id = share and c.created_at > now() - interval '1 minute';
  if recent >= 30 then
    raise exception 'Too many comments right now. Try again in a minute.';
  end if;
  insert into public.share_comments (share_id, author, body, at_time, kind)
  values (share, left(trim(author), 60), left(coalesce(body, ''), 2000), at_time, kind)
  returning id into new_id;
  return new_id;
end $$;

grant execute on function public.get_share(text) to anon, authenticated;
grant execute on function public.list_share_comments(text) to anon, authenticated;
grant execute on function public.add_share_comment(text, text, text, real, text) to anon, authenticated;

-- Media shown on live pages: a public bucket, one folder per page (<share id>/<media id>).
insert into storage.buckets (id, name, public, file_size_limit)
values ('shared', 'shared', true, 104857600)
on conflict (id) do nothing;
drop policy if exists "shared media: add" on storage.objects;
drop policy if exists "shared media: change" on storage.objects;
drop policy if exists "shared media: delete" on storage.objects;
create policy "shared media: add" on storage.objects for insert to authenticated
  with check (bucket_id = 'shared' and exists (select 1 from public.shares s where s.id = (storage.foldername(name))[1] and s.user_id = auth.uid()));
create policy "shared media: change" on storage.objects for update to authenticated
  using (bucket_id = 'shared' and exists (select 1 from public.shares s where s.id = (storage.foldername(name))[1] and s.user_id = auth.uid()));
create policy "shared media: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'shared' and exists (select 1 from public.shares s where s.id = (storage.foldername(name))[1] and s.user_id = auth.uid()));

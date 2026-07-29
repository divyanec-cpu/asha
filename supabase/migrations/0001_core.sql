-- 0001_core.sql
-- Sextant core: the student profile. Adults only — no parent/consent graph (see CLAUDE.md).

create table if not exists public.users (
  id                uuid primary key references auth.users (id) on delete cascade,
  name              text not null,
  target_exam       text not null default 'CAT' check (target_exam in ('CAT', 'GMAT', 'MAT')),
  target_year       int  not null,
  target_percentile numeric(5,2),                    -- self-declared goal; nullable, purely motivational
  prep_mode         text check (prep_mode in ('classroom', 'online', 'self-study')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.users enable row level security;

create policy users_select_own on public.users
  for select using (auth.uid() = id);
create policy users_insert_own on public.users
  for insert with check (auth.uid() = id);
create policy users_update_own on public.users
  for update using (auth.uid() = id) with check (auth.uid() = id);
create policy users_delete_own on public.users
  for delete using (auth.uid() = id);

-- Dhruva's proven fix: Supabase normalises stored phone numbers differently
-- from raw input, so match on digits only.
create or replace function public.get_user_id_by_phone(p_phone text)
returns uuid
language sql
security definer
set search_path = public, auth
as $$
  select u.id
  from auth.users u
  where regexp_replace(coalesce(u.phone, ''), '\D', '', 'g')
      = regexp_replace(p_phone, '\D', '', 'g')
  limit 1;
$$;

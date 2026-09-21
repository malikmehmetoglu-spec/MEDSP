-- ===== نظام المشاريع والاستبيانات =====
create extension if not exists pgcrypto with schema extensions;

-- قائمة المشرفين: من يملك صلاحية الإدارة
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  owner text not null default '',
  status text not null default 'draft' check (status in ('draft','collecting','published','closed')),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.surveys (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null default 'استبيان جديد',
  description text not null default '',
  pages jsonb not null default '[]'::jsonb,
  is_open boolean not null default false,
  password_hash text,                       -- بصمة bcrypt، لا نص صريح
  closes_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index surveys_project_idx on public.surveys(project_id);

create table public.responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  answers jsonb not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  source text not null default 'link',
  submitted_at timestamptz not null default now(),
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text not null default '',
  edited boolean not null default false,
  history jsonb not null default '[]'::jsonb
);
create index responses_survey_idx on public.responses(survey_id);
create index responses_status_idx on public.responses(survey_id, status);

-- ===== الصلاحيات =====
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

alter table public.admins enable row level security;
alter table public.projects enable row level security;
alter table public.surveys enable row level security;
alter table public.responses enable row level security;

-- المشرف يرى صفّه فقط في قائمة المشرفين (لمعرفة أنه مشرف)
create policy admins_self_read on public.admins
  for select to authenticated using (user_id = (select auth.uid()));

-- المشرفون فقط يديرون الجداول. لا سياسات لـ anon إطلاقاً.
create policy projects_admin_all on public.projects
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy surveys_admin_all on public.surveys
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy responses_admin_all on public.responses
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- تحديث updated_at تلقائياً
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end; $$;

create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();
create trigger surveys_touch before update on public.surveys
  for each row execute function public.touch_updated_at();

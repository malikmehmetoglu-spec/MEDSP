-- سجل الجهات العاملة في قطاع الأنقاض: جهة واحدة قد تحمل أكثر من دور.
create table if not exists public.rubble_entities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  aliases text[] not null default '{}',
  type text not null default '',
  roles text[] not null default '{}',
  governorates text[] not null default '{}',
  contact text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.rubble_entities enable row level security;
create policy rubble_entities_read on public.rubble_entities for select to anon, authenticated using (true);
create policy rubble_entities_admin on public.rubble_entities for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant select on public.rubble_entities to anon, authenticated;
grant insert, update, delete on public.rubble_entities to authenticated;

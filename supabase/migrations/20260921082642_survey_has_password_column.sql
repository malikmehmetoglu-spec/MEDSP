-- عمود محسوب يكشف وجود كلمة مرور فقط، فلا تُنقل البصمة للمتصفح أبداً
alter table public.surveys
  add column has_password boolean generated always as (password_hash is not null) stored;

-- منع قراءة البصمة حتى للمسجّلين: صلاحيات أعمدة صريحة
revoke select on public.surveys from authenticated, anon;
grant select (id, project_id, title, description, pages, is_open, closes_at,
              created_at, updated_at, has_password)
  on public.surveys to authenticated;

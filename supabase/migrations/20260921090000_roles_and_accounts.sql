-- ===== الأدوار وإدارة الحسابات =====
-- دوران: super_admin (واحد، يدير الحسابات والبيانات) و admin (مشرف يدير البيانات)
-- الدخول باسم مستخدم؛ البريد داخلي بنطاق .invalid لا يستقبل رسائل أبداً.

alter table public.admins
  add column role text not null default 'admin' check (role in ('super_admin','admin')),
  add column username text unique check (username ~ '^[a-z0-9][a-z0-9._-]{2,31}$');

-- سوبر أدمن واحد فقط على مستوى القاعدة
create unique index one_super_admin on public.admins ((role)) where role = 'super_admin';

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins
                 where user_id = (select auth.uid()) and role = 'super_admin');
$$;

create or replace function public.my_role()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('role', role, 'username', username, 'displayName', display_name)
  from public.admins where user_id = (select auth.uid());
$$;

-- إنشاء حساب مشرف — للسوبر أدمن فقط، مؤكَّد مباشرة بلا بريد
create or replace function public.create_account(p_username text, p_password text, p_display text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uname text := lower(trim(p_username)); new_id uuid := gen_random_uuid();
begin
  if not public.is_super_admin() then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  if uname !~ '^[a-z0-9][a-z0-9._-]{2,31}$' then
    raise exception 'اسم المستخدم: 3 إلى 32 حرفاً إنجليزياً صغيراً أو أرقاماً أو . _ -';
  end if;
  if length(coalesce(p_password,'')) < 8 then
    raise exception 'كلمة المرور يجب أن تكون 8 أحرف على الأقل';
  end if;
  if exists (select 1 from public.admins where username = uname) then
    raise exception 'اسم المستخدم مستخدم مسبقاً';
  end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated',
    uname || '@medsp.invalid', extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), new_id, new_id::text,
          jsonb_build_object('sub', new_id::text, 'email', uname || '@medsp.invalid'),
          'email', now(), now(), now());

  insert into public.admins (user_id, display_name, role, username)
  values (new_id, coalesce(nullif(trim(p_display),''), uname), 'admin', uname);
  return new_id;
end; $$;

create or replace function public.list_accounts()
returns table (user_id uuid, username text, display_name text, role text,
               created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_super_admin() then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  return query
    select a.user_id, a.username, a.display_name, a.role, a.created_at, u.last_sign_in_at
    from public.admins a join auth.users u on u.id = a.user_id
    order by (a.role = 'super_admin') desc, a.created_at;
end; $$;

create or replace function public.reset_account_password(p_user uuid, p_password text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_super_admin() then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  if length(coalesce(p_password,'')) < 8 then
    raise exception 'كلمة المرور يجب أن تكون 8 أحرف على الأقل';
  end if;
  if not exists (select 1 from public.admins where user_id = p_user) then
    raise exception 'الحساب غير موجود';
  end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
                        updated_at = now()
   where id = p_user;
end; $$;

create or replace function public.delete_account(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_super_admin() then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  if exists (select 1 from public.admins where user_id = p_user and role = 'super_admin') then
    raise exception 'لا يمكن حذف حساب السوبر أدمن';
  end if;
  delete from auth.users where id = p_user;
end; $$;

revoke all on function public.is_super_admin() from public, anon;
revoke all on function public.my_role() from public, anon;
revoke all on function public.create_account(text,text,text) from public, anon;
revoke all on function public.list_accounts() from public, anon;
revoke all on function public.reset_account_password(uuid,text) from public, anon;
revoke all on function public.delete_account(uuid) from public, anon;
grant execute on function public.is_super_admin(), public.my_role(), public.list_accounts(),
  public.create_account(text,text,text), public.reset_account_password(uuid,text),
  public.delete_account(uuid) to authenticated;

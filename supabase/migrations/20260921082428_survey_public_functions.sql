-- ===== دوال الوصول العام =====
-- كل ما يصل إليه غير المسجّل يمر من هنا. الجداول نفسها مغلقة.

-- ضبط كلمة مرور استبيان (للمشرفين فقط) — تُخزَّن بصمة bcrypt
create or replace function public.set_survey_password(p_survey uuid, p_password text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'غير مصرّح' using errcode = '42501';
  end if;
  update public.surveys
     set password_hash = case
           when p_password is null or length(p_password) = 0 then null
           else extensions.crypt(p_password, extensions.gen_salt('bf', 10))
         end
   where id = p_survey;
end;
$$;

-- حالة الاستبيان للعامة: لا يُكشف التعريف إن كان محمياً
create or replace function public.get_public_survey(p_survey uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare s public.surveys; pname text;
begin
  select * into s from public.surveys where id = p_survey;
  if not found then return jsonb_build_object('status','missing'); end if;
  if not s.is_open then return jsonb_build_object('status','closed'); end if;
  if s.closes_at is not null and s.closes_at < current_date then
    return jsonb_build_object('status','expired');
  end if;
  select name into pname from public.projects where id = s.project_id;

  if s.password_hash is not null then
    return jsonb_build_object(
      'status','ok', 'needsPassword', true, 'projectName', coalesce(pname,''),
      'survey', jsonb_build_object('id', s.id, 'title', s.title));
  end if;

  return jsonb_build_object(
    'status','ok', 'needsPassword', false, 'projectName', coalesce(pname,''),
    'survey', jsonb_build_object('id', s.id, 'title', s.title,
                                 'description', s.description, 'pages', s.pages));
end;
$$;

-- فتح استبيان محمي: يُرجع التعريف فقط إن صحّت كلمة المرور
create or replace function public.unlock_survey(p_survey uuid, p_password text)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare s public.surveys;
begin
  select * into s from public.surveys where id = p_survey and is_open;
  if not found then return null; end if;
  if s.closes_at is not null and s.closes_at < current_date then return null; end if;
  if s.password_hash is not null
     and s.password_hash <> extensions.crypt(coalesce(p_password,''), s.password_hash) then
    return null;
  end if;
  return jsonb_build_object('id', s.id, 'title', s.title,
                            'description', s.description, 'pages', s.pages);
end;
$$;

-- إرسال إجابة: يتحقق الخادم من الفتح والتاريخ وكلمة المرور والحجم
create or replace function public.submit_response(
  p_survey uuid, p_answers jsonb, p_password text default null, p_source text default 'link')
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare s public.surveys; new_id uuid;
begin
  select * into s from public.surveys where id = p_survey;
  if not found then raise exception 'الاستبيان غير موجود'; end if;

  -- المشرف يستطيع الإرسال من المعاينة حتى لو كان الاستبيان مغلقاً
  if not public.is_admin() then
    if not s.is_open then raise exception 'الاستبيان مغلق'; end if;
    if s.closes_at is not null and s.closes_at < current_date then
      raise exception 'انتهت مدة التعبئة';
    end if;
    if s.password_hash is not null
       and s.password_hash <> extensions.crypt(coalesce(p_password,''), s.password_hash) then
      raise exception 'كلمة المرور غير صحيحة';
    end if;
  end if;

  if jsonb_typeof(p_answers) <> 'object' then raise exception 'صيغة الإجابة غير صحيحة'; end if;
  -- حدّ للحجم يمنع إغراق القاعدة (الصور مضغوطة مسبقاً في المتصفح)
  if pg_column_size(p_answers) > 8 * 1024 * 1024 then
    raise exception 'حجم الإجابة كبير جداً';
  end if;

  insert into public.responses (survey_id, answers, source, history)
  values (p_survey, p_answers,
          case when p_source in ('link','preview') then p_source else 'link' end,
          jsonb_build_array(jsonb_build_object('at', now(), 'action', 'submitted',
                                               'by', case when public.is_admin() then 'مشرف' else 'مجهول' end)))
  returning id into new_id;
  return new_id;
end;
$$;

-- المشاريع المنشورة للعامة: المعتمد فقط، بلا حقول إدارية ولا كلمات مرور
create or replace function public.list_published()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'name', p.name, 'description', p.description,
    'surveys', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'pages', s.pages) order by s.created_at)
      from public.surveys s where s.project_id = p.id), '[]'::jsonb),
    'responses', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'surveyId', r.survey_id, 'answers', r.answers))
      from public.responses r join public.surveys s2 on s2.id = r.survey_id
      where s2.project_id = p.id and r.status = 'approved'), '[]'::jsonb)
  ) order by p.created_at desc), '[]'::jsonb)
  from public.projects p where p.published;
$$;

-- حماية النشر: لا يُنشر مشروع بلا إجابة معتمدة
create or replace function public.guard_publish()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.published and not old.published then
    if not exists (select 1 from public.responses r join public.surveys s on s.id = r.survey_id
                   where s.project_id = new.id and r.status = 'approved') then
      raise exception 'لا يمكن نشر مشروع بلا أي إجابة معتمدة';
    end if;
  end if;
  return new;
end; $$;

create trigger projects_guard_publish before update on public.projects
  for each row execute function public.guard_publish();

-- صلاحيات التنفيذ
revoke all on function public.set_survey_password(uuid,text) from public, anon;
grant execute on function public.set_survey_password(uuid,text) to authenticated;
grant execute on function public.get_public_survey(uuid) to anon, authenticated;
grant execute on function public.unlock_survey(uuid,text) to anon, authenticated;
grant execute on function public.submit_response(uuid,jsonb,text,text) to anon, authenticated;
grant execute on function public.list_published() to anon, authenticated;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

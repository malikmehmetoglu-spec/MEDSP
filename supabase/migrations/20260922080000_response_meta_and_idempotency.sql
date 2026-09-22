-- البيانات الوصفية للاستمارة، ومعرّف يولّده الجهاز لمنع التكرار عند إعادة الإرسال
alter table public.responses
  add column meta jsonb not null default '{}'::jsonb,
  add column client_id uuid;

create unique index responses_client_id_key on public.responses (client_id) where client_id is not null;

drop function if exists public.submit_response(uuid, jsonb, text, text);

create or replace function public.submit_response(
  p_survey uuid, p_answers jsonb, p_password text default null,
  p_source text default 'link', p_meta jsonb default '{}'::jsonb, p_client_id uuid default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare s public.surveys; new_id uuid; existing uuid; clean_meta jsonb;
begin
  /* عدم التكرار: المعرّف نفسه = الاستمارة نفسها، فنُرجع الموجودة */
  if p_client_id is not null then
    select id into existing from public.responses where client_id = p_client_id;
    if found then return existing; end if;
  end if;

  select * into s from public.surveys where id = p_survey;
  if not found then raise exception 'الاستبيان غير موجود'; end if;

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
  if pg_column_size(p_answers) > 8 * 1024 * 1024 then raise exception 'حجم الإجابة كبير جداً'; end if;

  -- نقبل حقولاً وصفية معروفة فقط، بأنواع محددة
  clean_meta := jsonb_strip_nulls(jsonb_build_object(
    'startedAt', case when jsonb_typeof(p_meta->'startedAt') = 'string' then p_meta->'startedAt' end,
    'endedAt', case when jsonb_typeof(p_meta->'endedAt') = 'string' then p_meta->'endedAt' end,
    'durationSec', case when jsonb_typeof(p_meta->'durationSec') = 'number' then p_meta->'durationSec' end,
    'queuedAt', case when jsonb_typeof(p_meta->'queuedAt') = 'string' then p_meta->'queuedAt' end,
    'offline', case when jsonb_typeof(p_meta->'offline') = 'boolean' then p_meta->'offline' end,
    'device', case when jsonb_typeof(p_meta->'device') = 'string' then to_jsonb(left(p_meta->>'device', 120)) end
  ));

  insert into public.responses (survey_id, answers, source, meta, client_id, history)
  values (p_survey, p_answers,
          case when p_source in ('link','preview') then p_source else 'link' end,
          clean_meta, p_client_id,
          jsonb_build_array(jsonb_build_object('at', now(), 'action', 'submitted',
                                               'by', case when public.is_admin() then 'مشرف' else 'مجهول' end)))
  on conflict (client_id) where client_id is not null do nothing
  returning id into new_id;

  if new_id is null then
    select id into new_id from public.responses where client_id = p_client_id;
  end if;
  return new_id;
end;
$$;

grant execute on function public.submit_response(uuid,jsonb,text,text,jsonb,uuid) to anon, authenticated;

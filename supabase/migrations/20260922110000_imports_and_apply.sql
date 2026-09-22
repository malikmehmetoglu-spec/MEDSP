-- سجل عمليات الاستيراد: من رفع ماذا ومتى، وما الذي تغيّر، ولقطة من الإجماليات
create table public.imports (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  file_name text not null default '',
  imported_at timestamptz not null default now(),
  imported_by text not null default '',
  summary jsonb not null default '{}'::jsonb,
  totals jsonb not null default '{}'::jsonb
);
create index imports_survey_idx on public.imports(survey_id, imported_at desc);
alter table public.imports enable row level security;
create policy imports_admin_all on public.imports
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- مجاميع اللقطة: الحقول من نوع عدد صحيح أو عشري فقط — جمع النسب والمحسوبة لا معنى له
create or replace function public.survey_totals(p_survey uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with fields as (
    select f #>> '{}' as name
    from public.surveys s,
         jsonb_path_query(s.pages, '$[*].children[*] ? (@.type == "integer" || @.type == "decimal").name') f
    where s.id = p_survey
  )
  select coalesce(jsonb_object_agg(f.name, t.s), '{}'::jsonb)
  from fields f
  left join lateral (
    select sum((r.answers ->> f.name)::numeric) s from public.responses r
    where r.survey_id = p_survey and r.status = 'approved' and jsonb_typeof(r.answers -> f.name) = 'number'
  ) t on true;
$$;
revoke all on function public.survey_totals(uuid) from public, anon;
grant execute on function public.survey_totals(uuid) to authenticated;

/*
  تطبيق استيراد دفعة واحدة — إما كله أو لا شيء.
    p_updates  [{ id, answers, changes: [{field, before, after}] }]
    p_inserts  [ answers, ... ]
    p_deletes  [ id, ... ]   — بقرار صريح من المستخدم فقط
    p_status   'approved' | 'pending'
*/
create or replace function public.apply_import(
  p_survey uuid, p_file text, p_updates jsonb, p_inserts jsonb, p_deletes uuid[],
  p_status text, p_summary jsonb)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  who text;
  u jsonb;
  import_id uuid;
  note text := 'تحديث من ملف: ' || coalesce(p_file, '');
begin
  if not public.is_admin() then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  if p_status not in ('approved', 'pending') then raise exception 'حالة غير صالحة'; end if;
  if not exists (select 1 from public.surveys where id = p_survey) then raise exception 'الاستبيان غير موجود'; end if;

  select coalesce(a.username, 'مشرف') into who from public.admins a where a.user_id = (select auth.uid());

  for u in select * from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb)) loop
    update public.responses r set
      answers = u->'answers',
      edited = true,
      status = p_status,
      reviewed_by = case when p_status = 'approved' then who else r.reviewed_by end,
      reviewed_at = case when p_status = 'approved' then now() else r.reviewed_at end,
      history = r.history || (
        select coalesce(jsonb_agg(jsonb_build_object('at', now(), 'action', 'updated', 'by', who,
                 'field', c->>'field', 'before', c->'before', 'after', c->'after', 'note', note)), '[]'::jsonb)
        from jsonb_array_elements(coalesce(u->'changes', '[]'::jsonb)) c)
    where r.id = (u->>'id')::uuid and r.survey_id = p_survey;
  end loop;

  insert into public.responses (survey_id, answers, status, source, reviewed_by, reviewed_at, meta, history)
  select p_survey, a, p_status, 'import',
         case when p_status = 'approved' then who end,
         case when p_status = 'approved' then now() end,
         jsonb_build_object('imported', true, 'file', p_file),
         jsonb_build_array(jsonb_build_object('at', now(), 'action', 'imported', 'by', who, 'note', note))
  from jsonb_array_elements(coalesce(p_inserts, '[]'::jsonb)) a;

  if p_deletes is not null and array_length(p_deletes, 1) > 0 then
    delete from public.responses where survey_id = p_survey and id = any(p_deletes);
  end if;

  insert into public.imports (survey_id, file_name, imported_by, summary, totals)
  values (p_survey, coalesce(p_file, ''), who, coalesce(p_summary, '{}'::jsonb), public.survey_totals(p_survey))
  returning id into import_id;

  return import_id;
end;
$$;

revoke all on function public.apply_import(uuid, text, jsonb, jsonb, uuid[], text, jsonb) from public, anon;
grant execute on function public.apply_import(uuid, text, jsonb, jsonb, uuid[], text, jsonb) to authenticated;

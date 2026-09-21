-- إضافة تاريخ الإرسال للتقرير العام (لعرض فترة جمع البيانات)
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
        'id', r.id, 'surveyId', r.survey_id, 'answers', r.answers,
        'submittedAt', r.submitted_at))
      from public.responses r join public.surveys s2 on s2.id = r.survey_id
      where s2.project_id = p.id and r.status = 'approved'), '[]'::jsonb)
  ) order by p.created_at desc), '[]'::jsonb)
  from public.projects p where p.published;
$$;

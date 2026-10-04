-- إجابات استبيان ترحيل الأنقاض المعتمدة، للعرض العام في تقرير «مشروع ترحيل الأنقاض».
-- الاستبيان يُعرَّف بـ report->>'feed' أو بوجود سؤال rt_volume (يبقى صحيحاً لو أُعيد حفظ إعدادات التقرير). الصور لا تُرسل (ثقيلة) — تبقى في مساحة العمل.
create or replace function public.rubble_transfer_feed()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'submittedAt', r.submitted_at,
    'answers', r.answers - 'rt_photo_before' - 'rt_photo_during' - 'rt_photo_after',
    'photos', (r.answers ? 'rt_photo_before') or (r.answers ? 'rt_photo_during') or (r.answers ? 'rt_photo_after')
  ) order by r.submitted_at), '[]'::jsonb)
  from public.responses r
  join public.surveys s on s.id = r.survey_id
  where (s.report->>'feed' = 'rubble-transfer' or s.pages::text like '%"rt_volume"%')
    and r.status = 'approved';
$$;

grant execute on function public.rubble_transfer_feed() to anon, authenticated;

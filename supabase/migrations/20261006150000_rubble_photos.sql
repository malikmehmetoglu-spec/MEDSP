-- صور إجابة واحدة معتمدة من الاستمارة الرسمية للأنقاض، للمعرض والأرشيف المصور.
create or replace function public.rubble_photos(rid uuid)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_array(r.answers->'rt_photo_before', r.answers->'rt_photo_during', r.answers->'rt_photo_after')
  from public.responses r join public.surveys s on s.id = r.survey_id
  where r.id = rid and r.status = 'approved'
    and (s.report->>'feed' = 'rubble-transfer' or s.pages::text like '%"rt_volume"%');
$$;
grant execute on function public.rubble_photos(uuid) to anon, authenticated;

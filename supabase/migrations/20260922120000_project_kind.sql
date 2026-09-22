-- نوعان من المشاريع:
--   survey  استبيان ميداني: بناء، مشاركة، تعبئة، مراجعة واعتماد
--   data    مشروع بيانات: يُنشأ ويُحدَّث من ملف Excel فقط، بلا استبيان ولا اعتماد
alter table public.projects
  add column kind text not null default 'survey' check (kind in ('survey', 'data'));

update public.projects set kind = 'data' where name = 'مشاريع ترحيل الأنقاض 2026';

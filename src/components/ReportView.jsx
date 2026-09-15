/*
  هيكل التقرير الموحّد لكل التصنيفات.
  المناطق الثلاث (الأرقام، الخريطة، الرسوم) جاهزة لاستقبال المحتوى
  فور اعتماد قائمة الإحصائيات وربط جدول البيانات.
*/

function Slot({ label, note, modifier }) {
  return (
    <section className={modifier ? `slot ${modifier}` : 'slot'}>
      <h3 className="slot__label">{label}</h3>
      <p className="slot__note">{note}</p>
    </section>
  );
}

export default function ReportView({ category }) {
  return (
    <article className="shell">
      <div className="report__head">
        <h1>تقرير {category.name}</h1>
        <span className="report__status">بانتظار البيانات</span>
      </div>

      <p className="report__summary">{category.summary}</p>

      <div className="report__grid">
        <Slot
          label="بطاقات الأرقام"
          note="المؤشرات الرئيسية للفترة المختارة، تتحدث تلقائياً عند رفع جدول البيانات."
        />

        <div className="report__row">
          <Slot
            modifier="slot--map"
            note="توزّع الحالات على الخريطة حسب إحداثيات كل بلاغ."
            label="الخريطة"
          />
          <Slot
            modifier="slot--charts"
            note="المقارنات الزمنية والتوزّع حسب النوع والمحافظة."
            label="الرسوم البيانية"
          />
        </div>
      </div>
    </article>
  );
}

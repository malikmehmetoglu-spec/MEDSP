import { href } from '../hooks/useRoute';

/*
  صفحة كل المشاريع المنشورة. كل بطاقة رابط حقيقي إلى تقرير المشروع،
  فيمكن نسخه وإرساله.
*/

const fmt = (n) => Number(n).toLocaleString('en-US');

export default function ProjectsTab({ projects, status }) {
  if (status === 'loading') return <div className="pending"><p>جارٍ التحميل…</p></div>;
  if (status === 'error') {
    return <div className="pending"><h3>تعذّر تحميل المشاريع</h3><p>حدّث الصفحة وحاول مجدداً.</p></div>;
  }
  if (projects.length === 0) {
    return (
      <div className="pending">
        <h3>لا توجد مشاريع منشورة بعد</h3>
        <p>تظهر هنا المشاريع الإحصائية بعد اعتماد بياناتها ونشرها.</p>
      </div>
    );
  }

  return (
    <div className="plist__grid">
      {projects.map((p) => (
        <a key={p.id} href={href.project(p.id)} className="pcard pcard--public pcard--link">
          <div className="pcard__head"><h3>{p.name}</h3></div>
          {p.description && <p className="pcard__desc">{p.description}</p>}
          <div className="pcard__stats">
            <span>{fmt(p.responses.length)} استمارة معتمدة</span>
            <span>{fmt(p.surveys.length)} {p.surveys.length === 1 ? 'استبيان' : 'استبيانات'}</span>
          </div>
          <span className="pcard__go">عرض التقرير ←</span>
        </a>
      ))}
    </div>
  );
}

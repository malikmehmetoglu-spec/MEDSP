import { useEffect, useState } from 'react';
import { listPublishedProjects } from './store';
import ProjectReport from './ProjectReport';

/*
  تبويب المشاريع على الموقع العام.
  يعرض المشاريع المنشورة فقط، وفيها الإجابات المعتمدة فقط.
*/

export default function ProjectsTab({ basemap }) {
  const [projects, setProjects] = useState(null);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    listPublishedProjects().then(setProjects);
  }, []);

  if (projects === null) {
    return <div className="pending"><p>جارٍ التحميل…</p></div>;
  }

  if (projects.length === 0) {
    return (
      <div className="pending">
        <h3>لا توجد مشاريع منشورة</h3>
        <p>تظهر هنا المشاريع الإحصائية بعد اعتماد بياناتها ونشرها.</p>
      </div>
    );
  }

  const open = projects.find((p) => p.id === openId);

  if (open) {
    return (
      <div className="pview">
        <button type="button" className="q-btn" onClick={() => setOpenId(null)}>
          ← كل المشاريع
        </button>
        <div className="report__head">
          <h1>{open.name}</h1>
        </div>
        {open.description && <p className="report__summary">{open.description}</p>}
        <ProjectReport project={open} basemap={basemap} />
      </div>
    );
  }

  return (
    <div className="plist__grid">
      {projects.map((p) => (
        <article className="pcard pcard--public" key={p.id}>
          <div className="pcard__head"><h3>{p.name}</h3></div>
          {p.description && <p className="pcard__desc">{p.description}</p>}
          <div className="pcard__stats">
            <span>{p.responses.length} سجلاً معتمداً</span>
            <span>{p.surveys.length} استبيان</span>
          </div>
          <button type="button" className="q-btn" onClick={() => setOpenId(p.id)}>
            عرض التقرير
          </button>
        </article>
      ))}
    </div>
  );
}

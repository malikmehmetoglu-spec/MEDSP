import { useEffect, useState } from 'react';
import Masthead from './components/Masthead';
import CategoryTabs from './components/CategoryTabs';
import FireReport from './components/FireReport';
import Footer from './components/Footer';
import { categories } from './data/categories';

const ar = (n) => Number(n).toLocaleString('en-US');

function Pending({ category }) {
  return (
    <div className="pending">
      <h3>التقرير قيد الإعداد</h3>
      <p>
        بيانات {category.name} متوفرة في ملف التصدير الشهري. يُبنى التقرير فور اعتماد
        قائمة الإحصائيات المطلوبة لهذا التصنيف.
      </p>
    </div>
  );
}

export default function App() {
  const [activeId, setActiveId] = useState(categories[0].id);
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    Promise.all([
      fetch('data/overview.json').then((r) => r.json()),
      fetch('data/fire.json').then((r) => r.json()),
      fetch('data/basemap.json').then((r) => r.json()),
    ])
      .then(([overview, fire, basemap]) => setState({ status: 'ready', overview, fire, basemap }))
      .catch(() => setState({ status: 'error' }));
  }, []);

  const active = categories.find((c) => c.id === activeId) ?? categories[0];
  const count =
    state.status === 'ready'
      ? state.overview.byOperation.find((o) => o.label === active.op)?.value ?? 0
      : null;

  return (
    <div className="layout">
      <Masthead period={state.status === 'ready' ? state.overview.period : null} />
      <CategoryTabs items={categories} activeId={activeId} onSelect={setActiveId} />

      <main>
        <article className="shell">
          <div className="report__head">
            <h1>تقرير {active.name}</h1>
            {count !== null && (
              <span className="report__status">{ar(count)} عملية مسجّلة</span>
            )}
          </div>
          <p className="report__summary">{active.summary}</p>

          {state.status === 'loading' && <div className="pending"><p>جارٍ تحميل البيانات…</p></div>}

          {state.status === 'error' && (
            <div className="pending">
              <h3>تعذّر تحميل البيانات</h3>
              <p>تأكد من وجود ملفات البيانات في مجلد public/data، ثم نفّذ الأمر npm run data.</p>
            </div>
          )}

          {state.status === 'ready' && active.ready && (
            <FireReport data={state.fire} basemap={state.basemap} />
          )}

          {state.status === 'ready' && !active.ready && <Pending category={active} />}
        </article>
      </main>

      <Footer />
    </div>
  );
}

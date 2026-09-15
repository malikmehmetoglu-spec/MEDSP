import { useEffect, useState } from 'react';
import Masthead from './components/Masthead';
import CategoryTabs from './components/CategoryTabs';
import ReportShell from './components/ReportShell';
import Footer from './components/Footer';
import { categories } from './data/categories';
import { REPORT_VIEWS } from './data/reportViews';

const ar = (n) => Number(n).toLocaleString('en-US');

export default function App() {
  const [activeId, setActiveId] = useState(categories[0].id);
  const [base, setBase] = useState({ status: 'loading' });
  /* تُحمّل بيانات كل تقرير عند فتحه أول مرة فقط، ثم تُحفظ */
  const [reports, setReports] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch('data/overview.json').then((r) => r.json()),
      fetch('data/basemap.json').then((r) => r.json()),
    ])
      .then(([overview, basemap]) => setBase({ status: 'ready', overview, basemap }))
      .catch(() => setBase({ status: 'error' }));
  }, []);

  useEffect(() => {
    if (reports[activeId]) return;
    let cancelled = false;

    fetch(`data/${activeId}.json`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setReports((prev) => ({ ...prev, [activeId]: data }));
      })
      .catch(() => {
        if (!cancelled) setError(activeId);
      });

    return () => {
      cancelled = true;
    };
  }, [activeId, reports]);

  const active = categories.find((c) => c.id === activeId) ?? categories[0];
  const report = reports[activeId];
  const view = REPORT_VIEWS[activeId];

  const count =
    base.status === 'ready'
      ? base.overview.byOperation.find((o) => o.label === active.op)?.value ?? 0
      : null;

  const loading = base.status === 'loading' || (!report && error !== activeId);
  const failed = base.status === 'error' || error === activeId;

  return (
    <div className="layout">
      <Masthead period={base.status === 'ready' ? base.overview.period : null} />
      <CategoryTabs items={categories} activeId={activeId} onSelect={setActiveId} />

      <main>
        <article className="shell">
          <div className="report__head">
            <h1>تقرير {active.name}</h1>
          </div>
          <p className="report__summary">{active.summary}</p>

          {loading && (
            <div className="pending">
              <p>جارٍ تحميل البيانات…</p>
            </div>
          )}

          {failed && (
            <div className="pending">
              <h3>تعذّر تحميل البيانات</h3>
              <p>تأكد من وجود ملف التصدير في مجلد data داخل المستودع.</p>
            </div>
          )}

          {!loading && !failed && report && count === 0 && (
            <div className="pending">
              <h3>لا توجد عمليات مسجّلة</h3>
              <p>لم تُسجَّل أي عملية من هذا النوع ضمن الفترة المتاحة.</p>
            </div>
          )}

          {!loading && !failed && report && count > 0 && (
            <ReportShell
              key={activeId}
              report={report}
              basemap={base.basemap}
              view={view}
            />
          )}
        </article>
      </main>

      <Footer />
    </div>
  );
}

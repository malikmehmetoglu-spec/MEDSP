import { useEffect, useState } from 'react';
import Masthead from './components/Masthead';
import CategoryTabs from './components/CategoryTabs';
import ReportShell from './components/ReportShell';
import Home from './components/Home';
import Footer from './components/Footer';
import { categories } from './data/categories';
import { REPORT_VIEWS } from './data/reportViews';
import useTheme from './hooks/useTheme';
import ProjectsTab from './projects/ProjectsTab';
import AdminApp from './admin/AdminApp';
import FillPage from './projects/FillPage';
import AuthGate from './admin/AuthGate';

const PROJECTS_TAB = '__projects__';

/* توجيه بسيط بالمسار المجزّأ: #/admin يفتح مساحة العمل الإدارية */
function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme();
  const hash = useHashRoute();
  const [activeId, setActiveId] = useState('overview');
  const [base, setBase] = useState({ status: 'loading' });
  /* تُحمّل بيانات كل تقرير عند فتحه أول مرة فقط، ثم تُحفظ */
  const [reports, setReports] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch('data/summary.json').then((r) => r.json()),
      fetch('data/basemap.json').then((r) => r.json()),
    ])
      .then(([overview, basemap]) => setBase({ status: 'ready', overview, basemap }))
      .catch(() => setBase({ status: 'error' }));
  }, []);

  useEffect(() => {
    if (activeId === PROJECTS_TAB || reports[activeId]) return;
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

  const isHome = activeId === 'overview';
  const isProjects = activeId === PROJECTS_TAB;
  const active = isHome
    ? {
        id: 'overview',
        name: 'النظرة العامة',
        summary: 'ملخّص كل عمليات الوزارة المسجّلة في الفترة المختارة.',
      }
    : categories.find((c) => c.id === activeId) ?? categories[0];
  const report = reports[activeId];
  const view = REPORT_VIEWS[activeId];

  const count =
    base.status === 'ready' && !isHome
      ? base.overview.byOperation.find((o) => o.label === active.op)?.value ?? 0
      : null;

  const loading = base.status === 'loading' || (!report && error !== activeId);
  const failed = base.status === 'error' || error === activeId;

  /* رابط تعبئة عام: #/s/<id> — صفحة مستقلة بلا تبويبات ولا بيانات إدارية */
  const fillMatch = hash.match(/^#\/s\/([\w-]+)/);
  if (fillMatch) {
    return (
      <div className="layout">
        <Masthead theme={theme} onToggleTheme={toggleTheme} />
        <main><FillPage surveyId={fillMatch[1]} /></main>
        <Footer />
      </div>
    );
  }

  /* مساحة العمل الإدارية — خلف تسجيل الدخول */
  if (hash.startsWith('#/admin')) {
    return (
      <div className="layout">
        <Masthead theme={theme} onToggleTheme={toggleTheme} />
        <main>
          <AuthGate>
            {({ me, signOut }) => (
              <>
                <div className="adminbar">
                  <div className="shell adminbar__inner">
                    <span className="adminbar__label">مساحة العمل</span>
                    <span className="adminbar__user">
                      <span>{me.displayName}</span>
                      <button type="button" className="adminbar__exit" onClick={signOut}>خروج</button>
                      <a className="adminbar__exit" href="#/">الموقع العام</a>
                    </span>
                  </div>
                </div>
                <AdminApp basemap={base.basemap} me={me} />
              </>
            )}
          </AuthGate>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="layout">
      <Masthead theme={theme} onToggleTheme={toggleTheme} />
      <CategoryTabs
        items={[
          { id: 'overview', name: 'النظرة العامة' },
          ...categories,
          /* المشاريع الإحصائية — مؤقت لعرض محرك الاستبيانات */
          { id: PROJECTS_TAB, name: 'المشاريع الإحصائية', apart: true },
        ]}
        activeId={activeId}
        onSelect={setActiveId}
      />

      <main>
        {isProjects ? (
          <section className="shell">
            <div className="report__head"><h1>المشاريع الإحصائية</h1></div>
            <p className="report__summary">
              تقارير تفاعلية مبنية على بيانات ميدانية معتمدة.
            </p>
            <ProjectsTab basemap={base.basemap} />
          </section>
        ) : (
        <article className="shell">
          <div className="report__head">
            <h1>{isHome ? 'النظرة العامة' : `تقرير ${active.name}`}</h1>
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

          {!loading && !failed && report && isHome && (
            <Home report={report} basemap={base.basemap} onOpen={setActiveId} />
          )}

          {!loading && !failed && report && !isHome && count === 0 && (
            <div className="pending">
              <h3>لا توجد عمليات مسجّلة</h3>
              <p>لم تُسجَّل أي عملية من هذا النوع ضمن الفترة المتاحة.</p>
            </div>
          )}

          {!loading && !failed && report && !isHome && count > 0 && (
            <ReportShell
              key={activeId}
              report={report}
              basemap={base.basemap}
              view={view}
            />
          )}
        </article>
        )}
      </main>

      <Footer />
    </div>
  );
}

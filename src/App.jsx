import { useEffect, useState } from 'react';
import Masthead from './components/Masthead';
import MainNav from './components/MainNav';
import ReportShell from './components/ReportShell';
import Home from './components/Home';
import Footer from './components/Footer';
import { categories } from './data/categories';
import { REPORT_VIEWS } from './data/reportViews';
import useTheme from './hooks/useTheme';
import ProjectsTab from './projects/ProjectsTab';
import ProjectReport from './projects/ProjectReport';
import { listPublishedProjects } from './projects/store';
import useRoute, { href } from './hooks/useRoute';
import AdminApp from './admin/AdminApp';
import FillPage from './projects/FillPage';
import AuthGate from './admin/AuthGate';

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme();
  const route = useRoute();
  /* التقرير الظاهر يُشتق من الرابط */
  const activeId = route.page === 'ops' ? route.id : 'overview';
  const [projects, setProjects] = useState({ status: 'loading', list: [] });
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

  /* المشاريع المنشورة — لقائمة التنقل ولصفحات المشاريع */
  useEffect(() => {
    listPublishedProjects()
      .then((list) => setProjects({ status: 'ready', list }))
      .catch(() => setProjects({ status: 'error', list: [] }));
  }, []);

  useEffect(() => {
    if (route.page !== 'overview' && route.page !== 'ops') return;
    if (route.page === 'ops' && !categories.some((c) => c.id === activeId)) return;
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
  }, [activeId, reports, route.page]);

  const isHome = route.page === 'overview';
  const unknownOp = route.page === 'ops' && !categories.some((c) => c.id === route.id);
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

  /* بنود قائمة العمليات: أيقونة كل تقرير وعدد عملياته */
  const ops = categories.map((c) => ({
    id: c.id,
    name: c.name,
    icon: REPORT_VIEWS[c.id]?.icon || 't_textarea',
    count: base.status === 'ready'
      ? base.overview.byOperation.find((o) => o.label === c.op)?.value ?? 0
      : null,
  }));

  const currentProject = route.page === 'project'
    ? projects.list.find((p) => p.id === route.id)
    : null;

  /* عنوان تبويب المتصفح — يظهر عند مشاركة الرابط */
  useEffect(() => {
    const site = 'منصة مديرية التخطيط والإحصاء';
    let page = '';
    if (route.page === 'ops' && !unknownOp) page = `تقرير ${active.name}`;
    else if (route.page === 'projects') page = 'المشاريع الإحصائية';
    else if (route.page === 'project' && currentProject) page = currentProject.name;
    else if (route.page === 'admin') page = 'مساحة العمل';
    document.title = page ? `${page} — ${site}` : `${site} — وزارة الطوارئ وإدارة الكوارث`;
  }, [route, active.name, currentProject, unknownOp]);

  /* رابط تعبئة عام: #/s/<id> — صفحة مستقلة بلا تبويبات ولا بيانات إدارية */
  if (route.page === 'fill') {
    return (
      <div className="layout">
        <Masthead theme={theme} onToggleTheme={toggleTheme} />
        <main><FillPage surveyId={route.id} /></main>
        <Footer />
      </div>
    );
  }

  /* مساحة العمل الإدارية — خلف تسجيل الدخول */
  if (route.page === 'admin') {
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
      <Masthead theme={theme} onToggleTheme={toggleTheme} showLogin />
      <MainNav route={route} ops={ops} projects={projects.list} projectsStatus={projects.status} />

      <main>
        {route.page === 'projects' && (
          <section className="shell">
            <div className="report__head"><h1>المشاريع الإحصائية</h1></div>
            <p className="report__summary">تقارير تفاعلية مبنية على بيانات ميدانية معتمدة.</p>
            <ProjectsTab projects={projects.list} status={projects.status} />
          </section>
        )}

        {route.page === 'project' && (
          <section className="shell">
            {projects.status === 'loading' && <div className="pending"><p>جارٍ التحميل…</p></div>}
            {projects.status !== 'loading' && !currentProject && (
              <div className="pending">
                <h3>المشروع غير متاح</h3>
                <p>ربما أُلغي نشره أو أن الرابط غير صحيح.</p>
                <a className="q-btn" href={href.projects()}>كل المشاريع</a>
              </div>
            )}
            {currentProject && (
              <>
                <div className="report__head"><h1>{currentProject.name}</h1></div>
                {currentProject.description && (
                  <p className="report__summary">{currentProject.description}</p>
                )}
                <ProjectReport project={currentProject} basemap={base.basemap} />
              </>
            )}
          </section>
        )}

        {unknownOp && (
          <section className="shell">
            <div className="pending">
              <h3>التقرير غير موجود</h3>
              <p>تحقق من الرابط، أو اختر تقريراً من قائمة العمليات.</p>
              <a className="q-btn" href={href.overview()}>النظرة العامة</a>
            </div>
          </section>
        )}

        {(route.page === 'overview' || (route.page === 'ops' && !unknownOp)) && (
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
            <Home report={report} basemap={base.basemap} onOpen={(id) => { window.location.hash = href.ops(id); }} />
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

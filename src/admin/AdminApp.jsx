import { useCallback, useEffect, useMemo, useState } from 'react';
import * as store from '../projects/store';
import SurveyBuilder from './SurveyBuilder';
import ResponsesTable from './ResponsesTable';
import SharePanel from './SharePanel';
import AccountsPanel from './AccountsPanel';
import MyAccount from './MyAccount';
import ReportDesigner from './ReportDesigner';
import ImportWizard from './importer/ImportWizard';
import SurveyPage from '../survey/SurveyPage';

/*
  مساحة العمل الإدارية.

  تنبيه أمني: لا يوجد تسجيل دخول بعد — أي شخص يعرف المسار #/admin
  يصل إلى هنا. هذه مرحلة تجربة، والمصادقة والصلاحيات مرحلة لاحقة.
  لا تُدخَل بيانات حقيقية قبل بنائها.
*/

const TABS = [
  { id: 'build', label: 'بناء الاستبيان' },
  { id: 'import', label: 'رفع ملف' },
  { id: 'share', label: 'المشاركة' },
  { id: 'results', label: 'النتائج' },
  { id: 'report', label: 'تصميم التقرير' },
  { id: 'preview', label: 'معاينة التعبئة' },
];

function useAreas(basemap) {
  return useMemo(() => {
    if (!basemap) return null;
    return {
      gov: new Map(basemap.governorates.map((g) => [g.code, g])),
      sub: new Map(basemap.subdistricts.map((s) => [s.code, s])),
    };
  }, [basemap]);
}

/* ---------------- قائمة المشاريع ---------------- */

function ProjectList({ projects, counts, onOpen, onCreate, onDelete }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [adding, setAdding] = useState(false);

  const [fromFile, setFromFile] = useState(false);
  const submit = async () => {
    if (!name.trim()) return;
    await onCreate({ name, description: desc, fromFile });
    setName('');
    setDesc('');
    setAdding(false);
  };

  return (
    <div className="plist">
      <div className="plist__head">
        <h2>المشاريع الإحصائية</h2>
        <button type="button" className="survey__navbtn survey__navbtn--primary" onClick={() => setAdding(!adding)}>
          {adding ? 'إلغاء' : '+ مشروع جديد'}
        </button>
      </div>

      {adding && (
        <div className="plist__form">
          <label className="bf">
            <span className="bf__label">اسم المشروع</span>
            <input className="q-input bf__input" value={name} autoFocus
              onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="bf">
            <span className="bf__label">وصف مختصر</span>
            <input className="q-input bf__input" value={desc}
              onChange={(e) => setDesc(e.target.value)} />
          </label>
          <div className="rd-chips" role="radiogroup" aria-label="طريقة البدء">
            <button type="button" role="radio" aria-checked={!fromFile} className={`rd-chip${!fromFile ? ' is-on' : ''}`}
              onClick={() => setFromFile(false)}>أبني استبياناً</button>
            <button type="button" role="radio" aria-checked={fromFile} className={`rd-chip${fromFile ? ' is-on' : ''}`}
              onClick={() => setFromFile(true)}>عندي ملف Excel جاهز</button>
          </div>
          <button type="button" className="survey__navbtn survey__navbtn--primary" onClick={submit}>
            {fromFile ? 'إنشاء ثم رفع الملف' : 'إنشاء'}
          </button>
        </div>
      )}

      {projects.length === 0 && !adding && (
        <p className="results__empty">لا توجد مشاريع بعد. ابدأ بإنشاء مشروع.</p>
      )}

      <div className="plist__grid">
        {projects.map((p) => {
          const c = counts[p.id] || { surveys: 0, pending: 0, approved: 0 };
          return (
            <article className="pcard" key={p.id}>
              <div className="pcard__head">
                <h3>{p.name}</h3>
                {p.published
                  ? <span className="tag tag--approved">منشور</span>
                  : <span className="tag">غير منشور</span>}
              </div>
              {p.description && <p className="pcard__desc">{p.description}</p>}
              <div className="pcard__stats">
                <span>{c.surveys} استبيان</span>
                <span>{c.approved} معتمد</span>
                {c.pending > 0 && <span className="pcard__pending">{c.pending} بانتظار المراجعة</span>}
              </div>
              {!p.published && (
                <p className="pcard__why">
                  {c.approved === 0
                    ? (c.pending > 0
                      ? `لا يظهر للعامة: اعتمد السجلات (${c.pending}) ثم انشر.`
                      : 'لا يظهر للعامة: لا توجد سجلات بعد.')
                    : 'لا يظهر للعامة: افتح المشروع واضغط «نشر على الصفحة الرئيسية».'}
                </p>
              )}
              <div className="pcard__actions">
                <button type="button" className="q-btn" onClick={() => onOpen(p.id)}>فتح</button>
                <button type="button" className="q-btn q-btn--danger q-btn--sm"
                  onClick={() => onDelete(p.id)}>حذف</button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- محرر المشروع ---------------- */

function ProjectEditor({ projectId, basemap, onBack, onChanged, initialTab = 'build' }) {
  const areas = useAreas(basemap);
  const [project, setProject] = useState(null);
  const [surveys, setSurveys] = useState([]);
  const [activeSurvey, setActiveSurvey] = useState(null);
  const [responses, setResponses] = useState([]);
  const [tab, setTab] = useState(initialTab);
  const [draft, setDraft] = useState(null);
  const [saved, setSaved] = useState(true);
  const [notice, setNotice] = useState('');
  /* إرشاد يبقى حتى يُغلق — للخطوات التي تحتاج فعلاً من المستخدم */
  const [guide, setGuide] = useState(null);

  const load = useCallback(async () => {
    const p = await store.getProject(projectId);
    const s = await store.listSurveys(projectId);
    setProject(p);
    setSurveys(s);
    setActiveSurvey((prev) => prev && s.some((x) => x.id === prev) ? prev : s[0]?.id ?? null);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!activeSurvey) { setDraft(null); setResponses([]); return; }
    const s = surveys.find((x) => x.id === activeSurvey);
    setDraft(s ? JSON.parse(JSON.stringify(s)) : null);
    setSaved(true);
    store.listResponses({ surveyId: activeSurvey }).then(setResponses);
  }, [activeSurvey, surveys]);

  const refreshResponses = useCallback(async () => {
    if (!activeSurvey) return;
    setResponses(await store.listResponses({ surveyId: activeSurvey }));
    onChanged?.();
  }, [activeSurvey, onChanged]);

  /*
    الإجابات تصل من أجهزة الباحثين في أي وقت، فنعيد جلبها عند كل فتح
    لتبويب النتائج أو التقرير — وإلا عرضت الشاشة صورة قديمة مضلّلة.
  */
  useEffect(() => {
    if (tab === 'results' || tab === 'report' || tab === 'import') refreshResponses();
  }, [tab, refreshResponses]);

  const addSurvey = async () => {
    const s = await store.createSurvey(projectId);
    await load();
    setActiveSurvey(s.id);
    setTab('build');
  };

  const saveSurvey = async () => {
    await store.updateSurvey(draft.id, {
      title: draft.title, description: draft.description, pages: draft.pages, report: draft.report || {},
    });
    setSaved(true);
    setNotice('حُفظ الاستبيان');
    setTimeout(() => setNotice(''), 2000);
    await load();
  };

  const removeSurvey = async (id) => {
    await store.deleteSurvey(id);
    await load();
  };

  const togglePublish = async () => {
    const next = !project.published;

    /*
      قبل النشر نفحص حالة المشروع كله ونشرح الخطوة التالية بدقة —
      القاعدة نفسها تفرضها قاعدة البيانات، هذا للإرشاد فقط.
    */
    if (next) {
      const all = await store.listResponses({ projectId });
      const approvedN = all.filter((r) => r.status === 'approved').length;
      const pendingN = all.filter((r) => r.status === 'pending').length;
      if (approvedN === 0) {
        setGuide(pendingN > 0
          ? {
            text: `لديك ${pendingN} ${pendingN === 1 ? 'استمارة' : 'استمارات'} بانتظار المراجعة. اعتمد واحدة على الأقل ثم انشر — التقرير المنشور يعرض المعتمد فقط.`,
            action: { label: 'اذهب للمراجعة', go: () => setTab('results') },
          }
          : {
            text: 'لم تصل أي استمارة بعد، فلا يوجد ما يُعرض في التقرير. اجمع إجابات وأرسل رابط الاستبيان للباحثين، أو جرّب بنفسك من «معاينة التعبئة»، ثم اعتمدها من «النتائج».',
            action: { label: 'افتح المشاركة', go: () => setTab('share') },
          });
        return;
      }
    }

    try {
      await store.publishProject(projectId, next);
      await load();
      onChanged?.();
      setNotice(next ? 'نُشر المشروع على الصفحة الرئيسية' : 'أُلغي النشر');
      setTimeout(() => setNotice(''), 2600);
    } catch (err) {
      setNotice(err.message);
      setTimeout(() => setNotice(''), 3500);
    }
  };

  if (!project) return <p className="results__empty">جارٍ التحميل…</p>;

  const approved = responses.filter((r) => r.status === 'approved');
  const pending = responses.filter((r) => r.status === 'pending').length;

  return (
    <div className="pedit">
      <div className="pedit__top">
        <button type="button" className="q-btn" onClick={onBack}>← المشاريع</button>
        <h2>{project.name}</h2>
        <div className="pedit__topright">
          {pending > 0 && <span className="tag tag--pending">{pending} بانتظار المراجعة</span>}
          <button
            type="button"
            className={`survey__navbtn${project.published ? '' : ' survey__navbtn--primary'}`}
            onClick={togglePublish}
          >
            {project.published ? 'إلغاء النشر' : 'نشر على الصفحة الرئيسية'}
          </button>
        </div>
      </div>

      {notice && <p className="pedit__notice">{notice}</p>}

      {guide && (
        <div className="pguide" role="status">
          <strong>لا يمكن النشر بعد</strong>
          <p>{guide.text}</p>
          <div className="pguide__actions">
            {guide.action && (
              <button type="button" className="survey__navbtn survey__navbtn--primary"
                onClick={() => { guide.action.go(); setGuide(null); }}>
                {guide.action.label}
              </button>
            )}
            <button type="button" className="q-btn" onClick={() => setGuide(null)}>حسناً</button>
          </div>
        </div>
      )}

      <div className="pedit__surveys">
        {surveys.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`pedit__stab${s.id === activeSurvey ? ' is-on' : ''}`}
            onClick={() => setActiveSurvey(s.id)}
          >
            {s.title}
          </button>
        ))}
        <button type="button" className="q-btn q-btn--add q-btn--sm" onClick={addSurvey}>
          + استبيان
        </button>
      </div>

      {!activeSurvey ? (
        <p className="results__empty">أضف استبياناً للبدء.</p>
      ) : (
        <>
          <div className="pedit__tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`pedit__tab${tab === t.id ? ' is-on' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                {t.id === 'results' && responses.length > 0 && (
                  <span className="results__badge">{responses.length}</span>
                )}
              </button>
            ))}
            {(tab === 'results' || tab === 'report') && (
              <button type="button" className="q-btn q-btn--sm pedit__refresh" onClick={refreshResponses}>
                تحديث
              </button>
            )}
          </div>

          {tab === 'build' && draft && (
            <>
              <SurveyBuilder
                survey={draft}
                onChange={(next) => { setDraft(next); setSaved(false); }}
                actions={(
                  <>
                    <button type="button" className="bx-save" onClick={saveSurvey} disabled={saved}>
                      {saved ? 'محفوظ' : 'حفظ التغييرات'}
                    </button>
                    <button type="button" className="bx-mini bx-mini--del bx-delsurvey" title="حذف الاستبيان"
                      aria-label="حذف الاستبيان"
                      onClick={() => { if (window.confirm('حذف الاستبيان مع كل إجاباته نهائياً؟')) removeSurvey(activeSurvey); }}>
                      ✕
                    </button>
                  </>
                )}
              />
            </>
          )}

          {tab === 'import' && draft && (
            <ImportWizard
              key={activeSurvey}
              survey={surveys.find((x) => x.id === activeSurvey) || draft}
              existing={responses}
              basemap={basemap}
              published={project.published}
              onApplied={async () => { await load(); await refreshResponses(); }}
            />
          )}

          {tab === 'share' && (
            <SharePanel
              survey={surveys.find((s) => s.id === activeSurvey)}
              onUpdate={async (cfg) => {
                await store.openSurveyLink(activeSurvey, cfg);
                await load();
                setNotice('حُدّثت إعدادات المشاركة');
                setTimeout(() => setNotice(''), 2000);
              }}
            />
          )}

          {tab === 'results' && draft && (
            <ResponsesTable
              responses={responses}
              survey={draft}
              areas={areas}
              onReview={async (id, status) => { await store.reviewResponse(id, status); refreshResponses(); }}
              onEdit={async (id, field, value) => { await store.editResponseAnswer(id, field, value); refreshResponses(); }}
              onDelete={async (id) => { await store.deleteResponse(id); refreshResponses(); }}
              onBulk={async (ids, status) => { await store.bulkReview(ids, status); refreshResponses(); }}
            />
          )}

          {tab === 'report' && draft && (
            <>
              <div className="rd-savebar">
                <span>{saved ? 'إعدادات التقرير محفوظة' : 'لديك تغييرات غير محفوظة في التقرير'}</span>
                <button type="button" className="bx-save" onClick={saveSurvey} disabled={saved}>
                  {saved ? 'محفوظ' : 'حفظ التغييرات'}
                </button>
              </div>
              <ReportDesigner
                project={project}
                survey={draft}
                responses={responses}
                basemap={basemap}
                onChange={(next) => { setDraft(next); setSaved(false); }}
              />
            </>
          )}

          {tab === 'preview' && draft && (
            <div className="pedit__preview">
              <p className="pedit__hint">
                هذه معاينة كما سيراها من يعبّي الاستبيان. الإرسال هنا يضيف إجابة فعلية للنتائج.
              </p>
              <SurveyPage
                key={JSON.stringify(draft.pages).length}
                definition={draft}
                onSubmit={async (answers, meta) => {
                  await store.createResponse(draft.id, answers, { source: 'preview', meta });
                  refreshResponses();
                }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ---------------- الجذر ---------------- */

export default function AdminApp({ basemap, me }) {
  const [section, setSection] = useState('projects');
  const [projects, setProjects] = useState([]);
  const [counts, setCounts] = useState({});
  const [open, setOpen] = useState(null);
  const [startTab, setStartTab] = useState('build');

  const refresh = useCallback(async () => {
    const list = await store.listProjects();
    setProjects(list);
    const map = {};
    const all = await store.listResponses();
    const surveys = await store.listSurveys();
    for (const p of list) {
      const ids = new Set(surveys.filter((s) => s.projectId === p.id).map((s) => s.id));
      const rows = all.filter((r) => ids.has(r.surveyId));
      map[p.id] = {
        surveys: ids.size,
        pending: rows.filter((r) => r.status === 'pending').length,
        approved: rows.filter((r) => r.status === 'approved').length,
      };
    }
    setCounts(map);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const sections = [
    { id: 'projects', label: 'المشاريع' },
    ...(me.role === 'super_admin' ? [{ id: 'accounts', label: 'الحسابات' }] : []),
    { id: 'me', label: 'حسابي' },
  ];

  return (
    <section className="shell admin">
      <nav className="asec" aria-label="أقسام مساحة العمل">
        {sections.map((s) => (
          <button key={s.id} type="button"
            className={`asec__item${section === s.id ? ' is-on' : ''}`}
            onClick={() => { setSection(s.id); setOpen(null); }}>
            {s.label}
          </button>
        ))}
      </nav>

      {section === 'accounts' && me.role === 'super_admin' && <AccountsPanel me={me} />}
      {section === 'me' && <MyAccount me={me} />}
      {section === 'projects' && (open ? (
        <ProjectEditor
          projectId={open}
          basemap={basemap}
          initialTab={startTab}
          onBack={() => { setOpen(null); setStartTab('build'); refresh(); }}
          onChanged={refresh}
        />
      ) : (
        <ProjectList
          projects={projects}
          counts={counts}
          onOpen={setOpen}
          onCreate={async (input) => {
            const p = await store.createProject(input);
            if (input.fromFile) {
              await store.createSurvey(p.id, { title: input.name, pages: [{ name: 'p1', title: 'البيانات', children: [] }] });
              setStartTab('import');
              setOpen(p.id);
            }
            refresh();
          }}
          onDelete={async (id) => {
            if (!window.confirm('حذف المشروع مع كل استبياناته وإجاباته نهائياً؟')) return;
            await store.deleteProject(id); refresh();
          }}
        />
      ))}
    </section>
  );
}

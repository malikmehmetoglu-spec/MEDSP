import { useCallback, useEffect, useMemo, useState } from 'react';
import * as store from '../projects/store';
import SurveyBuilder from './SurveyBuilder';
import ResponsesTable from './ResponsesTable';
import ProjectReport from '../projects/ProjectReport';
import SurveyPage from '../survey/SurveyPage';

/*
  مساحة العمل الإدارية.

  تنبيه أمني: لا يوجد تسجيل دخول بعد — أي شخص يعرف المسار #/admin
  يصل إلى هنا. هذه مرحلة تجربة، والمصادقة والصلاحيات مرحلة لاحقة.
  لا تُدخَل بيانات حقيقية قبل بنائها.
*/

const TABS = [
  { id: 'build', label: 'بناء الاستبيان' },
  { id: 'results', label: 'النتائج' },
  { id: 'report', label: 'التقرير' },
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

  const submit = async () => {
    if (!name.trim()) return;
    await onCreate({ name, description: desc });
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
          <button type="button" className="survey__navbtn survey__navbtn--primary" onClick={submit}>
            إنشاء
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
                {p.published && <span className="tag tag--approved">منشور</span>}
              </div>
              {p.description && <p className="pcard__desc">{p.description}</p>}
              <div className="pcard__stats">
                <span>{c.surveys} استبيان</span>
                <span>{c.approved} معتمد</span>
                {c.pending > 0 && <span className="pcard__pending">{c.pending} بانتظار المراجعة</span>}
              </div>
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

function ProjectEditor({ projectId, basemap, onBack, onChanged }) {
  const areas = useAreas(basemap);
  const [project, setProject] = useState(null);
  const [surveys, setSurveys] = useState([]);
  const [activeSurvey, setActiveSurvey] = useState(null);
  const [responses, setResponses] = useState([]);
  const [tab, setTab] = useState('build');
  const [draft, setDraft] = useState(null);
  const [saved, setSaved] = useState(true);
  const [notice, setNotice] = useState('');

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

  const refreshResponses = async () => {
    setResponses(await store.listResponses({ surveyId: activeSurvey }));
    onChanged?.();
  };

  const addSurvey = async () => {
    const s = await store.createSurvey(projectId);
    await load();
    setActiveSurvey(s.id);
    setTab('build');
  };

  const saveSurvey = async () => {
    await store.updateSurvey(draft.id, {
      title: draft.title, description: draft.description, pages: draft.pages,
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
    try {
      const next = !project.published;
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
          </div>

          {tab === 'build' && draft && (
            <>
              <SurveyBuilder
                survey={draft}
                onChange={(next) => { setDraft(next); setSaved(false); }}
              />
              <div className="pedit__save">
                <button
                  type="button"
                  className="survey__navbtn survey__navbtn--primary"
                  onClick={saveSurvey}
                  disabled={saved}
                >
                  {saved ? 'محفوظ' : 'حفظ الاستبيان'}
                </button>
                <button
                  type="button"
                  className="q-btn q-btn--danger"
                  onClick={() => removeSurvey(activeSurvey)}
                >
                  حذف الاستبيان
                </button>
              </div>
            </>
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
            approved.length === 0 ? (
              <p className="results__empty">
                لا توجد إجابات معتمدة بعد. اعتمد إجابات من تبويب النتائج ليظهر التقرير.
              </p>
            ) : (
              <ProjectReport
                project={{ ...project, surveys: [draft], responses: approved }}
                basemap={basemap}
              />
            )
          )}

          {tab === 'preview' && draft && (
            <div className="pedit__preview">
              <p className="pedit__hint">
                هذه معاينة كما سيراها من يعبّي الاستبيان. الإرسال هنا يضيف إجابة فعلية للنتائج.
              </p>
              <SurveyPage
                key={JSON.stringify(draft.pages).length}
                definition={draft}
                onSubmit={async (answers) => {
                  await store.createResponse(draft.id, answers, { source: 'preview' });
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

export default function AdminApp({ basemap }) {
  const [projects, setProjects] = useState([]);
  const [counts, setCounts] = useState({});
  const [open, setOpen] = useState(null);

  const refresh = useCallback(async () => {
    const list = await store.listProjects();
    setProjects(list);
    const map = {};
    for (const p of list) {
      const surveys = await store.listSurveys(p.id);
      const rows = await store.listResponses({ projectId: p.id });
      map[p.id] = {
        surveys: surveys.length,
        pending: rows.filter((r) => r.status === 'pending').length,
        approved: rows.filter((r) => r.status === 'approved').length,
      };
    }
    setCounts(map);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <section className="shell admin">
      {open ? (
        <ProjectEditor
          projectId={open}
          basemap={basemap}
          onBack={() => { setOpen(null); refresh(); }}
          onChanged={refresh}
        />
      ) : (
        <ProjectList
          projects={projects}
          counts={counts}
          onOpen={setOpen}
          onCreate={async (input) => { await store.createProject(input); refresh(); }}
          onDelete={async (id) => { await store.deleteProject(id); refresh(); }}
        />
      )}
    </section>
  );
}

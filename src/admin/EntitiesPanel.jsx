import { useEffect, useState } from 'react';
import * as store from '../projects/store';

/*
  إدارة سجل الجهات العاملة في قطاع الأنقاض: إضافة جهة، وتعديل أدوارها
  (دور أو أكثر)، وحذفها. كل تغيير يظهر فوراً في «إدارة الأنقاض ← الجهات العاملة».
*/

export const ROLES = ['مقاول تنفيذ', 'مورد آليات', 'مشغّل مكب', 'مشغّل تدوير', 'مستثمر', 'جهة إشرافية', 'مجلس محلي', 'جهة مانحة', 'جهة تقييم أضرار'];
const TYPES = ['شركة خاصة', 'جهة حكومية', 'مؤسسة عامة', 'مجلس محلي', 'منظمة'];
const GOVS = ['دمشق', 'ريف دمشق', 'حلب', 'حمص', 'حماة', 'اللاذقية', 'طرطوس', 'إدلب', 'دير الزور', 'الرقة', 'الحسكة', 'درعا', 'السويداء', 'القنيطرة'];
const BLANK = { name: '', aliases: [], type: '', roles: [], govs: [], contact: '', notes: '' };

function Chips({ all, value, onChange }) {
  return (
    <div className="ent-chips">
      {all.map((x) => (
        <button type="button" key={x} className={value.includes(x) ? 'is-on' : ''}
          onClick={() => onChange(value.includes(x) ? value.filter((v) => v !== x) : [...value, x])}>{x}</button>
      ))}
    </div>
  );
}

function Editor({ initial, onSave, onCancel }) {
  const [e, setE] = useState({ ...BLANK, ...initial });
  const [aliases, setAliases] = useState((initial?.aliases || []).join('، '));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (v) => setE((x) => ({ ...x, [k]: v }));
  const save = async () => {
    if (!e.name.trim()) { setErr('اسم الجهة مطلوب'); return; }
    if (!e.roles.length) { setErr('اختر دوراً واحداً على الأقل'); return; }
    setBusy(true); setErr('');
    try {
      await onSave({ ...e, aliases: aliases.split(/[،,\n]/).map((x) => x.trim()).filter(Boolean) });
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="ent-editor">
      <label><span>اسم الجهة</span><input className="q-input" value={e.name} onChange={(ev) => set('name')(ev.target.value)} autoFocus /></label>
      <label><span>تسميات بديلة <small>الصيغ الأخرى كما تُكتب في الاستمارات، مفصولة بفاصلة</small></span>
        <input className="q-input" value={aliases} onChange={(ev) => setAliases(ev.target.value)} /></label>
      <div><span className="ent-label">نوع الجهة</span><Chips all={TYPES} value={e.type ? [e.type] : []} onChange={(v) => set('type')(v[v.length - 1] || '')} /></div>
      <div><span className="ent-label">الأدوار <small>دور أو أكثر</small></span><Chips all={ROLES} value={e.roles} onChange={set('roles')} /></div>
      <div><span className="ent-label">المحافظات</span><Chips all={GOVS} value={e.govs} onChange={set('govs')} /></div>
      <label><span>التواصل</span><input className="q-input" value={e.contact} onChange={(ev) => set('contact')(ev.target.value)} /></label>
      <label><span>ملاحظات</span><textarea className="q-input" rows={2} value={e.notes} onChange={(ev) => set('notes')(ev.target.value)} /></label>
      {err && <p className="q-error">{err}</p>}
      <div className="ent-editor__actions">
        <button type="button" className="survey__navbtn survey__navbtn--primary" onClick={save} disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ'}</button>
        <button type="button" className="q-btn" onClick={onCancel}>إلغاء</button>
      </div>
    </div>
  );
}

export default function EntitiesPanel() {
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(null);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [error, setError] = useState('');

  const load = () => store.listEntities().then(setList).catch((x) => setError(x.message));
  useEffect(() => { load(); }, []);

  const save = async (e) => { await store.saveEntity(e); setEdit(null); await load(); };
  const remove = async (e) => {
    if (!window.confirm(`حذف «${e.name}» من السجل؟`)) return;
    try { await store.deleteEntity(e.id); await load(); } catch (x) { setError(x.message); }
  };

  if (error) return <p className="q-error">{error}</p>;
  if (!list) return <p className="results__empty">جارٍ التحميل…</p>;
  const shown = list.filter((e) => (!q || e.name.includes(q) || e.aliases.some((a) => a.includes(q))) && (!role || e.roles.includes(role)));

  return (
    <div className="ent">
      <div className="ent-head">
        <div>
          <h2>سجل الجهات العاملة في قطاع الأنقاض</h2>
          <p>صنّف كل جهة وحدّد أدوارها (يمكن للجهة الواحدة أكثر من دور). الجهات المنفذة الواردة في الاستمارات تظهر في التقرير تلقائياً، وهنا تُصنَّف وتُكمَّل.</p>
        </div>
        {!edit && <button type="button" className="survey__navbtn survey__navbtn--primary" onClick={() => setEdit({})}>+ جهة جديدة</button>}
      </div>

      {edit && <Editor initial={edit} onSave={save} onCancel={() => setEdit(null)} />}

      <div className="ent-bar">
        <input className="q-input" type="search" placeholder="ابحث باسم الجهة…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="ent-chips">
          <button type="button" className={!role ? 'is-on' : ''} onClick={() => setRole('')}>كل الأدوار <small>{list.length}</small></button>
          {ROLES.filter((r) => list.some((e) => e.roles.includes(r))).map((r) => (
            <button type="button" key={r} className={role === r ? 'is-on' : ''} onClick={() => setRole(role === r ? '' : r)}>
              {r} <small>{list.filter((e) => e.roles.includes(r)).length}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="ent-list">
        {shown.map((e) => (
          <article key={e.id} className="ent-row">
            <div className="ent-row__main">
              <b>{e.name}</b>
              <span>{[e.type, e.govs.join('، ')].filter(Boolean).join(' · ') || '—'}</span>
              {e.aliases.length > 0 && <small>يُكتب أيضاً: {e.aliases.join('، ')}</small>}
            </div>
            <div className="ent-row__roles">{e.roles.map((r) => <span key={r}>{r}</span>)}</div>
            <div className="ent-row__act">
              <button type="button" className="q-btn q-btn--sm" onClick={() => setEdit(e)}>تعديل</button>
              <button type="button" className="q-btn q-btn--sm q-btn--danger" onClick={() => remove(e)}>حذف</button>
            </div>
          </article>
        ))}
        {shown.length === 0 && <p className="results__empty">لا جهات بعد. أضف أول جهة.</p>}
      </div>
    </div>
  );
}

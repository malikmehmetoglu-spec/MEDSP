import { useEffect, useMemo, useRef, useState } from 'react';
import {
  sheetToGrid, detectHeader, extractTable, inferType, governorateIndex, normalize,
} from './parse';
import { computeDiff, autoMap, suggestKeys } from './diff';
import { QUESTION_TYPES } from '../../survey/schema';
import * as store from '../../projects/store';
import Icon from '../../components/Icon';

/*
  معالج الاستيراد من Excel.

  وضعان:
    create  استبيان فارغ ← تُبنى أسئلته من أعمدة الملف، وتدخل الصفوف
    update  استبيان قائم ← تُطابق الأعمدة بأسئلته، وتُقارن الصفوف بسجلاته

  الملف يُقرأ في المتصفح ولا يُرفع لأي مكان — الذي يصل للخادم هو
  التغييرات بعد موافقتك عليها فقط.
*/

const fmt = (n) => Number(n).toLocaleString('en-US');
/* «صف واحد»، «صفان»، «5 صفوف»، «13 صفاً» */
const rowsText = (n) => (n === 1 ? 'صف واحد' : n === 2 ? 'صفان'
  : n % 100 >= 3 && n % 100 <= 10 ? `${fmt(n)} صفوف` : `${fmt(n)} صفاً`);
const cellText = (v) => (v instanceof Date ? v.toLocaleDateString('en-GB') : String(v));

const TYPE_LABEL = {
  number: 'رقم', ratio: 'نسبة', gov: 'محافظة', choice: 'فئات', text: 'نص', date: 'تاريخ',
};

/* النوع المقترح ← نوع السؤال */
const TO_QUESTION = {
  number: (t) => (t.integer ? 'integer' : 'decimal'), gov: () => 'admin_area', choice: () => 'select_one',
  text: () => 'text', date: () => 'date', ratio: () => 'decimal',
};

/* أي أسئلة يقبلها عمود من هذا النوع */
const COMPATIBLE = {
  number: ['integer', 'decimal', 'range'], ratio: ['decimal', 'integer'], gov: ['admin_area', 'select_one', 'text'],
  choice: ['select_one', 'text'], text: ['text', 'textarea', 'select_one'], date: ['date', 'datetime', 'text'],
};

/* الوحدة من العنوان: «الكمية المخططة (m3)» ← م³ */
function unitOf(name) {
  const m = String(name).match(/\(([^)]+)\)/);
  if (!m) return '';
  const u = m[1].trim();
  return /^m3$|^م3$/i.test(u) ? 'م³' : /^m2$|^م2$/i.test(u) ? 'م²' : u;
}
const cleanLabel = (name) => String(name).replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();

function Steps({ step }) {
  const list = ['الملف', 'الأعمدة', 'المقارنة', 'تم'];
  return (
    <ol className="imp-steps">
      {list.map((s, i) => (
        <li key={s} className={i === step ? 'is-on' : i < step ? 'is-done' : ''}>
          <span>{i < step ? '✓' : i + 1}</span>{s}
        </li>
      ))}
    </ol>
  );
}

/* ---------------- الخطوة ١: الملف ---------------- */

function FileStep({ onRead }) {
  const input = useRef(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  const read = async (file) => {
    if (!file) return;
    setError('');
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) { setError('الملف يجب أن يكون Excel (xlsx أو xls) أو CSV.'); return; }
    if (file.size > 15 * 1024 * 1024) { setError('الملف أكبر من 15 ميغابايت.'); return; }
    setBusy(true);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
      const sheets = wb.SheetNames
        .map((name) => ({ name, grid: sheetToGrid(XLSX, wb.Sheets[name]) }))
        .filter((s) => s.grid.some((r) => r.some((v) => v !== null && v !== '')));
      if (!sheets.length) throw new Error('الملف فارغ.');
      onRead({ file: file.name, sheets });
    } catch (e) {
      setError(e.message?.includes('فارغ') ? e.message : 'تعذّرت قراءة الملف. تأكد أنه ملف Excel سليم.');
    } finally { setBusy(false); }
  };

  return (
    <div className="imp-body">
      <button type="button" className={`imp-drop${drag ? ' is-drag' : ''}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); read(e.dataTransfer.files?.[0]); }}>
        <Icon name="t_image" className="imp-drop__icon" />
        <strong>{busy ? 'جارٍ قراءة الملف…' : 'اسحب ملف Excel هنا أو اضغط للاختيار'}</strong>
        <span>xlsx أو xls أو csv. يُقرأ على جهازك ولا يُرفع — لا يصل للخادم إلا ما توافق عليه.</span>
      </button>
      <input ref={input} type="file" hidden accept=".xlsx,.xls,.csv"
        onChange={(e) => { read(e.target.files?.[0]); e.target.value = ''; }} />
      {error && <p className="share__warn">{error}</p>}
    </div>
  );
}

/* ---------------- الخطوة ٢: الأعمدة ---------------- */

function ColumnsStep({ mode, source, survey, basemap, onNext, onBack }) {
  const govIdx = useMemo(() => governorateIndex(basemap), [basemap]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const grid = source.sheets[sheetIdx].grid;
  const [header, setHeader] = useState(() => detectHeader(grid));
  const table = useMemo(() => extractTable(grid, header), [grid, header]);
  const nodes = useMemo(() => survey.pages.flatMap((p) => p.children).filter((n) => !['note', 'repeat', 'calculate'].includes(n.type) && !n.derive), [survey]);

  const inferred = useMemo(() => Object.fromEntries(table.columns.map((c) => [
    c.index, inferType(c.name, table.rows.map((r) => r.values[c.index]), govIdx),
  ])), [table, govIdx]);

  /* الربط: update ← أسئلة موجودة. create ← أسئلة جديدة بالنوع المقترح (النسبة تُتجاهل افتراضياً) */
  const initial = () => (mode === 'update'
    ? autoMap(table.columns, nodes)
    : Object.fromEntries(table.columns.map((c) => [c.index, inferred[c.index]?.type === 'ratio' ? '' : `new:${c.index}`])));
  const [mapping, setMapping] = useState(initial);
  const [types, setTypes] = useState({});
  /* تغيير الورقة أو صف العناوين يغيّر معنى أرقام الأعمدة — فيُعاد الربط */
  useEffect(() => { setMapping(initial()); setTypes({}); }, [table]); // eslint-disable-line react-hooks/exhaustive-deps
  const [keys, setKeys] = useState(null);

  const effNodes = useMemo(() => {
    if (mode === 'update') return nodes;
    return table.columns.filter((c) => mapping[c.index]).map((c) => ({
      name: `new:${c.index}`, label: cleanLabel(c.name),
      type: types[c.index] || TO_QUESTION[inferred[c.index].type](inferred[c.index]),
    }));
  }, [mode, nodes, table, mapping, types, inferred]);

  const keyCandidates = effNodes.filter((n) => Object.values(mapping).includes(n.name) && ['select_one', 'admin_area', 'text'].includes(n.type));
  const activeKeys = keys ?? suggestKeys(table, mapping, effNodes, govIdx);
  const sample = (c) => table.rows.slice(0, 3).map((r) => r.values[c.index]).filter((v) => v !== null && v !== '')
    .map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 24)));

  const mappedCount = Object.values(mapping).filter(Boolean).length;

  return (
    <div className="imp-body">
      {source.sheets.length > 1 && (
        <label className="bx-field imp-inline"><span>الورقة</span>
          <select className="bx-input bx-select" value={sheetIdx}
            onChange={(e) => { const i = Number(e.target.value); setSheetIdx(i); setHeader(detectHeader(source.sheets[i].grid)); setKeys(null); }}>
            {source.sheets.map((s, i) => <option key={s.name} value={i}>{s.name}</option>)}
          </select>
        </label>
      )}

      <div className="imp-found">
        <span><b>{rowsText(table.rows.length)}</b></span>
        <span><b>{table.columns.length}</b> أعمدة</span>
        <label className="imp-inline">صف العناوين:
          <select className="bx-input bx-select imp-small" value={header}
            onChange={(e) => { setHeader(Number(e.target.value)); setKeys(null); }}>
            {grid.slice(0, 20).map((r, i) => (
              <option key={i} value={i}>{i + 1}: {r.filter((v) => v !== null && v !== '').slice(0, 3).map(cellText).join('، ').slice(0, 40) || '(فارغ)'}</option>
            ))}
          </select>
        </label>
        {table.skipped.length > 0 && (
          <span className="imp-skip">استُبعد: {table.skipped.map((s) => `الصف ${s.row} (${s.reason})`).join('، ')}</span>
        )}
      </div>

      <div className="imp-cols">
        {table.columns.map((c) => {
          const t = inferred[c.index];
          const target = mapping[c.index] || '';
          return (
            <div className={`imp-col${target ? '' : ' is-off'}`} key={c.index}>
              <div className="imp-col__head">
                <strong>{c.name}</strong>
                <span className={`imp-type imp-type--${t.type}`}>{TYPE_LABEL[t.type]}</span>
              </div>
              <div className="imp-col__sample">{sample(c).join(' ، ') || '—'}</div>
              {mode === 'update' ? (
                <select className="bx-input bx-select imp-small" value={target}
                  onChange={(e) => { setMapping({ ...mapping, [c.index]: e.target.value }); setKeys(null); }}>
                  <option value="">تجاهل هذا العمود</option>
                  {nodes.filter((n) => COMPATIBLE[t.type]?.includes(n.type)).map((n) => (
                    <option key={n.name} value={n.name}>← {n.label}</option>
                  ))}
                </select>
              ) : (
                <div className="imp-col__new">
                  <select className="bx-input bx-select imp-small" value={target ? (types[c.index] || TO_QUESTION[t.type](t)) : ''}
                    onChange={(e) => {
                      if (!e.target.value) setMapping({ ...mapping, [c.index]: '' });
                      else { setMapping({ ...mapping, [c.index]: `new:${c.index}` }); setTypes({ ...types, [c.index]: e.target.value }); }
                      setKeys(null);
                    }}>
                    <option value="">تجاهل هذا العمود</option>
                    {(COMPATIBLE[t.type] || ['text']).map((qt) => <option key={qt} value={qt}>سؤال: {QUESTION_TYPES[qt]?.label}</option>)}
                  </select>
                  {t.type === 'ratio' && !target && <small>نسبة محسوبة غالباً — تُضاف لاحقاً كحقل محسوب من الأعمدة.</small>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {mode === 'update' && keyCandidates.length > 0 && (
        <div className="imp-keys">
          <strong>كيف يُعرف أن صفاً في الملف هو نفسه سجل في المشروع؟</strong>
          <span>بتطابق هذه الأعمدة معاً:</span>
          <div className="rd-chips">
            {keyCandidates.map((n) => {
              const on = activeKeys.includes(n.name);
              return (
                <button key={n.name} type="button" className={`rd-chip${on ? ' is-on' : ''}`}
                  onClick={() => setKeys(on ? activeKeys.filter((k) => k !== n.name) : [...activeKeys, n.name])}>
                  {n.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="imp-actions">
        <button type="button" className="q-btn" onClick={onBack}>ملف آخر</button>
        <button type="button" className="bx-save" disabled={!mappedCount || (mode === 'update' && !activeKeys.length)}
          onClick={() => onNext({ table, mapping, keys: mode === 'update' ? activeKeys : [], effNodes, inferred })}>
          التالي: المقارنة
        </button>
      </div>
    </div>
  );
}

/* ---------------- الخطوة ٣: المقارنة ---------------- */

const show = (node, v, names) => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number') return fmt(Math.round(v * 100) / 100);
  if (node?.type === 'admin_area') return names.get(v.governorate) || v.governorate;
  return node?.choices?.find((c) => String(c.value) === String(v))?.label ?? String(v);
};

function DiffStep({ mode, survey, plan, existing, basemap, fileName, onBack, onDone, dataProject }) {
  const govIdx = useMemo(() => governorateIndex(basemap), [basemap]);
  const names = useMemo(() => new Map(basemap.governorates.map((g) => [g.code, g.name])), [basemap]);

  /* في وضع الإنشاء: أسئلة جديدة من الأعمدة */
  const built = useMemo(() => {
    if (mode !== 'create') return { survey, mapping: plan.mapping };
    const children = [];
    const mapping = {};
    plan.table.columns.forEach((c) => {
      if (!plan.mapping[c.index]) return;
      const node = plan.effNodes.find((n) => n.name === `new:${c.index}`);
      const name = `q${children.length + 1}`;
      const q = { name, type: node.type, label: node.label };
      const unit = unitOf(c.name);
      if (unit && ['integer', 'decimal'].includes(q.type)) q.unit = unit;
      if (q.type === 'select_one') {
        const seen = new Map();
        plan.table.rows.forEach((r) => {
          const v = r.values[c.index];
          if (v !== null && v !== '' && !seen.has(normalize(v))) seen.set(normalize(v), String(v).trim());
        });
        q.choices = [...seen.values()].map((l) => ({ label: l, value: l }));
      }
      children.push(q);
      mapping[c.index] = name;
    });
    return { survey: { ...survey, pages: [{ name: 'p1', title: 'البيانات', children }] }, mapping };
  }, [mode, survey, plan]);

  const diff = useMemo(() => computeDiff({
    survey: built.survey, table: plan.table, mapping: built.mapping, keys: plan.keys,
    existing, govIdx, govName: (c) => names.get(c),
  }), [built, plan, existing, govIdx, names]);

  const [drop, setDrop] = useState(new Set());
  const [status, setStatus] = useState('approved');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const nodeOf = (n) => built.survey.pages.flatMap((p) => p.children).find((q) => q.name === n);

  const apply = async () => {
    setBusy(true);
    setError('');
    try {
      let surveyNow = built.survey;
      /* خيارات جديدة ظهرت في الملف تُضاف للسؤال قبل التطبيق */
      if (diff.newChoices.length || mode === 'create') {
        const pages = surveyNow.pages.map((p) => ({
          ...p,
          children: p.children.map((q) => {
            const add = diff.newChoices.find((c) => c.question === q.name);
            return add ? { ...q, choices: [...(q.choices || []), ...add.values.map((v) => ({ label: v, value: v }))] } : q;
          }),
        }));
        surveyNow = await store.updateSurvey(survey.id, { pages });
      }
      const summary = {
        changed: diff.updates.length, added: diff.inserts.length,
        removed: drop.size, unchanged: diff.unchanged.length,
      };
      await store.applyImport(surveyNow.id || survey.id, {
        file: fileName, updates: diff.updates, inserts: diff.inserts, deletes: [...drop], status, summary,
      });
      onDone(summary);
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  };

  const nothing = !diff.updates.length && !diff.inserts.length && !drop.size;

  return (
    <div className="imp-body">
      <div className="rsum rsum--diff">
        <div className="rsum__card rsum__card--changed"><span className="rsum__n">{diff.updates.length}</span><span className="rsum__l">تغيّر</span></div>
        <div className="rsum__card rsum__card--added"><span className="rsum__n">{diff.inserts.length}</span><span className="rsum__l">جديد</span></div>
        <div className="rsum__card rsum__card--missing"><span className="rsum__n">{diff.missing.length}</span><span className="rsum__l">اختفى من الملف</span></div>
        <div className="rsum__card"><span className="rsum__n">{diff.unchanged.length}</span><span className="rsum__l">كما هو</span></div>
      </div>

      {diff.issues.length > 0 && (
        <div className={`imp-issues${diff.blocking ? ' is-blocking' : ''}`}>
          <strong>{diff.blocking ? 'مشكلات تمنع التطبيق' : 'تنبيهات — لن تُستورد هذه القيم'}</strong>
          <ul>{diff.issues.slice(0, 12).map((i, n) => <li key={n}>الصف {i.row} — {i.field}: {i.message}</li>)}</ul>
          {diff.issues.length > 12 && <span>و{diff.issues.length - 12} غيرها.</span>}
        </div>
      )}

      {diff.newChoices.length > 0 && mode === 'update' && (
        <p className="rd-note">
          قيم جديدة ستُضاف كخيارات: {diff.newChoices.map((c) => `${nodeOf(c.question)?.label}: ${c.values.join('، ')}`).join(' — ')}
        </p>
      )}

      {diff.updates.length > 0 && (
        <section className="imp-sec">
          <h4>ما تغيّر</h4>
          {diff.updates.map((u) => (
            <div className="imp-change" key={u.id}>
              <strong>{u.label}</strong>
              <div className="imp-change__rows">
                {u.changes.map((c) => (
                  <span key={c.field} className={c.derived ? 'is-derived' : ''}>
                    {c.label}: <del>{show(nodeOf(c.field), c.before, names)}</del> ← <ins>{show(nodeOf(c.field), c.after, names)}</ins>
                    {c.derived && <small> (محسوب)</small>}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {diff.inserts.length > 0 && mode === 'update' && (
        <section className="imp-sec">
          <h4>جديد</h4>
          {diff.inserts.map((i) => <div className="imp-change imp-change--new" key={i.row}><strong>{i.label}</strong><small>الصف {i.row}</small></div>)}
        </section>
      )}

      {diff.missing.length > 0 && (
        <section className="imp-sec">
          <h4>موجود في المشروع وغير موجود في الملف</h4>
          <p className="bx-hint">قد يكون حُذف فعلاً، أو سقط من الملف سهواً. يُبقى افتراضياً — احذفه فقط إن كنت متأكداً.</p>
          {diff.missing.map((m) => {
            const on = drop.has(m.id);
            return (
              <div className={`imp-change imp-change--missing${on ? ' is-drop' : ''}`} key={m.id}>
                <strong>{m.label}</strong>
                <span className="rd-chips">
                  <button type="button" className={`rd-chip${!on ? ' is-on' : ''}`}
                    onClick={() => { const d = new Set(drop); d.delete(m.id); setDrop(d); }}>إبقاء</button>
                  <button type="button" className={`rd-chip${on ? ' is-on' : ''}`}
                    onClick={() => setDrop(new Set([...drop, m.id]))}>حذف</button>
                </span>
              </div>
            );
          })}
        </section>
      )}

      {mode === 'create' && diff.inserts.length > 0 && (
        <p className="rd-note">
          {dataProject
            ? <>سيُنشأ المشروع بـ {built.survey.pages[0].children.length} أعمدة، وتدخل {rowsText(diff.inserts.length)}. تصمم التقرير بعدها من تبويب «التقرير».</>
            : <>سيُنشأ الاستبيان بـ {built.survey.pages[0].children.length} أسئلة من أعمدة الملف، وتدخل {rowsText(diff.inserts.length)}. تستطيع تعديل الأسئلة وتصميم التقرير بعدها.</>}
        </p>
      )}

      {!nothing && !dataProject && (
        <div className="imp-status">
          <label className="rd-check is-on">
            <input type="radio" checked={status === 'approved'} onChange={() => setStatus('approved')} />
            <span><b>اعتماد مباشر</b> — مراجعتك لهذه الشاشة هي المراجعة. يظهر في التقرير المنشور فوراً.</span>
          </label>
          <label className={`rd-check${status === 'pending' ? ' is-on' : ''}`}>
            <input type="radio" checked={status === 'pending'} onChange={() => setStatus('pending')} />
            <span><b>إرسال للمراجعة</b> — الجديد والمتغيّر يعود «بانتظار المراجعة» ويختفي من التقرير المنشور حتى يُعتمد.</span>
          </label>
        </div>
      )}

      {error && <p className="share__warn">{error}</p>}

      <div className="imp-actions">
        <button type="button" className="q-btn" onClick={onBack}>رجوع</button>
        <button type="button" className="bx-save" disabled={busy || diff.blocking || nothing} onClick={apply}>
          {busy ? 'جارٍ التطبيق…' : nothing ? 'لا شيء للتطبيق' : `تطبيق ${diff.updates.length + diff.inserts.length + drop.size} تغييرات`}
        </button>
      </div>
    </div>
  );
}

/* ---------------- المعالج ---------------- */

export default function ImportWizard({ survey, existing, basemap, onApplied, published, dataProject }) {
  const hasData = existing.length > 0;
  const hasQuestions = survey.pages.some((p) => p.children.length > 0);
  const mode = hasQuestions ? 'update' : 'create';
  const [step, setStep] = useState(0);
  const [source, setSource] = useState(null);
  const [plan, setPlan] = useState(null);
  const [result, setResult] = useState(null);

  if (!basemap) return <p className="results__empty">جارٍ تحميل حدود المحافظات…</p>;

  return (
    <div className="imp">
      <div className="imp-intro">
        <h3>{mode === 'create' ? 'رفع ملف البيانات' : 'تحديث من ملف جديد'}</h3>
        <p>
          {mode === 'create'
            ? (dataProject ? 'ارفع ملف Excel، وتُبنى أعمدة المشروع منه.' : 'ارفع الملف فتُبنى الأسئلة من أعمدته وتدخل صفوفه كسجلات.')
            : `ارفع النسخة الأحدث من الملف. سترى ما تغيّر عن البيانات الحالية قبل أي تطبيق.`}
        </p>
      </div>
      <Steps step={step} />

      {step === 0 && <FileStep onRead={(s) => { setSource(s); setStep(1); }} />}
      {step === 1 && source && (
        <ColumnsStep mode={mode} source={source} survey={survey} basemap={basemap}
          onBack={() => { setSource(null); setStep(0); }}
          onNext={(p) => { setPlan(p); setStep(2); }} />
      )}
      {step === 2 && plan && (
        <DiffStep mode={mode} survey={survey} plan={plan} existing={existing} basemap={basemap} dataProject={dataProject}
          fileName={source.file} onBack={() => setStep(1)}
          onDone={(summary) => { setResult(summary); setStep(3); onApplied?.(); }} />
      )}
      {step === 3 && result && (
        <div className="imp-body imp-done">
          <Icon name="check" className="fillpage__icon fillpage__icon--ok" />
          <h3>طُبّق الاستيراد</h3>
          <p>
            {result.changed ? `${fmt(result.changed)} تغيّر، ` : ''}{result.added ? `${fmt(result.added)} جديد، ` : ''}
            {result.removed ? `${fmt(result.removed)} حُذف، ` : ''}{fmt(result.unchanged)} كما هو.
          </p>
          {!published && (
            <p className="rd-note">المشروع غير منشور بعد — لن يظهر في الموقع العام حتى تضغط «نشر على الصفحة الرئيسية».</p>
          )}
          <button type="button" className="q-btn" onClick={() => { setStep(0); setSource(null); setPlan(null); setResult(null); }}>
            استيراد ملف آخر
          </button>
        </div>
      )}
      {hasData && step === 0 && (
        <p className="bx-hint imp-foot">كل تحديث يُسجَّل: من رفعه ومتى وما تغيّر، وتُحفظ القيم السابقة في سجل كل سجل.</p>
      )}
    </div>
  );
}

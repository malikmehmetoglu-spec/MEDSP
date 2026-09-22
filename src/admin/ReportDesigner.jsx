import { useMemo, useState } from 'react';
import { buildReport } from '../projects/buildReport';
import {
  CHARTS, CHARTS_BY_TYPE, AGGS, WIDTHS, settingsOf, numericFields,
} from '../projects/reportPlan';
import ProjectReport from '../projects/ProjectReport';
import { QUESTION_TYPES } from '../survey/schema';
import Icon from '../components/Icon';

/*
  مصمّم التقرير: ما يظهر، وبأي رسم، وبأي عرض وترتيب — مع معاينة حيّة.
  الإعدادات تُحفظ مع الاستبيان بزر الحفظ نفسه.
*/

const NUMERIC = new Set(['integer', 'decimal', 'calculate']);

function Chips({ value, options, onChange, label }) {
  return (
    <div className="rd-chips" role="radiogroup" aria-label={label}>
      {options.map(([key, text, icon]) => (
        <button key={key} type="button" role="radio" aria-checked={value === key}
          className={`rd-chip${value === key ? ' is-on' : ''}`} onClick={() => onChange(key)}>
          {icon && <Icon name={icon} />}
          {text}
        </button>
      ))}
    </div>
  );
}

function mapNodes(pages, fn) {
  return pages.map((p) => ({ ...p, children: p.children.map((n) => fn(n)) }));
}

function Row({ node, index, count, placement, onMove, onPatch }) {
  const s = settingsOf(node);
  const [renaming, setRenaming] = useState(Boolean(s.title));
  const charts = CHARTS_BY_TYPE[node.type] || [];
  const numeric = NUMERIC.has(node.type) || (node.type === 'range' && s.chart === 'number');

  return (
    <div className={`rd-row${s.show ? '' : ' is-off'}`}>
      <div className="rd-row__head">
        <span className="rd-row__move">
          <button type="button" className="bx-mini" disabled={index === 0} onClick={() => onMove(-1)} aria-label="أعلى">↑</button>
          <button type="button" className="bx-mini" disabled={index === count - 1} onClick={() => onMove(1)} aria-label="أسفل">↓</button>
        </span>
        <span className="rd-row__icon"><Icon name={`t_${node.type}`} /></span>
        <span className="rd-row__title">
          <strong>{s.title || node.label || node.name}</strong>
          <small>{QUESTION_TYPES[node.type]?.label}{placement && ` — ${placement}`}</small>
        </span>
        <label className="bx-switch rd-row__show" title={s.show ? 'ظاهر في التقرير' : 'مخفي من التقرير'}>
          <input type="checkbox" checked={s.show} onChange={(e) => onPatch({ show: e.target.checked })} />
          <span className="bx-switch__track" aria-hidden="true"><span /></span>
        </label>
      </div>

      {s.show && (
        <div className="rd-row__body">
          {charts.length > 1 && (
            <Chips label="نوع الرسم" value={s.chart} onChange={(chart) => onPatch({ chart })}
              options={charts.map((c) => [c, CHARTS[c].label, CHARTS[c].icon])} />
          )}
          {numeric && (
            <Chips label="طريقة التجميع" value={s.agg} onChange={(agg) => onPatch({ agg })}
              options={Object.entries(AGGS).map(([k, v]) => [k, v])} />
          )}
          {!numeric && s.chart !== 'summary' && (
            <div className="rd-line">
              <span>العرض</span>
              <Chips label="العرض" value={s.width} onChange={(width) => onPatch({ width })}
                options={Object.entries(WIDTHS).map(([k, v]) => [k, v.label])} />
            </div>
          )}
          {(node.type === 'text' || node.type === 'textarea') && (
            <p className="rd-warn">تُعرض الإجابات النصية كما كتبها المستجيبون وتظهر للعامة عند النشر. تأكد أنها لا تحوي أسماء أو معلومات شخصية.</p>
          )}
          {renaming ? (
            <input className="bx-input rd-rename" value={s.title} placeholder={node.label}
              onChange={(e) => onPatch({ title: e.target.value })} />
          ) : (
            <button type="button" className="bx-link rd-renamebtn" onClick={() => setRenaming(true)}>
              عنوان مختلف في التقرير
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- أقسام إضافية ---------------- */

function FieldSel({ value, options, onChange, placeholder }) {
  return (
    <select className="bx-input bx-select rd-sel" value={value || ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((q) => <option key={q.name} value={q.name}>{q.label || q.name}</option>)}
    </select>
  );
}

const newId = () => Math.random().toString(36).slice(2, 8);

function RatioSection({ ratios, nums, onChange }) {
  const [draft, setDraft] = useState({ label: '', num: '', den: '' });
  const ok = draft.num && draft.den && draft.num !== draft.den;
  return (
    <section className="rd-sec">
      <h4>بطاقات النسبة <small>مجموع ÷ مجموع</small></h4>
      {ratios.map((r) => (
        <div className="rd-item" key={r.id}>
          <span><strong>{r.label || 'نسبة'}</strong>
            <small>{nums.find((q) => q.name === r.num)?.label} ÷ {nums.find((q) => q.name === r.den)?.label}</small></span>
          <button type="button" className="bx-mini bx-mini--del" aria-label="حذف"
            onClick={() => onChange(ratios.filter((x) => x.id !== r.id))}>✕</button>
        </div>
      ))}
      <div className="rd-add">
        <input className="bx-input rd-sel" placeholder="اسم البطاقة، مثلاً: نسبة الإنجاز"
          value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
        <div className="rd-add__row">
          <FieldSel value={draft.num} options={nums} placeholder="البسط (المنفذ)" onChange={(num) => setDraft({ ...draft, num })} />
          <span>÷</span>
          <FieldSel value={draft.den} options={nums} placeholder="المقام (المخطط)" onChange={(den) => setDraft({ ...draft, den })} />
        </div>
        <button type="button" className="bx-link" disabled={!ok}
          onClick={() => { onChange([...ratios, { id: newId(), ...draft, label: draft.label || 'نسبة' }]); setDraft({ label: '', num: '', den: '' }); }}>
          + إضافة بطاقة نسبة
        </button>
        <p className="bx-hint">النسبة تُحسب من المجموعين لا من متوسط النسب — الأدق حين تختلف أحجام السجلات. أضفها بعدها للبطاقات الجانبية.</p>
      </div>
    </section>
  );
}

function CompareSection({ compares, nums, cats, onChange }) {
  const [draft, setDraft] = useState({ title: '', by: '', a: '', b: '' });
  const ok = draft.by && draft.a && draft.b && draft.a !== draft.b;
  const L = (list, n) => list.find((q) => q.name === n)?.label || n;
  return (
    <section className="rd-sec">
      <h4>لوحات المقارنة <small>مخطط مقابل منفذ لكل فئة</small></h4>
      {compares.map((c) => (
        <div className="rd-item" key={c.id}>
          <span><strong>{c.title || `${L(nums, c.b)} مقابل ${L(nums, c.a)}`}</strong>
            <small>حسب {L(cats, c.by)}</small></span>
          <button type="button" className="bx-mini bx-mini--del" aria-label="حذف"
            onClick={() => onChange(compares.filter((x) => x.id !== c.id))}>✕</button>
        </div>
      ))}
      {cats.length > 0 && nums.length > 1 ? (
        <div className="rd-add">
          <input className="bx-input rd-sel" placeholder="العنوان (اختياري)"
            value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <FieldSel value={draft.by} options={cats} placeholder="حسب… (محافظة، مرحلة)" onChange={(by) => setDraft({ ...draft, by })} />
          <div className="rd-add__row">
            <FieldSel value={draft.a} options={nums} placeholder="المرجع (المخطط)" onChange={(a) => setDraft({ ...draft, a })} />
            <span>مقابل</span>
            <FieldSel value={draft.b} options={nums} placeholder="المنجز (المنفذ)" onChange={(b) => setDraft({ ...draft, b })} />
          </div>
          <button type="button" className="bx-link" disabled={!ok}
            onClick={() => { onChange([...compares, { id: newId(), ...draft }]); setDraft({ title: '', by: '', a: '', b: '' }); }}>
            + إضافة لوحة مقارنة
          </button>
        </div>
      ) : (
        <p className="bx-hint">تحتاج سؤال فئة (اختيار أو محافظة) وحقلين رقميين.</p>
      )}
    </section>
  );
}

export default function ReportDesigner({ project, survey, responses, basemap, onChange }) {
  const approved = responses.filter((r) => r.status === 'approved');
  const [scope, setScope] = useState(approved.length ? 'approved' : 'all');
  const sample = scope === 'approved' ? approved : responses;

  const questions = useMemo(() => buildReport(survey, []).questions, [survey]);
  const nums = numericFields(questions);
  const cfg = survey.report || {};
  const hero = cfg.hero || 'count';
  const side = Array.isArray(cfg.side) ? cfg.side : nums.filter((q) => q.name !== hero).slice(0, 3).map((q) => q.name);

  /* الترتيب الظاهر في القائمة: المحفوظ، وإلا ترتيب الأسئلة */
  const ordered = useMemo(() => {
    if (!Array.isArray(cfg.order) || !cfg.order.length) return questions;
    const rank = new Map(cfg.order.map((n, i) => [n, i]));
    return [...questions].sort((a, b) => (rank.get(a.name) ?? 1e6) - (rank.get(b.name) ?? 1e6));
  }, [questions, cfg.order]);

  const setCfg = (patch) => onChange({ ...survey, report: { ...cfg, ...patch } });
  const patchNode = (name, patch) => onChange({
    ...survey,
    pages: mapNodes(survey.pages, (n) => (n.name === name ? { ...n, report: { ...(n.report || {}), ...patch } } : n)),
  });
  const move = (i, d) => {
    const list = ordered.map((q) => q.name);
    const j = i + d;
    [list[i], list[j]] = [list[j], list[i]];
    setCfg({ order: list });
  };
  const toggleSide = (name) => {
    const next = side.includes(name) ? side.filter((n) => n !== name) : [...side, name].slice(0, 3);
    setCfg({ side: next });
  };
  const reset = () => {
    if (!window.confirm('إعادة التقرير إلى الشكل الافتراضي؟ تُمسح كل الإعدادات المخصصة.')) return;
    onChange({ ...survey, report: {}, pages: mapNodes(survey.pages, ({ report, ...n }) => n) });
  };

  const cats = questions.filter((q) => ['select_one', 'select_multiple', 'admin_area'].includes(q.type));
  const filters = Array.isArray(cfg.filters) ? cfg.filters : questions.filter((q) => q.type === 'admin_area').map((q) => q.name);
  const ratios = cfg.ratios || [];
  const tableCols = cfg.table?.columns || questions.filter((q) => !['repeat', 'image', 'note'].includes(q.type)).map((q) => q.name);
  const toggleIn = (list, name) => (list.includes(name) ? list.filter((n) => n !== name) : [...list, name]);

  const placementOf = (q) => {
    if (hero === q.name) return 'الرقم الرئيسي';
    if (side.includes(q.name)) return 'بطاقة جانبية';
    if (NUMERIC.has(q.type)) return 'ضمن المؤشرات الرقمية';
    return '';
  };

  return (
    <div className="rd">
      <aside className="rd-side">
        <section className="rd-sec">
          <h4>الرقم الرئيسي</h4>
          <select className="bx-input bx-select" value={hero} onChange={(e) => setCfg({ hero: e.target.value })}>
            <option value="count">عدد الاستمارات المعتمدة</option>
            {nums.map((q) => <option key={q.name} value={q.name}>{q.label || q.name}</option>)}
          </select>
        </section>

        {(nums.length > 0 || ratios.length > 0) && (
          <section className="rd-sec">
            <h4>البطاقات الجانبية <small>حتى ثلاث</small></h4>
            <div className="rd-checks">
              {[
                ...nums.filter((q) => q.name !== hero).map((q) => ({ key: q.name, label: q.label || q.name })),
                ...ratios.map((r) => ({ key: `ratio:${r.id}`, label: `${r.label} (نسبة)` })),
              ].map((o) => {
                const on = side.includes(o.key);
                return (
                  <label key={o.key} className={`rd-check${on ? ' is-on' : ''}`}>
                    <input type="checkbox" checked={on} disabled={!on && side.length >= 3}
                      onChange={() => toggleSide(o.key)} />
                    <span>{o.label}</span>
                  </label>
                );
              })}
            </div>
          </section>
        )}

        <RatioSection ratios={ratios} nums={nums}
          onChange={(next) => setCfg({ ratios: next, side: side.filter((k) => !k.startsWith('ratio:') || next.some((r) => `ratio:${r.id}` === k)) })} />

        {cats.length > 0 && (
          <section className="rd-sec">
            <h4>الفلاتر <small>أعلى التقرير، للزوار أيضاً</small></h4>
            <div className="rd-checks">
              {cats.map((q) => {
                const on = filters.includes(q.name);
                return (
                  <label key={q.name} className={`rd-check${on ? ' is-on' : ''}`}>
                    <input type="checkbox" checked={on} onChange={() => setCfg({ filters: toggleIn(filters, q.name) })} />
                    <span>{q.type === 'admin_area' ? `${q.label} (المحافظة)` : q.label}</span>
                  </label>
                );
              })}
            </div>
          </section>
        )}

        <CompareSection compares={cfg.compare || []} nums={nums} cats={cats}
          onChange={(next) => setCfg({ compare: next })} />

        <section className="rd-sec">
          <h4>جدول التفاصيل <small>سطر لكل سجل مع صف إجمالي</small></h4>
          <label className="bx-switch">
            <input type="checkbox" checked={Boolean(cfg.table?.show)}
              onChange={(e) => setCfg({ table: { columns: tableCols, ...cfg.table, show: e.target.checked } })} />
            <span className="bx-switch__track" aria-hidden="true"><span /></span>
            <span className="bx-switch__text">إظهار الجدول</span>
          </label>
          {cfg.table?.show && (
            <div className="rd-checks">
              {questions.filter((q) => !['repeat', 'image', 'note'].includes(q.type)).map((q) => {
                const on = tableCols.includes(q.name);
                return (
                  <label key={q.name} className={`rd-check${on ? ' is-on' : ''}`}>
                    <input type="checkbox" checked={on}
                      onChange={() => setCfg({ table: { ...cfg.table, columns: toggleIn(tableCols, q.name) } })} />
                    <span>{q.label || q.name}</span>
                  </label>
                );
              })}
            </div>
          )}
        </section>

        <section className="rd-sec">
          <h4>اللوحات <small>الترتيب والرسم والعرض</small></h4>
          <div className="rd-rows">
            {ordered.map((q, i) => (
              <Row key={q.name} node={q} index={i} count={ordered.length}
                placement={placementOf(q)}
                onMove={(d) => move(i, d)}
                onPatch={(patch) => patchNode(q.name, patch)} />
            ))}
          </div>
        </section>

        <button type="button" className="bx-link rd-reset" onClick={reset}>إعادة الضبط الافتراضي</button>
      </aside>

      <div className="rd-preview">
        <div className="rd-preview__bar">
          <strong>معاينة</strong>
          <Chips label="بيانات المعاينة" value={scope} onChange={setScope}
            options={[['approved', `المعتمدة (${approved.length})`], ['all', `كل الاستمارات (${responses.length})`]]} />
        </div>
        {scope === 'all' && (
          <p className="rd-note">تعرض المعاينة كل الاستمارات بما فيها غير المعتمدة — للتصميم فقط. التقرير المنشور يعرض المعتمدة وحدها.</p>
        )}
        {sample.length === 0 ? (
          <div className="pending"><h3>لا توجد استمارات للمعاينة</h3><p>اجمع إجابات أو جرّب «معاينة التعبئة» لترى التقرير.</p></div>
        ) : (
          <ProjectReport project={{ ...project, surveys: [survey], responses: sample }} basemap={basemap} />
        )}
      </div>
    </div>
  );
}

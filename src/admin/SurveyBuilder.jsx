import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { QUESTION_TYPES } from '../survey/schema';
import { checkExpression } from '../survey/expression';
import {
  OPS, opsFor, compileLogic, describeLogic, isRuleComplete, LOGIC_SOURCE_TYPES,
} from '../survey/logic';
import Icon from '../components/Icon';

/*
  باني الاستبيان.

  - لوحة أنواع ثابتة على الجانب: الضغط يضيف السؤال بعد المحدد مباشرة.
  - سؤال واحد مفتوح في كل مرة؛ الباقي مطوي ومقروء.
  - الخيارات سطراً سطراً.
  - الشرط يُركَّب من قوائم ويُخزَّن بنيةً (logic)، ويُحوَّل تلقائياً
    إلى تعبير relevant يفهمه المحرك — فلا يكتب المستخدم أي تعبير.
*/

/* ---------------- الأنواع ---------------- */

const PALETTE = [
  { label: 'نصوص', types: ['text', 'textarea', 'note'] },
  { label: 'أرقام', types: ['integer', 'decimal', 'range'] },
  { label: 'اختيارات', types: ['select_one', 'select_multiple', 'rank'] },
  { label: 'زمن', types: ['date', 'time', 'datetime'] },
  { label: 'مكان', types: ['admin_area', 'geopoint'] },
  { label: 'أخرى', types: ['image', 'repeat'] },
];

const TYPE_HINT = {
  text: 'اسم، هاتف، سطر واحد',
  textarea: 'وصف من عدة أسطر',
  note: 'نص إرشادي بلا إجابة',
  integer: 'أشخاص، وحدات، أيام',
  decimal: 'مساحة، نسبة، وزن',
  range: 'تقييم من ١ إلى ٥',
  select_one: 'إجابة واحدة من قائمة',
  select_multiple: 'عدة إجابات من قائمة',
  rank: 'ترتيب حسب الأولوية',
  date: 'يوم وشهر وسنة',
  time: 'ساعة ودقيقة',
  datetime: 'تاريخ ووقت',
  admin_area: 'محافظة ثم ناحية',
  geopoint: 'إحداثيات GPS',
  image: 'التقاط صورة',
  repeat: 'أسئلة تتكرر لكل فرد أو أسرة',
};

/* الأنواع التي يمكن التحويل بينها دون فقدان الإعدادات */
const SWITCHABLE = [
  ['select_one', 'select_multiple', 'rank'],
  ['text', 'textarea'],
  ['integer', 'decimal'],
  ['date', 'datetime'],
];

const HAS_CHOICES = (t) => Boolean(QUESTION_TYPES[t]?.hasChoices);
const NUMERIC = new Set(['integer', 'decimal', 'range']);

/* ---------------- عمليات الشجرة ---------------- */

const clone = (x) => JSON.parse(JSON.stringify(x));

function allNames(pages) {
  const names = new Set();
  const walk = (list) => list?.forEach((n) => { names.add(n.name); walk(n.children); });
  pages.forEach((p) => walk(p.children));
  return names;
}

function makeName(names, type) {
  let i = 1;
  while (names.has(`${type}_${i}`)) i += 1;
  names.add(`${type}_${i}`);
  return `${type}_${i}`;
}

/* يطبّق fn على القائمة التي تحوي العقدة المسماة */
function withList(pages, name, fn) {
  const next = clone(pages);
  const visit = (list) => {
    const i = list.findIndex((n) => n.name === name);
    if (i !== -1) { fn(list, i); return true; }
    return list.some((n) => n.children && visit(n.children));
  };
  next.some((p) => visit(p.children));
  return next;
}

function newNode(type, names) {
  const node = { name: makeName(names, type), type, label: '' };
  if (HAS_CHOICES(type)) node.choices = [];
  if (type === 'range') { node.min = 1; node.max = 5; }
  if (type === 'repeat') { node.children = []; node.itemLabel = 'فرد'; }
  return node;
}

/* ترتيب الأسئلة كما يراها المستجيب، مع نطاق كل سؤال (الجذر أو مجموعة متكررة) */
function ordered(pages) {
  const out = [];
  pages.forEach((p, pi) => p.children.forEach((n) => {
    out.push({ node: n, scope: null, page: pi });
    if (n.type === 'repeat') n.children?.forEach((c) => out.push({ node: c, scope: n.name, page: pi }));
  }));
  return out;
}

/* ---------------- السياق ---------------- */

const Ctx = createContext(null);
const useB = () => useContext(Ctx);

/* ---------------- الخيارات ---------------- */

function ChoiceRows({ choices, onChange }) {
  const list = choices || [];
  const inputs = useRef([]);
  const [focusIdx, setFocusIdx] = useState(null);

  useEffect(() => {
    if (focusIdx != null) { inputs.current[focusIdx]?.focus(); setFocusIdx(null); }
  }, [focusIdx]);

  const values = new Set();
  const uniqueValue = (label) => {
    const base = label.trim() || 'خيار';
    let v = base; let k = 2;
    list.forEach((c) => values.add(String(c.value)));
    while (values.has(v)) { v = `${base} ${k}`; k += 1; }
    return v;
  };

  /*
    القيمة المخزّنة تتبع النص للخيارات الجديدة (بيانات مقروءة).
    لكن الخيار الذي قيمته تختلف أصلاً عن نصه (مثل school ← «مدرسة»)
    تبقى قيمته ثابتة، وإلا انقطع عن الإجابات والشروط السابقة.
  */
  const set = (i, label) => {
    const next = list.map((c, j) => {
      if (j !== i) return c;
      const fixed = c.fixed ?? (c.label !== '' && String(c.value) !== c.label);
      return { ...c, label, fixed, value: fixed ? c.value : (label.trim() || c.value) };
    });
    onChange(next);
  };
  const add = (after = list.length - 1) => {
    const next = [...list];
    next.splice(after + 1, 0, { label: '', value: uniqueValue('') });
    onChange(next);
    setFocusIdx(after + 1);
  };
  const remove = (i) => onChange(list.filter((_, j) => j !== i));
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const dup = list.map((c) => c.label.trim()).filter((l, i, a) => l && a.indexOf(l) !== i);

  return (
    <div className="bx-choices">
      {list.map((c, i) => (
        <div className="bx-choice" key={i}>
          <span className="bx-choice__dot" aria-hidden="true" />
          <input
            ref={(el) => { inputs.current[i] = el; }}
            className="bx-input bx-choice__input"
            value={c.label}
            placeholder={`الخيار ${i + 1}`}
            onChange={(e) => set(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); add(i); }
              if (e.key === 'Backspace' && c.label === '' && list.length > 1) {
                e.preventDefault(); remove(i); setFocusIdx(Math.max(0, i - 1));
              }
            }}
          />
          <span className="bx-choice__tools">
            <button type="button" className="bx-mini" onClick={() => move(i, -1)} disabled={i === 0} aria-label="أعلى">↑</button>
            <button type="button" className="bx-mini" onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label="أسفل">↓</button>
            <button type="button" className="bx-mini bx-mini--del" onClick={() => remove(i)} aria-label="حذف الخيار">✕</button>
          </span>
        </div>
      ))}
      <button type="button" className="bx-addchoice" onClick={() => add()}>
        + إضافة خيار
        <span>أو اضغط Enter بعد كتابة الخيار</span>
      </button>
      {dup.length > 0 && <p className="bx-warn">خيارات مكررة: {[...new Set(dup)].join('، ')}</p>}
    </div>
  );
}

/* ---------------- الشرط المرئي ---------------- */

function RuleValue({ source, rule, onChange }) {
  if (!OPS[rule.op]?.needsValue) return null;
  if (source?.choices?.length) {
    return (
      <select className="bx-input bx-select" value={rule.value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">اختر…</option>
        {source.choices.map((c) => <option key={c.value} value={c.value}>{c.label || c.value}</option>)}
      </select>
    );
  }
  if (source?.type === 'date') {
    return <input className="bx-input" type="date" value={rule.value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <input className="bx-input bx-rule__value" value={rule.value ?? ''}
      inputMode={NUMERIC.has(source?.type) ? 'decimal' : undefined}
      placeholder={NUMERIC.has(source?.type) ? 'رقم' : 'القيمة'}
      onChange={(e) => onChange(e.target.value)} />
  );
}

function LogicEditor({ node, prior, set }) {
  const { nodeOf } = useB();
  const logic = node.logic || { mode: 'all', rules: [] };
  const priorNames = new Set(prior.map((p) => p.name));

  const commit = (next) => {
    const typeOf = (f) => nodeOf(f)?.type;
    set({ logic: next, relevant: compileLogic(next, typeOf) || undefined });
  };

  /* شرط قديم مكتوب يدوياً ولا بنية له */
  if (node.relevant && !node.logic) {
    return (
      <div className="bx-logic bx-logic--legacy">
        <p>لهذا السؤال شرط مكتوب بصيغة متقدمة:</p>
        <code dir="ltr">{node.relevant}</code>
        <button type="button" className="bx-link" onClick={() => set({ relevant: undefined })}>
          حذفه وبناء شرط جديد
        </button>
      </div>
    );
  }

  if (logic.rules.length === 0) {
    return prior.length === 0 ? (
      <p className="bx-hint">لإظهار هذا السؤال بشرط، أضف قبله سؤالاً يُبنى عليه الشرط.</p>
    ) : (
      <button type="button" className="bx-addlogic"
        onClick={() => commit({ mode: 'all', rules: [{ field: prior[prior.length - 1].name, op: opsFor(prior[prior.length - 1].type)[0], value: '' }] })}>
        <Icon name="t_select_one" />
        إظهار هذا السؤال بشرط فقط
      </button>
    );
  }

  const setRule = (i, patch) => {
    const rules = logic.rules.map((r, j) => (j === i ? { ...r, ...patch } : r));
    commit({ ...logic, rules });
  };

  return (
    <div className="bx-logic">
      <div className="bx-logic__head">
        <strong>يظهر هذا السؤال فقط إذا</strong>
        {logic.rules.length > 1 && (
          <span className="bx-seg" role="radiogroup" aria-label="طريقة الجمع">
            <button type="button" role="radio" aria-checked={logic.mode !== 'any'}
              className={logic.mode !== 'any' ? 'is-on' : ''} onClick={() => commit({ ...logic, mode: 'all' })}>
              تحققت كل الشروط
            </button>
            <button type="button" role="radio" aria-checked={logic.mode === 'any'}
              className={logic.mode === 'any' ? 'is-on' : ''} onClick={() => commit({ ...logic, mode: 'any' })}>
              تحقق أي شرط
            </button>
          </span>
        )}
      </div>

      {logic.rules.map((r, i) => {
        const source = nodeOf(r.field);
        const broken = !priorNames.has(r.field);
        return (
          <div className={`bx-rule${broken ? ' is-broken' : ''}`} key={i}>
            {i > 0 && <span className="bx-rule__join">{logic.mode === 'any' ? 'أو' : 'و'}</span>}
            <select className="bx-input bx-select bx-rule__field" value={broken ? '' : r.field}
              onChange={(e) => {
                const src = prior.find((p) => p.name === e.target.value);
                setRule(i, { field: e.target.value, op: opsFor(src?.type)[0], value: '' });
              }}>
              {broken && <option value="">⚠ سؤال محذوف أو نُقل بعد هذا السؤال</option>}
              {prior.map((p) => (
                <option key={p.name} value={p.name}>{p.label || `(سؤال بلا نص — ${QUESTION_TYPES[p.type]?.label})`}</option>
              ))}
            </select>
            <select className="bx-input bx-select bx-rule__op" value={r.op}
              onChange={(e) => setRule(i, { op: e.target.value, value: OPS[e.target.value].needsValue ? r.value : '' })}>
              {opsFor(source?.type).map((op) => <option key={op} value={op}>{OPS[op].label}</option>)}
            </select>
            <RuleValue source={source} rule={r} onChange={(value) => setRule(i, { value })} />
            <button type="button" className="bx-mini bx-mini--del" aria-label="حذف الشرط"
              onClick={() => commit({ ...logic, rules: logic.rules.filter((_, j) => j !== i) })}>✕</button>
          </div>
        );
      })}

      <button type="button" className="bx-link"
        onClick={() => commit({ ...logic, rules: [...logic.rules, { field: prior[prior.length - 1].name, op: opsFor(prior[prior.length - 1].type)[0], value: '' }] })}>
        + شرط آخر
      </button>
    </div>
  );
}

/* ---------------- بطاقة السؤال ---------------- */

function QuestionCard({ node, index, prior, isFirst, isLast }) {
  const b = useB();
  /* المجموعة المتكررة تبقى مفتوحة ما دام أحد أسئلتها محدداً — وإلا اختفى السؤال المضاف للتو */
  const self = b.selected === node.name;
  const open = self || (node.type === 'repeat' && (node.children || []).some((c) => c.name === b.selected));
  const ref = useRef(null);
  const set = (patch) => b.update(node.name, patch);

  useEffect(() => {
    if (self && b.justAdded === node.name) {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [self, b.justAdded, node.name]);

  const summary = describeLogic(node.logic, b.nodeOf);
  const broken = (node.logic?.rules || []).some((r) => isRuleComplete(r) && !prior.some((p) => p.name === r.field));
  const incompleteLogic = (node.logic?.rules || []).some((r) => !isRuleComplete(r));
  const switchGroup = SWITCHABLE.find((g) => g.includes(node.type));
  const noChoices = HAS_CHOICES(node.type) && (node.choices || []).filter((c) => c.label.trim()).length < 2;

  return (
    <div ref={ref} className={`bx-card${open ? ' is-open' : ''}${open && !self ? ' is-parent' : ''}`}>
      <div className="bx-card__bar" role="button" tabIndex={0}
        onClick={() => b.select(self ? null : node.name)}
        onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) b.select(self ? null : node.name); }}>
        <span className="bx-card__n">{index}</span>
        <span className="bx-card__icon"><Icon name={`t_${node.type}`} /></span>
        <span className="bx-card__text">
          <span className={`bx-card__title${node.label ? '' : ' is-empty'}`}>
            {node.label || 'سؤال بلا نص'}
          </span>
          <span className="bx-card__meta">
            <span>{QUESTION_TYPES[node.type]?.label}</span>
            {node.required && <span className="bx-chip bx-chip--req">مطلوب</span>}
            {HAS_CHOICES(node.type) && <span className="bx-chip">{(node.choices || []).length} خيارات</span>}
            {node.type === 'repeat' && <span className="bx-chip">{(node.children || []).length} أسئلة</span>}
            {noChoices && <span className="bx-chip bx-chip--warn">يحتاج خيارين على الأقل</span>}
            {(broken || incompleteLogic) && <span className="bx-chip bx-chip--warn">الشرط غير مكتمل</span>}
          </span>
          {summary && !broken && <span className="bx-card__logic">يظهر إذا: {summary}</span>}
        </span>
        <span className="bx-card__tools" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="bx-mini" disabled={isFirst} onClick={() => b.move(node.name, -1)} aria-label="نقل لأعلى" title="أعلى">↑</button>
          <button type="button" className="bx-mini" disabled={isLast} onClick={() => b.move(node.name, 1)} aria-label="نقل لأسفل" title="أسفل">↓</button>
          <button type="button" className="bx-mini" onClick={() => b.duplicate(node.name)} aria-label="نسخ السؤال" title="نسخ">⧉</button>
          <button type="button" className="bx-mini bx-mini--del" onClick={() => b.remove(node.name)} aria-label="حذف السؤال" title="حذف">✕</button>
        </span>
      </div>

      {open && (
        <div className="bx-card__body">
          <div className="bx-block">
            <input className="bx-input bx-input--title" value={node.label || ''} autoFocus={!node.label}
              placeholder={node.type === 'note' ? 'النص الذي سيقرؤه المستجيب' : 'اكتب السؤال هنا'}
              onChange={(e) => set({ label: e.target.value })} />
            {node.type !== 'note' && (
              <input className="bx-input bx-input--hint" value={node.hint || ''}
                placeholder="توضيح تحت السؤال (اختياري)"
                onChange={(e) => set({ hint: e.target.value })} />
            )}
          </div>

          {switchGroup && (
            <div className="bx-types" role="radiogroup" aria-label="نوع السؤال">
              {switchGroup.map((t) => (
                <button key={t} type="button" role="radio" aria-checked={node.type === t}
                  className={`bx-type${node.type === t ? ' is-on' : ''}`}
                  onClick={() => set({ type: t })}>
                  <Icon name={`t_${t}`} />
                  {QUESTION_TYPES[t].label}
                </button>
              ))}
            </div>
          )}

          {HAS_CHOICES(node.type) && (
            <section className="bx-block">
              <h5 className="bx-h">الخيارات</h5>
              <ChoiceRows choices={node.choices} onChange={(choices) => set({ choices })} />
            </section>
          )}

          {NUMERIC.has(node.type) && (
            <section className="bx-block">
              <h5 className="bx-h">{node.type === 'range' ? 'المقياس' : 'حدود القيمة'}</h5>
              <div className="bx-row">
                <label className="bx-field"><span>{node.type === 'range' ? 'من' : 'أقل قيمة'}</span>
                  <input className="bx-input" type="number" value={node.min ?? ''}
                    onChange={(e) => set({ min: e.target.value === '' ? undefined : Number(e.target.value) })} />
                </label>
                <label className="bx-field"><span>{node.type === 'range' ? 'إلى' : 'أكبر قيمة'}</span>
                  <input className="bx-input" type="number" value={node.max ?? ''}
                    onChange={(e) => set({ max: e.target.value === '' ? undefined : Number(e.target.value) })} />
                </label>
                {node.type !== 'range' ? (
                  <label className="bx-field"><span>الوحدة</span>
                    <input className="bx-input" value={node.unit || ''} placeholder="شخص، متر"
                      onChange={(e) => set({ unit: e.target.value })} />
                  </label>
                ) : null}
              </div>
              {node.type === 'range' && (
                <div className="bx-row">
                  <label className="bx-field"><span>وصف أدنى درجة</span>
                    <input className="bx-input" value={node.minLabel || ''} placeholder="ضعيف"
                      onChange={(e) => set({ minLabel: e.target.value })} />
                  </label>
                  <label className="bx-field"><span>وصف أعلى درجة</span>
                    <input className="bx-input" value={node.maxLabel || ''} placeholder="ممتاز"
                      onChange={(e) => set({ maxLabel: e.target.value })} />
                  </label>
                </div>
              )}
            </section>
          )}

          {node.type === 'repeat' && (
            <section className="bx-block">
              <h5 className="bx-h">ما الذي يتكرر؟</h5>
              <div className="bx-row">
                <label className="bx-field"><span>اسم المدخل الواحد</span>
                  <input className="bx-input" value={node.itemLabel || ''} placeholder="فرد، أسرة، منشأة"
                    onChange={(e) => set({ itemLabel: e.target.value })} />
                </label>
                <label className="bx-field"><span>أقل عدد</span>
                  <input className="bx-input" type="number" min="0" value={node.minCount ?? ''}
                    onChange={(e) => set({ minCount: e.target.value === '' ? undefined : Number(e.target.value) })} />
                </label>
                <label className="bx-field"><span>أكبر عدد</span>
                  <input className="bx-input" type="number" min="1" value={node.maxCount ?? ''}
                    onChange={(e) => set({ maxCount: e.target.value === '' ? undefined : Number(e.target.value) })} />
                </label>
              </div>
              <p className="bx-hint">
                الأسئلة التالية تُطرح مرة لكل {node.itemLabel || 'مدخل'}. اختر أحدها ثم أضف من اللوحة الجانبية لتُضاف داخل المجموعة.
              </p>
              <NodeList list={node.children || []} scope={node.name} />
            </section>
          )}

          <section className="bx-block bx-block--rules">
            {node.type !== 'note' && (
              <label className="bx-switch">
                <input type="checkbox" checked={Boolean(node.required)}
                  onChange={(e) => set({ required: e.target.checked })} />
                <span className="bx-switch__track" aria-hidden="true"><span /></span>
                <span className="bx-switch__text">إجابة إلزامية</span>
              </label>
            )}
            {node.type === 'date' && (
              <label className="bx-switch">
                <input type="checkbox" checked={node.constraint === '${' + node.name + '} <= today()'}
                  onChange={(e) => set(e.target.checked
                    ? { constraint: `\${${node.name}} <= today()`, constraintMessage: 'لا يمكن اختيار تاريخ في المستقبل' }
                    : { constraint: undefined, constraintMessage: undefined })} />
                <span className="bx-switch__track" aria-hidden="true"><span /></span>
                <span className="bx-switch__text">منع التواريخ المستقبلية</span>
              </label>
            )}
            {node.type === 'image' && (
              <label className="bx-switch">
                <input type="checkbox" checked={Boolean(node.capture)}
                  onChange={(e) => set({ capture: e.target.checked })} />
                <span className="bx-switch__track" aria-hidden="true"><span /></span>
                <span className="bx-switch__text">فتح الكاميرا مباشرة</span>
              </label>
            )}
            <LogicEditor node={node} prior={prior} set={set} />
          </section>

          <details className="bx-adv">
            <summary>خيارات متقدمة</summary>
            <div className="bx-adv__body">
              <label className="bx-field">
                <span>قيد على الإجابة (تعبير)</span>
                <input className={`bx-input bx-code${node.constraint && !checkExpression(node.constraint).valid ? ' is-bad' : ''}`}
                  dir="ltr" value={node.constraint || ''} placeholder="${children} <= ${members}"
                  onChange={(e) => set({ constraint: e.target.value || undefined })} />
              </label>
              {node.constraint && (
                <label className="bx-field"><span>رسالة تظهر عند مخالفة القيد</span>
                  <input className="bx-input" value={node.constraintMessage || ''}
                    onChange={(e) => set({ constraintMessage: e.target.value })} />
                </label>
              )}
              <p className="bx-hint">المعرّف في البيانات: <code dir="ltr">{node.name}</code></p>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

/* ---------------- قائمة ---------------- */

function NodeList({ list, scope = null }) {
  const b = useB();
  if (list.length === 0) {
    return (
      <div className="bx-empty">
        {scope ? 'لا أسئلة داخل المجموعة بعد.' : 'لا أسئلة في هذا القسم. اختر نوعاً من اللوحة الجانبية لإضافة أول سؤال.'}
      </div>
    );
  }
  return (
    <div className={`bx-list${scope ? ' bx-list--nested' : ''}`}>
      {list.map((node, i) => (
        <QuestionCard key={node.name} node={node} index={b.numberOf(node.name)}
          prior={b.priorFor(node.name)} isFirst={i === 0} isLast={i === list.length - 1} />
      ))}
    </div>
  );
}

/* ---------------- لوحة الأنواع ---------------- */

function Palette({ onPick, target }) {
  return (
    <div className="bx-pal">
      <div className="bx-pal__head">
        <strong>أضف سؤالاً</strong>
        <span>{target ? `يُضاف بعد: ${target}` : 'يُضاف في آخر الاستبيان'}</span>
      </div>
      {PALETTE.map((g) => (
        <div className="bx-pal__group" key={g.label}>
          <span className="bx-pal__label">{g.label}</span>
          {g.types.map((t) => (
            <button key={t} type="button" className="bx-pal__item" onClick={() => onPick(t)}>
              <Icon name={`t_${t}`} className="bx-pal__icon" />
              <span className="bx-pal__name">{QUESTION_TYPES[t].label}</span>
              <span className="bx-pal__hint">{TYPE_HINT[t]}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ---------------- الباني ---------------- */

export default function SurveyBuilder({ survey, onChange, actions }) {
  const pages = survey.pages?.length ? survey.pages : [{ name: 'main', title: 'القسم الأول', children: [] }];
  const [selected, setSelected] = useState(null);
  const [justAdded, setJustAdded] = useState(null);
  const [sheet, setSheet] = useState(false);

  const setPages = (next) => onChange({ ...survey, pages: next });

  const order = useMemo(() => ordered(pages), [pages]);
  const byName = useMemo(() => new Map(order.map((o) => [o.node.name, o])), [order]);
  const nodeOf = (name) => byName.get(name)?.node;

  /* الأسئلة السابقة التي يمكن بناء شرط عليها */
  const priorFor = (name) => {
    const idx = order.findIndex((o) => o.node.name === name);
    const me = order[idx];
    return order.slice(0, idx)
      .filter((o) => o.scope === null || o.scope === me?.scope)
      .map((o) => o.node)
      .filter((n) => LOGIC_SOURCE_TYPES.has(n.type) && n.type !== 'repeat' && n.type !== 'note');
  };

  /* ترقيم متصل عبر الأقسام، والأسئلة داخل المجموعة ترقيم فرعي */
  const numbers = useMemo(() => {
    const map = new Map();
    let n = 0;
    pages.forEach((p) => p.children.forEach((node) => {
      n += 1;
      map.set(node.name, n);
      node.children?.forEach((c, j) => map.set(c.name, `${n}.${j + 1}`));
    }));
    return map;
  }, [pages]);

  const total = order.filter((o) => o.node.type !== 'note' && o.node.type !== 'repeat').length;

  const api = {
    selected,
    justAdded,
    nodeOf,
    priorFor,
    numberOf: (name) => numbers.get(name),
    select: (name) => { setSelected(name); setJustAdded(null); },
    update: (name, patch) => setPages(withList(pages, name, (list, i) => {
      list[i] = { ...list[i], ...patch };
      Object.keys(list[i]).forEach((k) => list[i][k] === undefined && delete list[i][k]);
    })),
    remove: (name) => {
      const n = nodeOf(name);
      if (n?.label && !window.confirm(`حذف السؤال «${n.label}»؟`)) return;
      setPages(withList(pages, name, (list, i) => list.splice(i, 1)));
      if (selected === name) setSelected(null);
    },
    move: (name, d) => setPages(withList(pages, name, (list, i) => {
      const j = i + d;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
    })),
    duplicate: (name) => {
      const names = allNames(pages);
      let copyName = null;
      setPages(withList(pages, name, (list, i) => {
        const copy = clone(list[i]);
        const rename = (n) => { n.name = makeName(names, n.type); n.children?.forEach(rename); };
        rename(copy);
        copy.label = copy.label ? `${copy.label} (نسخة)` : '';
        copyName = copy.name;
        list.splice(i + 1, 0, copy);
      }));
      setSelected(copyName); setJustAdded(copyName);
    },
  };

  /* الإضافة: بعد السؤال المحدد، وداخل المجموعة المتكررة إن كان المحدد فيها أو كانت هي المحددة */
  const add = (type) => {
    const names = allNames(pages);
    const node = newNode(type, names);
    const sel = selected ? byName.get(selected) : null;
    let next;
    if (sel && sel.node.type === 'repeat' && type !== 'repeat') {
      next = withList(pages, sel.node.name, (list, i) => { list[i].children = [...(list[i].children || []), node]; });
    } else if (sel && !(sel.scope && type === 'repeat')) {
      next = withList(pages, sel.node.name, (list, i) => list.splice(i + 1, 0, node));
    } else if (sel && sel.scope && type === 'repeat') {
      next = withList(pages, sel.scope, (list, i) => list.splice(i + 1, 0, node));
    } else {
      next = clone(pages);
      next[next.length - 1].children.push(node);
    }
    setPages(next);
    setSelected(node.name);
    setJustAdded(node.name);
    setSheet(false);
  };

  const targetLabel = selected ? (nodeOf(selected)?.label || 'السؤال المحدد') : null;

  const setPage = (i, patch) => setPages(pages.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  return (
    <Ctx.Provider value={api}>
      <div className="bx">
        <header className="bx-top">
          <div className="bx-top__titles">
            <input className="bx-top__title" value={survey.title || ''} placeholder="عنوان الاستبيان"
              onChange={(e) => onChange({ ...survey, title: e.target.value })} />
            <input className="bx-top__desc" value={survey.description || ''}
              placeholder="وصف قصير يظهر للمستجيب (اختياري)"
              onChange={(e) => onChange({ ...survey, description: e.target.value })} />
          </div>
          <div className="bx-top__side">
            <span className="bx-top__count"><strong>{total}</strong> {total === 1 ? 'سؤال' : 'أسئلة'}</span>
            {actions}
          </div>
        </header>

        <div className="bx-body">
          <aside className="bx-side">
            <Palette onPick={add} target={targetLabel} />
          </aside>

          <div className="bx-main" onClick={(e) => { if (e.target === e.currentTarget) setSelected(null); }}>
            {pages.map((page, pi) => (
              <section className="bx-page" key={page.name}>
                <div className="bx-page__head">
                  <span className="bx-page__badge">القسم {pi + 1}</span>
                  <input className="bx-page__title" value={page.title} placeholder="اسم القسم"
                    onChange={(e) => setPage(pi, { title: e.target.value })} />
                  {pages.length > 1 && (
                    <span className="bx-card__tools bx-page__tools">
                      <button type="button" className="bx-mini" disabled={pi === 0} aria-label="نقل القسم لأعلى"
                        onClick={() => { const n = [...pages]; [n[pi - 1], n[pi]] = [n[pi], n[pi - 1]]; setPages(n); }}>↑</button>
                      <button type="button" className="bx-mini" disabled={pi === pages.length - 1} aria-label="نقل القسم لأسفل"
                        onClick={() => { const n = [...pages]; [n[pi + 1], n[pi]] = [n[pi], n[pi + 1]]; setPages(n); }}>↓</button>
                      <button type="button" className="bx-mini bx-mini--del" aria-label="حذف القسم"
                        onClick={() => {
                          if (page.children.length && !window.confirm(`حذف «${page.title}» مع ${page.children.length} أسئلة؟`)) return;
                          setPages(pages.filter((_, j) => j !== pi));
                        }}>✕</button>
                    </span>
                  )}
                </div>
                <NodeList list={page.children} />
              </section>
            ))}

            <button type="button" className="bx-addpage"
              onClick={() => setPages([...pages, { name: `page_${Date.now().toString(36)}`, title: `القسم ${pages.length + 1}`, children: [] }])}>
              + قسم جديد
              <span>يظهر للمستجيب كصفحة مستقلة</span>
            </button>
          </div>
        </div>

        {/* الهاتف: اللوحة الجانبية تصير زراً ولوحة منبثقة */}
        <button type="button" className="bx-fab" onClick={() => setSheet(true)}>+ إضافة سؤال</button>
        {sheet && (
          <div className="bx-sheet" role="dialog" aria-label="أضف سؤالاً">
            <button type="button" className="bx-sheet__scrim" aria-label="إغلاق" onClick={() => setSheet(false)} />
            <div className="bx-sheet__panel">
              <Palette onPick={add} target={targetLabel} />
            </div>
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}

import { useState } from 'react';
import { QUESTION_TYPES } from '../survey/schema';
import { checkExpression } from '../survey/expression';
import Icon from '../components/Icon';

/*
  باني الاستبيان.
  ينتج نفس تعريف الاستبيان الذي يفهمه المحرك — فما يُبنى هنا
  يُعرض هناك بلا أي تحويل.
*/

/* وصف قصير لكل نوع يشرح متى يُستخدم */
const TYPE_INFO = {
  text: 'اسم، رقم هاتف، إجابة من سطر',
  textarea: 'وصف أو ملاحظة من عدة أسطر',
  note: 'نص إرشادي للقارئ بلا إجابة',
  integer: 'عدد صحيح: أشخاص، وحدات، أيام',
  decimal: 'رقم بكسور: مساحة، نسبة، وزن',
  range: 'تقييم بأزرار من ١ إلى ٥',
  select_one: 'إجابة واحدة من قائمة',
  select_multiple: 'أكثر من إجابة من قائمة',
  rank: 'ترتيب الخيارات حسب الأولوية',
  date: 'يوم وشهر وسنة',
  time: 'ساعة ودقيقة',
  datetime: 'تاريخ ووقت معاً',
  admin_area: 'محافظة ثم ناحية من حدود سوريا',
  geopoint: 'إحداثيات من مستشعر الجهاز',
  image: 'التقاط صورة أو إرفاقها',
  repeat: 'مجموعة أسئلة تتكرر بعدد مفتوح',
};

const GROUPS = [
  { label: 'نصوص', types: ['text', 'textarea', 'note'] },
  { label: 'أرقام', types: ['integer', 'decimal', 'range'] },
  { label: 'اختيارات', types: ['select_one', 'select_multiple', 'rank'] },
  { label: 'زمن', types: ['date', 'time', 'datetime'] },
  { label: 'مكان', types: ['admin_area', 'geopoint'] },
  { label: 'مرفقات ومجموعات', types: ['image', 'repeat'] },
];

const HAS_CHOICES = (t) => QUESTION_TYPES[t]?.hasChoices;

function makeName(existing, type) {
  let i = 1;
  let candidate = `${type}_${i}`;
  while (existing.has(candidate)) {
    i += 1;
    candidate = `${type}_${i}`;
  }
  return candidate;
}

function collectNames(pages) {
  const names = new Set();
  const walk = (list) => {
    for (const n of list || []) {
      names.add(n.name);
      if (n.children) walk(n.children);
    }
  };
  pages.forEach((p) => walk(p.children));
  return names;
}

/* ---------------- شبكة اختيار النوع ---------------- */

function TypePicker({ onPick, onCancel, allowRepeat = true }) {
  return (
    <div className="tpick">
      <div className="tpick__head">
        <h4>أي نوع من الأسئلة تريد؟</h4>
        <button type="button" className="tpick__close" onClick={onCancel} aria-label="إغلاق">✕</button>
      </div>

      {GROUPS.map((g) => {
        const types = g.types.filter((t) => allowRepeat || t !== 'repeat');
        if (!types.length) return null;
        return (
          <div className="tpick__group" key={g.label}>
            <span className="tpick__grouplabel">{g.label}</span>
            <div className="tpick__grid">
              {types.map((t) => (
                <button key={t} type="button" className="tpick__card" onClick={() => onPick(t)}>
                  <Icon name={`t_${t}`} className="tpick__icon" />
                  <span className="tpick__name">{QUESTION_TYPES[t].label}</span>
                  <span className="tpick__desc">{TYPE_INFO[t]}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- محرر الخيارات ---------------- */

function ChoicesEditor({ choices = [], onChange }) {
  const [text, setText] = useState(
    choices.map((c) => (c.label === c.value ? c.label : `${c.label} | ${c.value}`)).join('\n'),
  );

  const apply = (raw) => {
    setText(raw);
    onChange(
      raw.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
        const [label, value] = line.split('|').map((s) => s.trim());
        return { label, value: value || label };
      }),
    );
  };

  const count = text.split('\n').filter((l) => l.trim()).length;

  return (
    <label className="bf">
      <span className="bf__label">الخيارات<span className="bf__count">{count}</span></span>
      <textarea
        className="q-input q-input--area bf__input"
        rows={Math.min(Math.max(count + 1, 3), 9)}
        value={text}
        placeholder="اكتب خياراً في كل سطر"
        onChange={(e) => apply(e.target.value)}
      />
      <span className="bf__hint">
        خيار في كل سطر. لتخزين قيمة مختلفة عن النص المعروض اكتب: النص | القيمة
      </span>
    </label>
  );
}

/* ---------------- محرر التعبير ---------------- */

function ExpressionField({ label, icon, hint, example, value, onChange, fields }) {
  const [open, setOpen] = useState(Boolean(value));
  const check = value ? checkExpression(value) : { valid: true };

  if (!open) {
    return (
      <button type="button" className="bf__add" onClick={() => setOpen(true)}>
        <Icon name={icon} className="bf__addicon" />
        {label}
      </button>
    );
  }

  return (
    <div className="bf bf--expr">
      <span className="bf__label">{label}</span>
      <input
        className={`q-input bf__input bf__input--code${!check.valid ? ' is-bad' : ''}`}
        value={value || ''}
        placeholder={example}
        dir="ltr"
        onChange={(e) => onChange(e.target.value)}
      />
      {!check.valid ? <span className="bf__err">{check.error}</span>
        : <span className="bf__hint">{hint}</span>}
      {fields.length > 0 && (
        <div className="bf__fields">
          <span>أدرج حقلاً:</span>
          {fields.map((f) => (
            <button key={f} type="button" className="bf__chip"
              onClick={() => onChange(`${value || ''}\${${f}}`)}>{f}</button>
          ))}
        </div>
      )}
      <button type="button" className="bf__remove"
        onClick={() => { onChange(''); setOpen(false); }}>إزالة</button>
    </div>
  );
}

/* ---------------- بطاقة سؤال ---------------- */

function QuestionCard({
  node, index, onChange, onDelete, onMove, fields, isFirst, isLast, depth = 0,
}) {
  const [open, setOpen] = useState(!node.label);
  const set = (patch) => onChange({ ...node, ...patch });

  const badExpr = [node.relevant, node.constraint]
    .filter(Boolean).some((e) => !checkExpression(e).valid);

  return (
    <div className={`bq${open ? ' is-open' : ''}${badExpr ? ' is-bad' : ''}`}>
      <div className="bq__bar">
        <span className="bq__index">{index}</span>
        <span className="bq__icon"><Icon name={`t_${node.type}`} /></span>

        <button type="button" className="bq__toggle" onClick={() => setOpen(!open)}>
          <span className="bq__title">
            {node.label || <em className="bq__untitled">اكتب نص السؤال</em>}
          </span>
          <span className="bq__sub">
            <span>{QUESTION_TYPES[node.type]?.label}</span>
            {node.required && <span className="bq__flag bq__flag--req">مطلوب</span>}
            {node.relevant && <span className="bq__flag bq__flag--cond">يظهر بشرط</span>}
            {node.constraint && <span className="bq__flag">مقيّد</span>}
            {HAS_CHOICES(node.type) && (
              <span className="bq__flag">{(node.choices || []).length} خيارات</span>
            )}
          </span>
        </button>

        <div className="bq__tools">
          <button type="button" className="bq__tool" disabled={isFirst}
            onClick={() => onMove(-1)} aria-label="نقل لأعلى">↑</button>
          <button type="button" className="bq__tool" disabled={isLast}
            onClick={() => onMove(1)} aria-label="نقل لأسفل">↓</button>
          <button type="button" className="bq__tool bq__tool--del"
            onClick={onDelete} aria-label="حذف السؤال">✕</button>
        </div>
      </div>

      {open && (
        <div className="bq__body">
          <label className="bf">
            <span className="bf__label">نص السؤال</span>
            <input className="q-input bf__input" value={node.label || ''}
              placeholder="ما الذي تريد سؤاله؟" autoFocus={!node.label}
              onChange={(e) => set({ label: e.target.value })} />
          </label>

          {node.type !== 'note' && (
            <label className="bf">
              <span className="bf__label">تلميح تحت السؤال</span>
              <input className="q-input bf__input" value={node.hint || ''}
                placeholder="اختياري — يوضّح كيف يُجاب"
                onChange={(e) => set({ hint: e.target.value })} />
            </label>
          )}

          {HAS_CHOICES(node.type) && (
            <ChoicesEditor choices={node.choices} onChange={(choices) => set({ choices })} />
          )}

          {(node.type === 'integer' || node.type === 'decimal' || node.type === 'range') && (
            <div className="bf__row">
              <label className="bf">
                <span className="bf__label">أقل قيمة</span>
                <input className="q-input bf__input" type="number" value={node.min ?? ''}
                  onChange={(e) => set({ min: e.target.value === '' ? undefined : Number(e.target.value) })} />
              </label>
              <label className="bf">
                <span className="bf__label">أكبر قيمة</span>
                <input className="q-input bf__input" type="number" value={node.max ?? ''}
                  onChange={(e) => set({ max: e.target.value === '' ? undefined : Number(e.target.value) })} />
              </label>
              {node.type !== 'range' && (
                <label className="bf">
                  <span className="bf__label">الوحدة</span>
                  <input className="q-input bf__input" value={node.unit || ''} placeholder="شخص، متر…"
                    onChange={(e) => set({ unit: e.target.value })} />
                </label>
              )}
            </div>
          )}

          {node.type === 'range' && (
            <div className="bf__row">
              <label className="bf">
                <span className="bf__label">وصف أدنى درجة</span>
                <input className="q-input bf__input" value={node.minLabel || ''} placeholder="ضعيف"
                  onChange={(e) => set({ minLabel: e.target.value })} />
              </label>
              <label className="bf">
                <span className="bf__label">وصف أعلى درجة</span>
                <input className="q-input bf__input" value={node.maxLabel || ''} placeholder="ممتاز"
                  onChange={(e) => set({ maxLabel: e.target.value })} />
              </label>
            </div>
          )}

          {node.type === 'image' && (
            <label className="bf bf--switch">
              <input type="checkbox" checked={Boolean(node.capture)}
                onChange={(e) => set({ capture: e.target.checked })} />
              <span>فتح الكاميرا مباشرة
                <small>مناسب للعمل الميداني بدل الاختيار من المعرض</small></span>
            </label>
          )}

          {node.type !== 'note' && (
            <label className="bf bf--switch">
              <input type="checkbox" checked={Boolean(node.required)}
                onChange={(e) => set({ required: e.target.checked })} />
              <span>إجابة مطلوبة
                <small>لا يمكن المتابعة قبل الإجابة</small></span>
            </label>
          )}

          <div className="bf__adds">
            <ExpressionField
              label="إظهار السؤال بشرط" icon="t_select_one" example="${age} >= 18"
              hint="يظهر السؤال فقط عندما يتحقق الشرط."
              value={node.relevant} fields={fields}
              onChange={(relevant) => set({ relevant })} />
            {node.type !== 'note' && (
              <ExpressionField
                label="قيد على الإجابة" icon="check" example="${children} <= ${members}"
                hint="تُرفض الإجابة إذا لم يتحقق القيد."
                value={node.constraint} fields={fields}
                onChange={(constraint) => set({ constraint })} />
            )}
          </div>

          {node.constraint && (
            <label className="bf">
              <span className="bf__label">رسالة الخطأ</span>
              <input className="q-input bf__input" value={node.constraintMessage || ''}
                placeholder="تظهر للمستجيب عند مخالفة القيد"
                onChange={(e) => set({ constraintMessage: e.target.value })} />
            </label>
          )}

          {node.type === 'repeat' && depth === 0 && (
            <div className="bq__nested">
              <div className="bf__row">
                <label className="bf">
                  <span className="bf__label">اسم المدخل الواحد</span>
                  <input className="q-input bf__input" value={node.itemLabel || ''} placeholder="أسرة، فرد…"
                    onChange={(e) => set({ itemLabel: e.target.value })} />
                </label>
                <label className="bf">
                  <span className="bf__label">أقل عدد</span>
                  <input className="q-input bf__input" type="number" value={node.minCount ?? ''}
                    onChange={(e) => set({ minCount: e.target.value === '' ? undefined : Number(e.target.value) })} />
                </label>
                <label className="bf">
                  <span className="bf__label">أكبر عدد</span>
                  <input className="q-input bf__input" type="number" value={node.maxCount ?? ''}
                    onChange={(e) => set({ maxCount: e.target.value === '' ? undefined : Number(e.target.value) })} />
                </label>
              </div>
              <NodeList nodes={node.children || []} fields={fields} depth={1}
                title="الأسئلة التي تتكرر"
                onChange={(children) => set({ children })} />
            </div>
          )}

          <p className="bf__name">المعرّف في البيانات: <code>{node.name}</code></p>
        </div>
      )}
    </div>
  );
}

/* ---------------- قائمة الأسئلة ---------------- */

function NodeList({ nodes, onChange, fields, depth = 0, title }) {
  const [picking, setPicking] = useState(false);

  const add = (type) => {
    const names = new Set(nodes.map((n) => n.name));
    const node = { name: makeName(names, type), type, label: '' };
    if (HAS_CHOICES(type)) node.choices = [];
    if (type === 'range') { node.min = 1; node.max = 5; }
    if (type === 'repeat') { node.children = []; node.itemLabel = 'مدخل'; }
    onChange([...nodes, node]);
    setPicking(false);
  };

  const update = (i, node) => onChange(nodes.map((n, j) => (j === i ? node : n)));
  const remove = (i) => onChange(nodes.filter((_, j) => j !== i));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= nodes.length) return;
    const copy = [...nodes];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    onChange(copy);
  };

  return (
    <div className={`bl${depth ? ' bl--nested' : ''}`}>
      {title && <h4 className="bl__title">{title}</h4>}

      {nodes.length === 0 && !picking && (
        <div className="bl__empty">
          <Icon name="t_textarea" className="bl__emptyicon" />
          <p>لا أسئلة بعد. أضف أول سؤال لتبدأ.</p>
        </div>
      )}

      {nodes.map((node, i) => (
        <QuestionCard
          key={node.name}
          node={node}
          index={i + 1}
          depth={depth}
          fields={fields.filter((f) => f !== node.name)}
          isFirst={i === 0}
          isLast={i === nodes.length - 1}
          onChange={(n) => update(i, n)}
          onDelete={() => remove(i)}
          onMove={(d) => move(i, d)}
        />
      ))}

      {picking ? (
        <TypePicker onPick={add} onCancel={() => setPicking(false)} allowRepeat={depth === 0} />
      ) : (
        <button type="button" className="bl__add" onClick={() => setPicking(true)}>
          <span className="bl__addplus">+</span>
          إضافة سؤال
        </button>
      )}
    </div>
  );
}

/* ---------------- الباني ---------------- */

export default function SurveyBuilder({ survey, onChange }) {
  const pages = survey.pages || [];
  const fields = [...collectNames(pages)];
  const total = pages.reduce((n, p) => n + (p.children?.length || 0), 0);

  const setPage = (i, patch) =>
    onChange({ ...survey, pages: pages.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  const addPage = () =>
    onChange({
      ...survey,
      pages: [...pages, {
        name: `page_${Date.now().toString(36)}`,
        title: `القسم ${pages.length + 1}`,
        children: [],
      }],
    });

  const removePage = (i) => {
    if (pages.length === 1) return;
    onChange({ ...survey, pages: pages.filter((_, j) => j !== i) });
  };

  const movePage = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= pages.length) return;
    const copy = [...pages];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    onChange({ ...survey, pages: copy });
  };

  return (
    <div className="builder">
      <div className="builder__meta">
        <label className="bf bf--grow">
          <span className="bf__label">عنوان الاستبيان</span>
          <input className="q-input bf__input bf__input--lg" value={survey.title || ''}
            placeholder="مثال: تقييم أضرار المنشآت"
            onChange={(e) => onChange({ ...survey, title: e.target.value })} />
        </label>
        <label className="bf bf--grow">
          <span className="bf__label">وصف يظهر للمستجيب</span>
          <input className="q-input bf__input" value={survey.description || ''}
            placeholder="اختياري — جملة تشرح الغرض"
            onChange={(e) => onChange({ ...survey, description: e.target.value })} />
        </label>
        <div className="builder__count">
          <strong>{total}</strong>
          <span>{total === 1 ? 'سؤال' : 'أسئلة'}</span>
        </div>
      </div>

      {pages.map((page, i) => (
        <section className="bp" key={page.name}>
          <div className="bp__head">
            <span className="bp__badge">{i + 1}</span>
            <input className="bp__title" value={page.title} placeholder="اسم القسم"
              onChange={(e) => setPage(i, { title: e.target.value })} />
            <span className="bp__n">{page.children?.length || 0}</span>
            <div className="bq__tools">
              <button type="button" className="bq__tool" disabled={i === 0}
                onClick={() => movePage(i, -1)} aria-label="نقل القسم لأعلى">↑</button>
              <button type="button" className="bq__tool" disabled={i === pages.length - 1}
                onClick={() => movePage(i, 1)} aria-label="نقل القسم لأسفل">↓</button>
              {pages.length > 1 && (
                <button type="button" className="bq__tool bq__tool--del"
                  onClick={() => removePage(i)} aria-label="حذف القسم">✕</button>
              )}
            </div>
          </div>
          <NodeList nodes={page.children} fields={fields}
            onChange={(children) => setPage(i, { children })} />
        </section>
      ))}

      <button type="button" className="bl__add bl__add--page" onClick={addPage}>
        <span className="bl__addplus">+</span>
        إضافة قسم جديد
      </button>
    </div>
  );
}

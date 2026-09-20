import { useState } from 'react';
import { QUESTION_TYPES } from '../survey/schema';
import { checkExpression } from '../survey/expression';

/*
  باني الاستبيان.

  ينتج نفس تعريف الاستبيان الذي يفهمه المحرك — فما يُبنى هنا
  يُعرض هناك بلا أي تحويل.
*/

const TYPE_GROUPS = [
  { label: 'نصوص', types: ['text', 'textarea', 'note'] },
  { label: 'أرقام', types: ['integer', 'decimal', 'range'] },
  { label: 'اختيارات', types: ['select_one', 'select_multiple', 'rank'] },
  { label: 'زمن', types: ['date', 'time', 'datetime'] },
  { label: 'جغرافيا', types: ['admin_area', 'geopoint'] },
  { label: 'مرفقات', types: ['image'] },
  { label: 'بنيوية', types: ['repeat'] },
];

const HAS_CHOICES = (t) => QUESTION_TYPES[t]?.hasChoices;

/* اسم إنجليزي فريد يُشتق تلقائياً، فالمستخدم لا يتعامل مع الأسماء التقنية */
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

/* ---------------- محرر الخيارات ---------------- */

function ChoicesEditor({ choices = [], onChange }) {
  const [text, setText] = useState(
    choices.map((c) => (c.label === c.value ? c.label : `${c.label} | ${c.value}`)).join('\n'),
  );

  const apply = (raw) => {
    setText(raw);
    const list = raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [label, value] = line.split('|').map((s) => s.trim());
        return { label, value: value || label };
      });
    onChange(list);
  };

  return (
    <label className="bf">
      <span className="bf__label">الخيارات</span>
      <textarea
        className="q-input q-input--area bf__input"
        rows={5}
        value={text}
        placeholder={'خيار في كل سطر\nمثال: نعم\nمثال: لا'}
        onChange={(e) => apply(e.target.value)}
      />
      <span className="bf__hint">
        خيار في كل سطر. لقيمة تخزين مختلفة عن النص المعروض: النص | القيمة
      </span>
    </label>
  );
}

/* ---------------- محرر التعبير الشرطي ---------------- */

function ExpressionField({ label, hint, value, onChange, fields }) {
  const [open, setOpen] = useState(Boolean(value));
  const check = value ? checkExpression(value) : { valid: true };

  if (!open) {
    return (
      <button type="button" className="bf__add" onClick={() => setOpen(true)}>
        + {label}
      </button>
    );
  }

  return (
    <label className="bf">
      <span className="bf__label">{label}</span>
      <input
        className={`q-input bf__input${!check.valid ? ' is-bad' : ''}`}
        value={value || ''}
        placeholder="${field} = 'value'"
        dir="ltr"
        onChange={(e) => onChange(e.target.value)}
      />
      {!check.valid && <span className="bf__err">خطأ: {check.error}</span>}
      <span className="bf__hint">{hint}</span>
      {fields.length > 0 && (
        <span className="bf__fields">
          الحقول المتاحة:{' '}
          {fields.map((f) => (
            <button
              key={f}
              type="button"
              className="bf__chip"
              onClick={() => onChange(`${value || ''}\${${f}}`)}
            >
              {f}
            </button>
          ))}
        </span>
      )}
      <button
        type="button"
        className="bf__remove"
        onClick={() => { onChange(''); setOpen(false); }}
      >
        إزالة الشرط
      </button>
    </label>
  );
}

/* ---------------- محرر سؤال ---------------- */

function QuestionEditor({ node, onChange, onDelete, onMove, fields, isFirst, isLast, depth = 0 }) {
  const [open, setOpen] = useState(false);
  const set = (patch) => onChange({ ...node, ...patch });

  return (
    <div className={`bq${open ? ' is-open' : ''}`}>
      <div className="bq__bar">
        <button type="button" className="bq__toggle" onClick={() => setOpen(!open)}>
          <span className="bq__type">{QUESTION_TYPES[node.type]?.label || node.type}</span>
          <span className="bq__title">{node.label || '(بلا نص)'}</span>
          {node.required && <span className="bq__flag">مطلوب</span>}
          {node.relevant && <span className="bq__flag bq__flag--cond">شرطي</span>}
        </button>
        <div className="bq__tools">
          <button type="button" className="q-btn q-btn--sm" disabled={isFirst} onClick={() => onMove(-1)} title="أعلى">↑</button>
          <button type="button" className="q-btn q-btn--sm" disabled={isLast} onClick={() => onMove(1)} title="أسفل">↓</button>
          <button type="button" className="q-btn q-btn--sm q-btn--danger" onClick={onDelete}>حذف</button>
        </div>
      </div>

      {open && (
        <div className="bq__body">
          <label className="bf">
            <span className="bf__label">نص السؤال</span>
            <input
              className="q-input bf__input"
              value={node.label || ''}
              onChange={(e) => set({ label: e.target.value })}
            />
          </label>

          {node.type !== 'note' && (
            <label className="bf">
              <span className="bf__label">تلميح (اختياري)</span>
              <input
                className="q-input bf__input"
                value={node.hint || ''}
                onChange={(e) => set({ hint: e.target.value })}
              />
            </label>
          )}

          {HAS_CHOICES(node.type) && (
            <ChoicesEditor choices={node.choices} onChange={(choices) => set({ choices })} />
          )}

          {(node.type === 'integer' || node.type === 'decimal' || node.type === 'range') && (
            <div className="bf__row">
              <label className="bf">
                <span className="bf__label">أقل قيمة</span>
                <input
                  className="q-input bf__input" type="number" value={node.min ?? ''}
                  onChange={(e) => set({ min: e.target.value === '' ? undefined : Number(e.target.value) })}
                />
              </label>
              <label className="bf">
                <span className="bf__label">أكبر قيمة</span>
                <input
                  className="q-input bf__input" type="number" value={node.max ?? ''}
                  onChange={(e) => set({ max: e.target.value === '' ? undefined : Number(e.target.value) })}
                />
              </label>
              {node.type !== 'range' && (
                <label className="bf">
                  <span className="bf__label">الوحدة</span>
                  <input
                    className="q-input bf__input" value={node.unit || ''}
                    placeholder="مثال: شخص"
                    onChange={(e) => set({ unit: e.target.value })}
                  />
                </label>
              )}
            </div>
          )}

          {node.type !== 'note' && (
            <label className="bf bf--inline">
              <input
                type="checkbox"
                checked={Boolean(node.required)}
                onChange={(e) => set({ required: e.target.checked })}
              />
              <span>سؤال مطلوب</span>
            </label>
          )}

          <ExpressionField
            label="شرط الظهور"
            hint="يظهر السؤال فقط إذا تحقق الشرط. مثال: ${age} >= 18"
            value={node.relevant}
            fields={fields}
            onChange={(relevant) => set({ relevant })}
          />

          {node.type !== 'note' && (
            <ExpressionField
              label="قيد على الإجابة"
              hint="الإجابة مقبولة فقط إذا تحقق. مثال: ${end} >= ${start}"
              value={node.constraint}
              fields={fields}
              onChange={(constraint) => set({ constraint })}
            />
          )}

          {node.constraint && (
            <label className="bf">
              <span className="bf__label">رسالة الخطأ</span>
              <input
                className="q-input bf__input"
                value={node.constraintMessage || ''}
                placeholder="تظهر عند مخالفة القيد"
                onChange={(e) => set({ constraintMessage: e.target.value })}
              />
            </label>
          )}

          {node.type === 'repeat' && depth === 0 && (
            <NodeList
              nodes={node.children || []}
              onChange={(children) => set({ children })}
              fields={fields}
              depth={1}
              title="أسئلة المجموعة المتكررة"
            />
          )}

          <p className="bf__name">المعرّف التقني: <code>{node.name}</code></p>
        </div>
      )}
    </div>
  );
}

/* ---------------- قائمة أسئلة ---------------- */

function NodeList({ nodes, onChange, fields, depth = 0, title }) {
  const [picking, setPicking] = useState(false);

  const add = (type) => {
    const names = new Set(nodes.map((n) => n.name));
    const node = {
      name: makeName(names, type),
      type,
      label: '',
    };
    if (HAS_CHOICES(type)) node.choices = [{ label: 'نعم', value: 'yes' }, { label: 'لا', value: 'no' }];
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

      {nodes.length === 0 && <p className="bl__empty">لا توجد أسئلة بعد.</p>}

      {nodes.map((node, i) => (
        <QuestionEditor
          key={node.name}
          node={node}
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
        <div className="bl__picker">
          {TYPE_GROUPS.map((g) => (
            <div key={g.label} className="bl__group">
              <span className="bl__grouplabel">{g.label}</span>
              <div className="bl__types">
                {g.types
                  .filter((t) => !(depth > 0 && t === 'repeat'))
                  .map((t) => (
                    <button key={t} type="button" className="bl__type" onClick={() => add(t)}>
                      {QUESTION_TYPES[t].label}
                    </button>
                  ))}
              </div>
            </div>
          ))}
          <button type="button" className="q-btn q-btn--sm" onClick={() => setPicking(false)}>
            إلغاء
          </button>
        </div>
      ) : (
        <button type="button" className="q-btn q-btn--add" onClick={() => setPicking(true)}>
          + إضافة سؤال
        </button>
      )}
    </div>
  );
}

/* ---------------- الباني ---------------- */

export default function SurveyBuilder({ survey, onChange }) {
  const pages = survey.pages || [];
  const fields = [...collectNames(pages)];

  const setPage = (i, patch) =>
    onChange({ ...survey, pages: pages.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  const addPage = () =>
    onChange({
      ...survey,
      pages: [...pages, { name: `page_${pages.length + 1}`, title: `القسم ${pages.length + 1}`, children: [] }],
    });

  const removePage = (i) => {
    if (pages.length === 1) return;
    onChange({ ...survey, pages: pages.filter((_, j) => j !== i) });
  };

  return (
    <div className="builder">
      <div className="bf__row">
        <label className="bf bf--grow">
          <span className="bf__label">عنوان الاستبيان</span>
          <input
            className="q-input bf__input"
            value={survey.title || ''}
            onChange={(e) => onChange({ ...survey, title: e.target.value })}
          />
        </label>
      </div>

      <label className="bf">
        <span className="bf__label">وصف مختصر</span>
        <input
          className="q-input bf__input"
          value={survey.description || ''}
          onChange={(e) => onChange({ ...survey, description: e.target.value })}
        />
      </label>

      {pages.map((page, i) => (
        <section className="bp" key={page.name}>
          <div className="bp__head">
            <input
              className="q-input bp__title"
              value={page.title}
              onChange={(e) => setPage(i, { title: e.target.value })}
            />
            {pages.length > 1 && (
              <button type="button" className="q-btn q-btn--sm q-btn--danger" onClick={() => removePage(i)}>
                حذف القسم
              </button>
            )}
          </div>
          <NodeList
            nodes={page.children}
            fields={fields}
            onChange={(children) => setPage(i, { children })}
          />
        </section>
      ))}

      <button type="button" className="q-btn q-btn--add" onClick={addPage}>
        + إضافة قسم
      </button>
    </div>
  );
}

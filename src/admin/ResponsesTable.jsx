import { useMemo, useState } from 'react';
import { flattenQuestions } from '../survey/schema';
import { RESPONSE_STATUS } from '../projects/store';

/*
  جدول الإجابات مع المراجعة.

  كل إجابة تمر بدورة: بانتظار المراجعة ← معتمد أو مرفوض.
  التقرير المنشور يعرض المعتمد فقط.
*/

/* تحويل قيمة إجابة إلى نص للعرض في خلية */
function display(value, node, areas) {
  if (value === null || value === undefined || value === '') return '—';

  if (node?.choices) {
    const list = Array.isArray(value) ? value : [value];
    return list
      .map((v) => node.choices.find((c) => String(c.value) === String(v))?.label ?? v)
      .join('، ');
  }

  if (node?.type === 'admin_area') {
    const gov = areas?.gov?.get(value.governorate)?.name || value.governorate;
    const sub = areas?.sub?.get(value.subdistrict)?.name || value.subdistrict;
    return sub ? `${gov} — ${sub}` : gov || '—';
  }

  if (node?.type === 'geopoint') {
    return `${Number(value.lat).toFixed(4)}, ${Number(value.lng).toFixed(4)}`;
  }

  if (node?.type === 'image') return value?.dataUrl ? 'صورة مرفقة' : '—';

  if (Array.isArray(value)) {
    /* مجموعة متكررة */
    if (value.length && typeof value[0] === 'object') return `${value.length} مدخل`;
    return value.join('، ');
  }

  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/* ---------------- لوحة تفاصيل إجابة ---------------- */

function DetailPanel({ response, questions, areas, onEdit, onClose, onReview, onDelete }) {
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');

  const startEdit = (name, current) => {
    setEditing(name);
    setDraft(typeof current === 'object' ? JSON.stringify(current) : String(current ?? ''));
  };

  const save = (node) => {
    let value = draft;
    if (node.type === 'integer' || node.type === 'decimal' || node.type === 'range') {
      value = draft === '' ? '' : Number(draft);
    }
    onEdit(response.id, editing, value);
    setEditing(null);
  };

  return (
    <div className="detail">
      <div className="detail__head">
        <h3>تفاصيل الإجابة</h3>
        <button type="button" className="q-btn q-btn--sm" onClick={onClose}>إغلاق</button>
      </div>

      <div className="detail__meta">
        <span className={`tag tag--${response.status}`}>{RESPONSE_STATUS[response.status]}</span>
        <span className="detail__stamp">
          أُرسلت {new Date(response.submittedAt).toLocaleString('ar-SY')}
        </span>
        {response.edited && <span className="tag tag--edited">عُدّلت</span>}
      </div>

      <div className="detail__rows">
        {questions.map((node) => {
          const value = response.answers[node.name];
          const isEditing = editing === node.name;
          const editable = !['image', 'geopoint', 'admin_area', 'repeat'].includes(node.type);

          return (
            <div className="detail__row" key={node.name}>
              <span className="detail__key">{node.label || node.name}</span>
              {isEditing ? (
                <span className="detail__edit">
                  <input
                    className="q-input"
                    value={draft}
                    autoFocus
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <button type="button" className="q-btn q-btn--sm" onClick={() => save(node)}>حفظ</button>
                  <button type="button" className="q-btn q-btn--sm" onClick={() => setEditing(null)}>إلغاء</button>
                </span>
              ) : (
                <span className="detail__val">
                  {node.type === 'image' && value?.dataUrl ? (
                    <img className="detail__img" src={value.dataUrl} alt="مرفق" />
                  ) : (
                    display(value, node, areas)
                  )}
                  {editable && (
                    <button
                      type="button"
                      className="detail__editbtn"
                      onClick={() => startEdit(node.name, value)}
                    >
                      تعديل
                    </button>
                  )}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {response.history?.length > 1 && (
        <details className="detail__history">
          <summary>سجل التغييرات ({response.history.length})</summary>
          <ul>
            {response.history.map((h, i) => (
              <li key={i}>
                {new Date(h.at).toLocaleString('ar-SY')} — {h.action}
                {h.by ? ` بواسطة ${h.by}` : ''}
                {h.field ? ` (${h.field})` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="detail__actions">
        <button
          type="button"
          className="q-btn q-btn--ok"
          onClick={() => onReview(response.id, 'approved')}
          disabled={response.status === 'approved'}
        >
          اعتماد
        </button>
        <button
          type="button"
          className="q-btn"
          onClick={() => onReview(response.id, 'rejected')}
          disabled={response.status === 'rejected'}
        >
          رفض
        </button>
        <button type="button" className="q-btn q-btn--danger" onClick={() => onDelete(response.id)}>
          حذف نهائي
        </button>
      </div>
    </div>
  );
}

/* ---------------- الجدول ---------------- */

export default function ResponsesTable({
  responses, survey, areas, onReview, onEdit, onDelete, onBulk,
}) {
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(new Set());
  const [detail, setDetail] = useState(null);

  const questions = useMemo(
    () => flattenQuestions(survey.pages.flatMap((p) => p.children))
      .filter((q) => q.type !== 'note'),
    [survey],
  );

  /* أول ست أعمدة فقط في الجدول — الباقي في لوحة التفاصيل */
  const columns = questions.slice(0, 6);

  const rows = filter === 'all' ? responses : responses.filter((r) => r.status === filter);

  const counts = useMemo(() => ({
    all: responses.length,
    pending: responses.filter((r) => r.status === 'pending').length,
    approved: responses.filter((r) => r.status === 'approved').length,
    rejected: responses.filter((r) => r.status === 'rejected').length,
  }), [responses]);

  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  };

  const runBulk = async (status) => {
    await onBulk([...selected], status);
    setSelected(new Set());
  };

  const current = detail ? responses.find((r) => r.id === detail) : null;

  return (
    <div className="results">
      <div className="results__bar">
        <div className="results__filters">
          {[
            ['all', 'الكل'],
            ['pending', 'بانتظار المراجعة'],
            ['approved', 'معتمد'],
            ['rejected', 'مرفوض'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`results__filter${filter === key ? ' is-on' : ''}`}
              onClick={() => { setFilter(key); setSelected(new Set()); }}
            >
              {label} <span className="results__badge">{counts[key]}</span>
            </button>
          ))}
        </div>

        {selected.size > 0 && (
          <div className="results__bulk">
            <span>{selected.size} محدّد</span>
            <button type="button" className="q-btn q-btn--sm q-btn--ok" onClick={() => runBulk('approved')}>
              اعتماد
            </button>
            <button type="button" className="q-btn q-btn--sm" onClick={() => runBulk('rejected')}>
              رفض
            </button>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="results__empty">
          {responses.length === 0
            ? 'لم تصل أي إجابة بعد.'
            : 'لا توجد إجابات بهذه الحالة.'}
        </p>
      ) : (
        <div className="results__scroll">
          <table className="results__table">
            <thead>
              <tr>
                <th className="results__check">
                  <input
                    type="checkbox"
                    checked={selected.size === rows.length && rows.length > 0}
                    onChange={toggleAll}
                    aria-label="تحديد الكل"
                  />
                </th>
                <th>الحالة</th>
                <th>التاريخ</th>
                {columns.map((q) => <th key={q.name}>{q.label || q.name}</th>)}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={selected.has(r.id) ? 'is-selected' : ''}>
                  <td className="results__check">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      aria-label="تحديد"
                    />
                  </td>
                  <td>
                    <span className={`tag tag--${r.status}`}>{RESPONSE_STATUS[r.status]}</span>
                  </td>
                  <td className="results__date">
                    {new Date(r.submittedAt).toLocaleDateString('en-GB')}
                  </td>
                  {columns.map((q) => (
                    <td key={q.name}>{display(r.answers[q.name], q, areas)}</td>
                  ))}
                  <td>
                    <button type="button" className="q-btn q-btn--sm" onClick={() => setDetail(r.id)}>
                      عرض
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {current && (
        <DetailPanel
          response={current}
          questions={questions}
          areas={areas}
          onEdit={onEdit}
          onReview={onReview}
          onDelete={async (id) => { await onDelete(id); setDetail(null); }}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

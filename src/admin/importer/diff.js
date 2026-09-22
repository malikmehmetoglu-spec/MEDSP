/*
  المقارنة بين ملف مرفوع وبيانات المشروع الحالية.

  المفتاح: أعمدة تحدد «هذا السجل هو ذاك» (المرحلة + المحافظة في ملف
  الأنقاض). لكل صف في الملف: إن طابق مفتاحه سجلاً موجوداً فهو تحديث
  (أو بلا تغيير)، وإلا فهو جديد. والسجلات الموجودة التي لا يطابقها صف:
  «اختفت من الملف» — والقرار فيها للمستخدم، لا تُحذف تلقائياً أبداً.

  الحقول غير المربوطة بعمود تبقى كما هي، والمحسوبة يُعاد حسابها.
*/

import { normalize, toNumber, toDateString, cleanText, matchGovernorate } from './parse.js';
import { applyCalculations } from '../../survey/runtime.js';

/* يحوّل قيمة من الخلية إلى ما يخزّنه السؤال — أو يبلّغ عن المشكلة */
export function convert(node, raw, govIdx) {
  if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
    return { value: undefined };
  }
  switch (node.type) {
    case 'integer':
    case 'decimal': {
      const n = toNumber(raw);
      return n === null ? { issue: `«${raw}» ليس رقماً` } : { value: n };
    }
    case 'select_one': {
      const t = normalize(raw);
      const c = (node.choices || []).find((x) => normalize(x.label) === t || normalize(x.value) === t);
      return c ? { value: c.value } : { value: cleanText(raw), newChoice: cleanText(raw) };
    }
    case 'admin_area': {
      const g = matchGovernorate(raw, govIdx);
      return g ? { value: { governorate: g.code, subdistrict: '' } } : { issue: `محافظة غير معروفة: «${raw}»` };
    }
    case 'date':
    case 'datetime': {
      const d = toDateString(raw);
      return d ? { value: d } : { issue: `«${raw}» ليس تاريخاً` };
    }
    default:
      return { value: cleanText(raw) };
  }
}

/* قيمة المفتاح بصيغة قابلة للمقارنة */
function keyPart(node, v) {
  if (v === undefined || v === null || v === '') return '';
  if (node.type === 'admin_area') return v.governorate || '';
  if (typeof v === 'number') return String(v);
  return normalize(v);
}

const same = (a, b) => {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9;
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
};

/*
  table     { rows: [{ row, values }] }
  mapping   { [columnIndex]: questionName }
  keys      [questionName, ...]
  existing  الاستجابات الحالية
*/
const blankToNull = (v) => (v === '' || v === undefined ? null : v);

export function computeDiff({ survey, table, mapping, keys, existing, govIdx, govName }) {
  const nodes = survey.pages.flatMap((p) => p.children);
  const byName = new Map(nodes.map((n) => [n.name, n]));
  const mapped = Object.entries(mapping).filter(([, q]) => q && byName.has(q));
  /* المحسوبة والمشتقة تتبع مصادرها: لا تُعدّ تغييراً بذاتها */
  const derivedNames = nodes.filter((n) => n.type === 'calculate' || n.derive).map((n) => n.name);
  const sourceNames = [...new Set(mapped.map(([, q]) => q))].filter((q) => !derivedNames.includes(q));

  const issues = [];
  const newChoices = new Map();

  /* صفوف الملف → إجابات */
  const incoming = table.rows.map((r) => {
    const answers = {};
    for (const [col, q] of mapped) {
      const res = convert(byName.get(q), r.values[Number(col)], govIdx);
      if (res.issue) issues.push({ row: r.row, field: byName.get(q).label, message: res.issue });
      if (res.newChoice) {
        const set = newChoices.get(q) || new Set();
        set.add(res.newChoice);
        newChoices.set(q, set);
      }
      if (res.value !== undefined) answers[q] = res.value;
    }
    return { row: r.row, answers };
  });

  const keyOf = (answers) => keys.map((k) => keyPart(byName.get(k), answers[k])).join(' | ');
  /* المفتاح بأسمائه للعرض: «المرحلة الثالثة — حلب» */
  const labelOf = (answers) => keys.map((k) => {
    const n = byName.get(k);
    const v = answers?.[k];
    if (v === undefined || v === null || v === '') return '—';
    if (n.type === 'admin_area') return govName?.(v.governorate) || v.governorate;
    return n.choices?.find((c) => String(c.value) === String(v))?.label ?? String(v);
  }).join(' — ');

  /* تكرار المفتاح في الملف يمنع التطبيق — لا نعرف أي الصفين هو الصحيح */
  const seen = new Map();
  for (const inc of incoming) {
    if (!keys.length) break;
    const k = keyOf(inc.answers);
    if (!k.replace(/[\s|]/g, '')) {
      issues.push({ row: inc.row, field: 'المفتاح', message: 'قيم المفتاح فارغة', blocking: true });
      continue;
    }
    if (seen.has(k)) {
      issues.push({ row: inc.row, field: 'المفتاح', message: `مكرر مع الصف ${seen.get(k)} (${k})`, blocking: true });
    } else seen.set(k, inc.row);
  }

  const existingByKey = new Map();
  if (keys.length) {
    for (const e of existing) {
      const k = keyOf(e.answers || {});
      if (!existingByKey.has(k)) existingByKey.set(k, e);
    }
  }

  const updates = [];
  const inserts = [];
  const unchanged = [];
  const matchedIds = new Set();

  for (const inc of incoming) {
    const k = keys.length ? keyOf(inc.answers) : null;
    const cur = k !== null ? existingByKey.get(k) : null;
    if (cur && !matchedIds.has(cur.id)) {
      matchedIds.add(cur.id);
      const merged = applyCalculations(nodes, { ...(cur.answers || {}), ...inc.answers });
      const diff = (q) => !same(blankToNull(cur.answers?.[q]), blankToNull(merged[q]));
      const changedSources = sourceNames.filter(diff);
      if (changedSources.length) {
        /* تغيّر مصدر: نعرض معه ما تبعه من محسوب (النسبة، الحالة) */
        const changes = [...changedSources, ...derivedNames.filter(diff)].map((q) => ({
          field: q, label: byName.get(q)?.label || q,
          before: cur.answers?.[q] ?? null, after: merged[q] ?? null, derived: derivedNames.includes(q),
        }));
        updates.push({ id: cur.id, row: inc.row, key: k, label: labelOf(merged), answers: merged, changes });
      } else unchanged.push({ id: cur.id, row: inc.row, key: k, label: labelOf(cur.answers) });
    } else {
      const answers = applyCalculations(nodes, inc.answers);
      inserts.push({ row: inc.row, key: k, label: labelOf(answers), answers });
    }
  }

  const missing = keys.length
    ? existing.filter((e) => !matchedIds.has(e.id)).map((e) => ({ id: e.id, key: keyOf(e.answers || {}), label: labelOf(e.answers || {}), answers: e.answers }))
    : [];

  return {
    updates, inserts, unchanged, missing, issues,
    blocking: issues.some((i) => i.blocking),
    newChoices: [...newChoices.entries()].map(([q, set]) => ({ question: q, values: [...set] })),
  };
}

/* أفضل مطابقة لعمود بسؤال: بالاسم بعد حذف الوحدات والأقواس */
export function autoMap(columns, nodes) {
  const strip = (s) => normalize(String(s).replace(/\(.*?\)|m3|م3|م³|%|٪/gi, ''));
  const out = {};
  for (const c of columns) {
    const n = strip(c.name);
    const hit = nodes.find((q) => strip(q.label) === n)
      || nodes.find((q) => n && strip(q.label) && (strip(q.label).includes(n) || n.includes(strip(q.label))));
    if (hit && hit.type !== 'calculate') out[c.index] = hit.name;
  }
  return out;
}

/*
  مفتاح مقترح: أصغر مجموعة من أعمدة الفئات والمحافظات المربوطة تجعل كل
  صف في الملف فريداً.
*/
export function suggestKeys(table, mapping, nodes, govIdx) {
  const byName = new Map(nodes.map((n) => [n.name, n]));
  const cands = Object.entries(mapping)
    .filter(([, q]) => ['select_one', 'admin_area', 'text'].includes(byName.get(q)?.type))
    .map(([col, q]) => ({ col: Number(col), q, type: byName.get(q).type }))
    .sort((a, b) => (a.type === 'text') - (b.type === 'text'));
  const unique = (set) => {
    const ks = table.rows.map((r) => set.map((c) => {
      const v = r.values[c.col];
      if (c.type === 'admin_area') return matchGovernorate(v, govIdx)?.code || normalize(v);
      return normalize(v);
    }).join('|'));
    return new Set(ks).size === ks.length;
  };
  for (const c of cands) if (unique([c])) return [c.q];
  for (let i = 0; i < cands.length; i += 1) {
    for (let j = i + 1; j < cands.length; j += 1) if (unique([cands[i], cands[j]])) return [cands[i].q, cands[j].q];
  }
  return cands.slice(0, 3).map((c) => c.q);
}

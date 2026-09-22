import { flattenQuestions } from '../survey/schema';

/*
  حساب بيانات التقرير.

  لكل سؤال قابل للعرض يُحسب كل ما قد يحتاجه أي رسم مناسب لنوعه
  (توزيع، إحصاءات رقمية، جغرافيا، سلسلة زمنية، نماذج نصية).
  اختيار الرسم نفسه في reportPlan.js — فتغييره لا يعيد الحساب.
*/

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const blank = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

function labelOf(node, value) {
  if (!node.choices) return String(value);
  return node.choices.find((c) => String(c.value) === String(value))?.label ?? String(value);
}

function distribution(values, node) {
  const counts = new Map();
  for (const v of values) {
    if (blank(v)) continue;
    for (const item of (Array.isArray(v) ? v : [v])) {
      const key = String(item);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return [...counts.entries()]
    .map(([value, count]) => ({
      value, label: labelOf(node, value), count, pct: total ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

function numericStats(values) {
  const xs = values.filter((v) => !blank(v) && Number.isFinite(Number(v))).map(Number);
  if (xs.length === 0) return null;
  const sum = xs.reduce((a, b) => a + b, 0);
  const sorted = [...xs].sort((a, b) => a - b);
  return {
    count: xs.length,
    sum: Math.round(sum * 100) / 100,
    avg: Math.round((sum / xs.length) * 10) / 10,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median: sorted[Math.floor(sorted.length / 2)],
  };
}

function geoSummary(values) {
  const byGov = new Map();
  const bySub = new Map();
  for (const v of values) {
    if (!v?.governorate) continue;
    byGov.set(v.governorate, (byGov.get(v.governorate) || 0) + 1);
    if (v.subdistrict) bySub.set(v.subdistrict, (bySub.get(v.subdistrict) || 0) + 1);
  }
  return {
    byGovernorate: [...byGov.entries()].map(([code, count]) => ({ code, count })),
    bySubdistrict: [...bySub.entries()].map(([code, count]) => ({ code, count })),
    total: [...byGov.values()].reduce((a, b) => a + b, 0),
  };
}

function timeSeries(values) {
  const byDay = new Map();
  for (const v of values) {
    if (!v) continue;
    const day = String(v).slice(0, 10);
    byDay.set(day, (byDay.get(day) || 0) + 1);
  }
  return [...byDay.entries()].map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/* الأنواع التي لها رسم ممكن */
export const REPORTABLE = new Set([
  'select_one', 'select_multiple', 'rank', 'range', 'integer', 'decimal', 'calculate',
  'admin_area', 'date', 'datetime', 'repeat', 'text', 'textarea',
]);

export function buildReport(survey, responses) {
  const questions = flattenQuestions(survey.pages.flatMap((p) => p.children))
    .filter((q) => REPORTABLE.has(q.type));

  const data = new Map();

  for (const node of questions) {
    const values = responses.map((r) => r.answers?.[node.name]);
    const d = { node, answered: values.filter((v) => !blank(v)).length };

    switch (node.type) {
      case 'select_one':
      case 'select_multiple':
      case 'rank':
        d.dist = distribution(values, node);
        break;
      case 'range':
        d.dist = distribution(values, node).sort((a, b) => num(a.value) - num(b.value));
        d.stats = numericStats(values);
        break;
      case 'integer':
      case 'decimal':
      case 'calculate':
        d.stats = numericStats(values);
        break;
      case 'admin_area':
        d.geo = geoSummary(values);
        break;
      case 'date':
      case 'datetime':
        d.series = timeSeries(values);
        break;
      case 'repeat': {
        const rows = values.flatMap((v) => (Array.isArray(v) ? v : []));
        d.rowCount = rows.length;
        d.sums = (node.children || [])
          .filter((c) => ['integer', 'decimal', 'calculate'].includes(c.type))
          .map((c) => ({ node: c, total: rows.reduce((a, row) => a + num(row?.[c.name]), 0) }));
        break;
      }
      case 'text':
      case 'textarea':
        /* الإجابات المتطابقة تُجمع مع عددها، والأحدث أولاً */
        {
          const seen = new Map();
          values.filter((v) => !blank(v)).map((v) => String(v).trim()).reverse().forEach((t) => {
            seen.set(t, (seen.get(t) || 0) + 1);
          });
          d.samples = [...seen.entries()].map(([text, count]) => ({ text, count })).slice(0, 12);
        }
        break;
      default:
        break;
    }
    data.set(node.name, d);
  }

  return { total: responses.length, data, questions };
}

export default buildReport;

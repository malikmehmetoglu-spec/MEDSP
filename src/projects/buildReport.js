import { flattenQuestions } from '../survey/schema';

/*
  توليد التقرير من الإجابات.

  المبدأ: نوع السؤال يحدد شكل عرضه — فلا يحتاج المشرف لتصميم
  التقرير يدوياً. من يريد تخصيصاً يضبط reportAs على السؤال.

    عدد/عشري        → بطاقة إحصائية (مجموع، متوسط)
    اختيار واحد      → رسم حلقي
    اختيار متعدد     → رسم شريطي
    مقياس متدرّج     → توزيع + متوسط
    محافظة/ناحية     → خريطة
    تاريخ            → خط زمني
    نص               → لا يُعرض (يُتاح في الجدول)
*/

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function labelOf(node, value) {
  if (!node.choices) return String(value);
  return node.choices.find((c) => String(c.value) === String(value))?.label ?? String(value);
}

/* توزيع تكراري مرتّب تنازلياً */
function distribution(responses, node) {
  const counts = new Map();
  for (const r of responses) {
    const v = r.answers[node.name];
    if (v === undefined || v === null || v === '') continue;
    const list = Array.isArray(v) ? v : [v];
    for (const item of list) {
      const key = String(item);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return [...counts.entries()]
    .map(([value, count]) => ({
      value,
      label: labelOf(node, value),
      count,
      pct: total ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

function numericSummary(responses, node) {
  const values = responses
    .map((r) => r.answers[node.name])
    .filter((v) => v !== undefined && v !== null && v !== '')
    .map(num);

  if (values.length === 0) return null;

  const sum = values.reduce((a, b) => a + b, 0);
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: values.length,
    sum,
    avg: Math.round((sum / values.length) * 10) / 10,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median: sorted[Math.floor(sorted.length / 2)],
  };
}

/* تجميع جغرافي — يُغذّي الخريطة مباشرة */
function geoSummary(responses, node) {
  const byGov = new Map();
  const bySub = new Map();

  for (const r of responses) {
    const v = r.answers[node.name];
    if (!v?.governorate) continue;
    byGov.set(v.governorate, (byGov.get(v.governorate) || 0) + 1);
    if (v.subdistrict) bySub.set(v.subdistrict, (bySub.get(v.subdistrict) || 0) + 1);
  }

  return {
    byGovernorate: [...byGov.entries()].map(([code, count]) => ({ code, count })),
    bySubdistrict: [...bySub.entries()].map(([code, count]) => ({ code, count })),
    total: responses.length,
  };
}

function timeSeries(responses, node) {
  const byDay = new Map();
  for (const r of responses) {
    const v = r.answers[node.name];
    if (!v) continue;
    const day = String(v).slice(0, 10);
    byDay.set(day, (byDay.get(day) || 0) + 1);
  }
  return [...byDay.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/* ---------------- المولّد ---------------- */

export function buildReport(survey, responses) {
  const questions = flattenQuestions(survey.pages.flatMap((p) => p.children))
    .filter((q) => q.type !== 'note');

  const blocks = [];

  for (const node of questions) {
    if (node.reportAs === 'none') continue;

    switch (node.type) {
      case 'integer':
      case 'decimal':
      case 'calculate': {
        const stats = numericSummary(responses, node);
        if (stats) blocks.push({ kind: 'stat', node, stats });
        break;
      }

      case 'range': {
        const stats = numericSummary(responses, node);
        const dist = distribution(responses, node);
        if (stats) blocks.push({ kind: 'scale', node, stats, dist });
        break;
      }

      case 'select_one': {
        const dist = distribution(responses, node);
        if (dist.length) blocks.push({ kind: 'donut', node, dist });
        break;
      }

      case 'select_multiple':
      case 'rank': {
        const dist = distribution(responses, node);
        if (dist.length) blocks.push({ kind: 'bars', node, dist });
        break;
      }

      case 'admin_area': {
        const geo = geoSummary(responses, node);
        if (geo.byGovernorate.length) blocks.push({ kind: 'map', node, geo });
        break;
      }

      case 'date':
      case 'datetime': {
        const series = timeSeries(responses, node);
        if (series.length > 1) blocks.push({ kind: 'timeline', node, series });
        break;
      }

      case 'repeat': {
        /* نلخّص عدد المدخلات ومجموع الحقول الرقمية داخلها */
        const rows = responses.flatMap((r) => r.answers[node.name] || []);
        if (rows.length) {
          const inner = (node.children || []).filter(
            (c) => c.type === 'integer' || c.type === 'decimal',
          );
          const sums = inner.map((c) => ({
            node: c,
            total: rows.reduce((a, row) => a + num(row[c.name]), 0),
          }));
          blocks.push({ kind: 'repeat', node, rowCount: rows.length, sums });
        }
        break;
      }

      default:
        break;
    }
  }

  return {
    total: responses.length,
    blocks,
    questions,
  };
}

export default buildReport;

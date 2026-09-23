import { useMemo } from 'react';

/*
  يعيد حساب مؤشرات أي تقرير من سجلاته الخام وفق المرشّحات المختارة.
  الحساب يجري في المتصفح فيستجيب فوراً بلا أي طلب للخادم.

  ترتيب أعمدة السجل:
  [0 اليوم, 1 المحافظة, 2 المديرية, 3 المركز, 4 الموقع, ...الأبعاد, ...المقاييس]
*/

const BASE = 5;
const DAY = 0;
const GOV = 1;
const DIR = 2;
const CENTER = 3;
const SITE = 4;

function rank(counts, labels) {
  return counts
    .map((value, i) => ({ label: labels[i], value }))
    .filter((d) => d.value > 0 && d.label)
    .sort((a, b) => b.value - a.value);
}

/* الوسيط أصدق من المتوسط لأزمنة الاستجابة: حالة واحدة شاذة تضخّم المتوسط */
function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/*
  التجميع نفسه يُستدعى مرتين: على كل السجلات المرشّحة، وعلى المجموعة
  المميَّزة (الفلترة المتقاطعة) — فتعرض اللوحات حصة المميَّز من كل فئة.
*/
function aggregate(rows, { dict, dims, metrics }) {
  const govCounts = new Array(dict.govs.length).fill(0);
  const siteCounts = new Array(dict.sites.length).fill(0);
  const dimCounts = dims.map((d) => new Array(d.values.length).fill(0));
  const metricValues = metrics.map(() => []);
  const metricSums = metrics.map(() => 0);
  const byDay = new Map();

  for (const r of rows) {
    if (r[GOV] >= 0) govCounts[r[GOV]] += 1;
    if (r[SITE] >= 0) siteCounts[r[SITE]] += 1;
    dims.forEach((_, i) => {
      const v = r[BASE + i];
      if (v >= 0) dimCounts[i][v] += 1;
    });
    metrics.forEach((_, i) => {
      const value = r[BASE + dims.length + i];
      metricSums[i] += value;
      if (value > 0) metricValues[i].push(value);
    });
    byDay.set(r[DAY], (byDay.get(r[DAY]) ?? 0) + 1);
  }

  const dimResults = {};
  dims.forEach((dim, i) => {
    const all = rank(dimCounts[i], dim.values);
    const excluded = dim.exclude ? all.find((d) => d.label === dim.exclude)?.value ?? 0 : 0;
    dimResults[dim.key] = {
      title: dim.title,
      note: dim.note,
      excludeLabel: dim.exclude,
      excluded,
      coverage: all.reduce((sum, d) => sum + d.value, 0),
      data: dim.exclude ? all.filter((d) => d.label !== dim.exclude) : all,
    };
  });

  const metricResults = {};
  metrics.forEach((metric, i) => {
    metricResults[metric.key] = {
      title: metric.title,
      anomalies: metric.anomalies ?? 0,
      sum: metricSums[i],
      count: metricValues[i].length,
      median: median(metricValues[i]),
    };
  });

  return {
    total: rows.length,
    dims: dimResults,
    metrics: metricResults,
    byGovernorate: rank(govCounts, dict.govs),
    locations: siteCounts
      .map((count, i) => (count > 0 ? { ...dict.sites[i], count } : null))
      .filter(Boolean)
      .sort((a, b) => b.count - a.count),
    timeline: [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([day, value]) => ({ day, value })),
  };
}

/* highlight: { dim: 'كود البعد' أو 'gov', value: 'النص' } */
export default function useReportStats(report, range, filters = {}, highlight = null) {
  const { directorate = null, center = null } = filters;

  return useMemo(() => {
    const { dict, dims, metrics, records } = report;
    const { from, to } = range;

    const dirIdx = directorate ? dict.directorates.indexOf(directorate) : -1;
    const centerIdx = center ? dict.centers.indexOf(center) : -1;

    const rows = records.filter((r) => {
      const day = r[DAY];
      if (!day) return false;
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (directorate && r[DIR] !== dirIdx) return false;
      if (center && r[CENTER] !== centerIdx) return false;
      return true;
    });

    /* المراكز المتاحة تتقلص تبعاً للمديرية المختارة */
    const centerSet = new Set();
    for (const r of records) {
      if (directorate && r[DIR] !== dirIdx) continue;
      if (r[CENTER] >= 0) centerSet.add(dict.centers[r[CENTER]]);
    }

    const base = aggregate(rows, report);

    /* المجموعة المميَّزة: سجلات تحمل القيمة المضغوطة في بعدها */
    let part = null;
    if (highlight) {
      const dimPos = dims.findIndex((d) => d.key === highlight.dim);
      const valueIdx = highlight.dim === 'gov'
        ? dict.govs.indexOf(highlight.value)
        : dimPos >= 0 ? dims[dimPos].values.indexOf(highlight.value) : -1;
      if (valueIdx >= 0) {
        const col = highlight.dim === 'gov' ? GOV : BASE + dimPos;
        part = aggregate(rows.filter((r) => r[col] === valueIdx), report);
      }
    }

    return {
      ...base,
      part,
      directorates: dict.directorates,
      availableCenters: [...centerSet].sort((a, b) => a.localeCompare(b, 'ar')),
    };
  }, [report, range, directorate, center, highlight]);
}

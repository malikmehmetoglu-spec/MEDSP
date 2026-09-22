/*
  تخطيط التقرير.

  إضافات على مستوى الاستبيان (survey.report):
    filters  أسئلة تظهر كفلاتر أعلى التقرير
    ratios   [{ id, label, num, den }] نسبة من مجموعين — تُختار كبطاقات جانبية
             بالمعرّف 'ratio:<id>'
    compare  [{ id, title, by, a, b }] مقارنة مجموعين حسب فئة (مخطط/منفذ)
    table    { show, columns: [...] } جدول تفصيلي بكل استمارة

  الإعدادات:
    survey.report = { hero, side: [...], order: [...] }
      hero   'count' (عدد الاستمارات) أو اسم حقل رقمي
      side   حتى ثلاثة حقول رقمية للبطاقات الجانبية
      order  ترتيب الأسئلة في شبكة اللوحات
    node.report = { show, chart, width, title, agg }

  بلا أي إعدادات يُنتج التقرير الافتراضي نفسه الذي كان يُعرض سابقاً.
*/

export const CHARTS = {
  donut: { label: 'حلقي', icon: 't_select_one' },
  bars: { label: 'أشرطة', icon: 't_rank' },
  number: { label: 'رقم', icon: 't_integer' },
  mapgov: { label: 'خريطة ومحافظات', icon: 't_admin_area' },
  map: { label: 'خريطة فقط', icon: 't_geopoint' },
  gov: { label: 'المحافظات فقط', icon: 't_rank' },
  timeline: { label: 'خط زمني', icon: 't_date' },
  summary: { label: 'ملخّص أرقام', icon: 't_repeat' },
  quotes: { label: 'نماذج إجابات', icon: 't_textarea' },
};

export const CHARTS_BY_TYPE = {
  select_one: ['donut', 'bars'],
  select_multiple: ['bars', 'donut'],
  rank: ['bars', 'donut'],
  range: ['bars', 'donut', 'number'],
  integer: ['number'],
  decimal: ['number'],
  calculate: ['number'],
  admin_area: ['mapgov', 'map', 'gov'],
  date: ['timeline'],
  datetime: ['timeline'],
  repeat: ['summary'],
  text: ['quotes'],
  textarea: ['quotes'],
};

export const AGGS = {
  sum: 'المجموع',
  avg: 'المتوسط',
  max: 'الأعلى',
  min: 'الأدنى',
};

export const WIDTHS = {
  auto: { label: 'تلقائي' },
  third: { label: 'ثلث', units: 1 },
  wide: { label: 'ثلثان', units: 2 },
  full: { label: 'كامل', units: 3 },
};

const NUMERIC = new Set(['integer', 'decimal', 'calculate']);
const HIDDEN_BY_DEFAULT = new Set(['text', 'textarea']);

/* العرض الافتراضي لكل رسم */
const DEFAULT_WIDTH = {
  donut: 'third', bars: 'wide', map: 'full', gov: 'wide', timeline: 'wide', summary: 'full', quotes: 'wide',
};

export function settingsOf(node) {
  const r = node.report || {};
  const charts = CHARTS_BY_TYPE[node.type] || [];
  return {
    show: r.show ?? !HIDDEN_BY_DEFAULT.has(node.type),
    chart: charts.includes(r.chart) ? r.chart : charts[0],
    width: WIDTHS[r.width] ? r.width : 'auto',
    title: r.title || '',
    agg: AGGS[r.agg] ? r.agg : (node.type === 'range' ? 'avg' : 'sum'),
  };
}

export function numericFields(questions) {
  return questions.filter((q) => NUMERIC.has(q.type));
}

/* القيمة المجمّعة لحقل رقمي */
export function aggValue(stats, agg) {
  if (!stats) return 0;
  return stats[agg] ?? stats.sum;
}

/*
  توزيع اللوحات على شبكة من ثلاثة أعمدة بالترتيب المعطى.
  لوحة لا تتسع في الصف الحالي تبدأ صفاً جديداً، وآخر لوحة «تلقائية»
  في الصف السابق تتمدد لتملأ الفراغ — فلا تبقى فجوات إلا حين يفرض
  المستخدم عرضاً صريحاً يمنع ذلك.
*/
function flow(items) {
  const out = [];
  let row = [];
  let used = 0;
  const close = () => {
    const gap = 3 - used;
    if (gap > 0 && row.length) {
      const last = [...row].reverse().find((i) => i.auto);
      if (last) last.units += gap;
    }
    out.push(...row);
    row = []; used = 0;
  };
  for (const it of items) {
    if (used + it.units > 3) close();
    row.push(it);
    used += it.units;
    if (used === 3) close();
  }
  if (row.length) close();
  return out.map((i) => ({ ...i, span: i.units === 3 ? 'full' : i.units === 2 ? 'wide' : undefined }));
}

/* الترتيب الافتراضي: الكاملة أولاً ثم كل ثلثين مع ثلث — مطابق للسابق */
function defaultOrder(items) {
  const full = items.filter((i) => i.units === 3);
  const wide = items.filter((i) => i.units === 2);
  const small = items.filter((i) => i.units === 1);
  const out = [...full];
  for (const w of wide) { out.push(w); if (small.length) out.push(small.shift()); }
  return [...out, ...small];
}

export function planReport(survey, report) {
  const cfg = survey.report || {};
  const { questions, data } = report;
  const nums = numericFields(questions).filter((q) => settingsOf(q).show);

  /* الرقم الرئيسي */
  const heroField = cfg.hero && cfg.hero !== 'count' ? questions.find((q) => q.name === cfg.hero) : null;
  const hero = heroField
    ? { kind: 'field', node: heroField, settings: settingsOf(heroField), data: data.get(heroField.name) }
    : { kind: 'count' };

  /* البطاقات الجانبية */
  const sideNames = Array.isArray(cfg.side)
    ? cfg.side.filter((n) => nums.some((q) => q.name === n))
    : nums.filter((q) => q.name !== heroField?.name).slice(0, 3).map((q) => q.name);
  const ratios = new Map((cfg.ratios || []).map((r) => [`ratio:${r.id}`, r]));
  const sideSource = Array.isArray(cfg.side) ? cfg.side : sideNames;
  const side = sideSource.slice(0, 3).map((n) => {
    if (ratios.has(n)) {
      const r = ratios.get(n);
      return { kind: 'ratio', ratio: r, value: report.ratios?.get(r.id) };
    }
    const q = questions.find((x) => x.name === n);
    if (!q || !data.get(q.name)?.stats || !nums.some((x) => x.name === n)) return null;
    return { kind: 'field', node: q, settings: settingsOf(q), data: data.get(q.name) };
  }).filter(Boolean);

  /* اللوحات */
  const items = [];
  const extraNumbers = [];
  const taken = new Set([heroField?.name, ...sideNames]);

  for (const q of questions) {
    const s = settingsOf(q);
    const d = data.get(q.name);
    if (!s.show || !d || taken.has(q.name)) continue;

    if (NUMERIC.has(q.type) || (q.type === 'range' && s.chart === 'number')) {
      if (d.stats) extraNumbers.push({ node: q, settings: s, data: d });
      continue;
    }

    const has = {
      donut: d.dist?.length, bars: d.dist?.length,
      mapgov: d.geo?.total, map: d.geo?.total, gov: d.geo?.total,
      timeline: d.series?.length, summary: d.rowCount, quotes: d.samples?.length,
    };
    if (!has[s.chart]) continue;

    const mk = (key, chart, width) => ({
      key, node: q, settings: s, data: d, chart,
      units: width === 'auto' ? WIDTHS[DEFAULT_WIDTH[chart]].units : WIDTHS[width].units,
      auto: width === 'auto',
    });

    if (s.chart === 'mapgov') {
      items.push(mk(q.name, 'map', 'full'));
      items.push({ ...mk(`${q.name}#gov`, 'gov', s.width), group: q.name });
    } else {
      items.push(mk(q.name, s.chart, s.width));
    }
  }

  for (const c of cfg.compare || []) {
    const groups = report.compares?.get(c.id);
    if (groups?.length) items.push({ key: `compare:${c.id}`, chart: 'compare', compare: c, groups, units: 3, auto: false });
  }

  if (cfg.table?.show && report.rows?.length) {
    items.push({ key: 'table', chart: 'table', columns: cfg.table.columns || [], units: 3, auto: false });
  }

  if (extraNumbers.length) {
    items.push({ key: '#numbers', chart: 'numbers', rows: extraNumbers, units: 3, auto: false });
  }

  /* الترتيب: المحفوظ إن وُجد، وإلا الافتراضي */
  let ordered;
  if (Array.isArray(cfg.order) && cfg.order.length) {
    const rank = new Map(cfg.order.map((n, i) => [n, i]));
    const pos = (it) => rank.get(it.group || it.node?.name || it.key) ?? 1e6;
    ordered = [...items].sort((a, b) => pos(a) - pos(b));
  } else {
    const compares = items.filter((i) => i.chart === 'compare');
    const table = items.filter((i) => i.chart === 'table');
    const rest = items.filter((i) => i.chart !== 'compare' && i.chart !== 'table');
    ordered = [...compares, ...defaultOrder(rest), ...table];
  }

  return { hero, side, panels: flow(ordered) };
}

import { useMemo, useState } from 'react';
import { buildReport } from './buildReport';
import { planReport, aggValue, AGGS } from './reportPlan';
import { Panel, Stat, Toll } from '../components/ReportShell';
import BarChart from '../components/BarChart';
import Donut from '../components/Donut';
import SyriaMap from '../components/SyriaMap';
import Figure from '../components/Figure';
import Icon from '../components/Icon';

/*
  تقرير المشروع — بمكوّنات تقارير المنصة نفسها.
  ما يظهر، وبأي رسم، وبأي عرض وترتيب: يحدده reportPlan من إعدادات
  الاستبيان، وبلا إعدادات يُنتج التقرير الافتراضي.
*/

const fmt = (n) => Number(n).toLocaleString('en-US');
const dmy = (iso) => new Date(iso).toLocaleDateString('en-GB');
const TONES = ['teal', 'gold', 'forest'];

/* العدد والمعدود: ١ استمارة، ٢ استمارتان، ٣–١٠ استمارات، ١١+ استمارة */
const RECORD = { one: 'استمارة واحدة', two: 'استمارتان', few: 'استمارات', many: 'استمارة' };
/* «مجموع ١٣ مشروعاً» لا «المجموع ١٣ مشروعاً» */
const AGG_OF = { sum: 'مجموع', avg: 'متوسط', max: 'أعلى قيمة في', min: 'أدنى قيمة في' };
function counted(n, forms = RECORD) {
  const m = n % 100;
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  if (m >= 3 && m <= 10) return `${fmt(n)} ${forms.few}`;
  return `${fmt(n)} ${forms.many}`;
}

/* «في محافظة واحدة»، «في محافظتين»، «في 3 محافظات»، «في 12 محافظة» */
function govsText(n) {
  if (n === 1) return 'في محافظة واحدة';
  if (n === 2) return 'في محافظتين';
  if (n % 100 >= 3 && n % 100 <= 10) return `في ${n} محافظات`;
  return `في ${n} محافظة`;
}

const pctText = (p) => (p === null || p === undefined ? '—' : `${p < 10 && p > 0 ? p.toFixed(1) : Math.round(p)}%`);

function centroid(geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let sx = 0; let sy = 0; let n = 0;
  for (const poly of polys) for (const [x, y] of poly[0]) { sx += x; sy += y; n += 1; }
  return n ? [sx / n, sy / n] : null;
}

function useGeo(geo, basemap) {
  return useMemo(() => {
    if (!basemap || !geo) return { locations: [], byGov: [] };
    const subs = new Map(basemap.subdistricts.map((x) => [x.code, x]));
    const names = new Map(basemap.governorates.map((g) => [g.code, g.name]));
    const govs = new Map(basemap.governorates.map((g) => [g.code, g]));
    /* بلا نواحٍ (بيانات على مستوى المحافظة) تُوضع النقطة في مركز المحافظة */
    const source = geo.bySubdistrict.length ? geo.bySubdistrict : geo.byGovernorate;
    const lookup = geo.bySubdistrict.length ? subs : govs;
    const locations = source.map((d) => {
      const area = lookup.get(d.code);
      const c = area && centroid(area.g);
      return c ? { lon: c[0], lat: c[1], name: area.name, count: d.count } : null;
    }).filter(Boolean).sort((a, b) => b.count - a.count);
    const byGov = geo.byGovernorate.map((d) => ({ label: names.get(d.code) || d.code, value: d.count }))
      .sort((a, b) => b.value - a.value);
    return { locations, byGov };
  }, [geo, basemap]);
}

/* ---------------- رسوم إضافية ---------------- */

/* أعمدة زمنية: عدد الإجابات لكل يوم */
function Columns({ series }) {
  const max = Math.max(...series.map((d) => d.count), 1);
  const step = Math.max(1, Math.ceil(series.length / 12));
  return (
    <div className="cols" role="img" aria-label="توزّع زمني">
      <div className="cols__plot">
        {series.map((d, i) => (
          <div className="cols__col" key={d.date} title={`${dmy(d.date)}: ${fmt(d.count)}`}>
            <span className="cols__n">{d.count}</span>
            <span className="cols__bar" style={{ height: `${(d.count / max) * 100}%` }} />
            <span className="cols__tick">{i % step === 0 ? d.date.slice(5).replace('-', '/') : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* نماذج من الإجابات النصية */
function Quotes({ samples }) {
  return (
    <ul className="quotes">
      {samples.slice(0, 8).map((q) => (
        <li key={q.text} className="quotes__item">
          <Icon name="t_textarea" className="quotes__mark" />
          <span className="quotes__text">{q.text}</span>
          {q.count > 1 && <span className="quotes__count" dir="ltr">×{q.count}</span>}
        </li>
      ))}
    </ul>
  );
}

/* مخطط مقابل منفذ لكل فئة */
function Compare({ groups, unit, names, labelA, labelB }) {
  const max = Math.max(...groups.map((g) => g.a), 1);
  return (
    <div className="cmp">
      <div className="cmp__legend">
        <span><i className="cmp__sw cmp__sw--a" />{labelA}</span>
        <span><i className="cmp__sw cmp__sw--b" />{labelB}</span>
      </div>
      {groups.map((g) => {
        const over = g.pct !== null && g.pct > 100;
        return (
          <div className="cmp__row" key={g.key}>
            <span className="cmp__label">{names?.get(g.key) || g.label}</span>
            <div className="cmp__bars">
              <span className="cmp__track" style={{ width: `${(g.a / max) * 100}%` }}>
                <span className={`cmp__fill${over ? ' is-over' : ''}`}
                  style={{ width: `${Math.min(g.pct ?? 0, 100)}%` }} />
              </span>
            </div>
            <span className={`cmp__pct${g.pct === null ? ' is-na' : over ? ' is-over' : g.pct >= 100 ? ' is-done' : g.pct === 0 ? ' is-zero' : ''}`}>
              {pctText(g.pct)}
            </span>
            <span className="cmp__nums" dir="ltr">
              {fmt(Math.round(g.b))} <em>/ {fmt(Math.round(g.a))}</em>{unit && ` ${unit}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* جدول تفصيلي — قابل للترتيب بالضغط على العناوين */
function DetailTable({ rows, columns, nodes, names }) {
  const cols = columns.map((c) => nodes.get(c)).filter(Boolean);
  /* الترتيب الافتراضي: العمود الأول (كالمرحلة) تصاعدياً */
  const [sort, setSort] = useState({ by: columns[0] || null, dir: 1 });
  const val = (r, n) => r.answers?.[n.name];
  const text = (r, n) => {
    const v = val(r, n);
    if (v === undefined || v === null || v === '') return '';
    if (n.type === 'admin_area') return names?.get(v.governorate) || v.governorate || '';
    if (n.choices) return n.choices.find((c) => String(c.value) === String(v))?.label ?? String(v);
    return String(v);
  };
  const isNum = (n) => ['integer', 'decimal', 'calculate', 'range'].includes(n.type);
  const sorted = useMemo(() => {
    const n = sort.by && nodes.get(sort.by);
    if (!n) return rows;
    /* خيارات الاختيار تُرتَّب بترتيبها في الاستبيان لا أبجدياً */
    const order = n.choices ? new Map(n.choices.map((c, i) => [String(c.value), i])) : null;
    const key = (r) => {
      if (isNum(n)) return Number(val(r, n) ?? -1);
      if (order) return order.get(String(val(r, n))) ?? 999;
      return text(r, n);
    };
    return [...rows].sort((a, b) => {
      const x = key(a); const y = key(b);
      if (x !== y) return (x > y ? 1 : -1) * sort.dir;
      /* تساوٍ: الأكبر مرجعاً أولاً (أول عمود رقمي) */
      const firstNum = cols.find(isNum);
      return firstNum ? Number(val(b, firstNum) || 0) - Number(val(a, firstNum) || 0) : 0;
    });
  }, [rows, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  /* صف الإجمالي: مجموع الأرقام، والنسبة من مجموعين لا متوسطها */
  const total = (n) => {
    if (n.type === 'calculate' && n.calc?.op === 'percent') {
      const [a, b] = n.calc.fields;
      const sa = rows.reduce((s, r) => s + (Number(r.answers?.[a]) || 0), 0);
      const sb = rows.reduce((s, r) => s + (Number(r.answers?.[b]) || 0), 0);
      return sb ? pctText((sa / sb) * 100) : '—';
    }
    if (n.type === 'integer' || n.type === 'decimal') {
      return fmt(Math.round(rows.reduce((s, r) => s + (Number(val(r, n)) || 0), 0)));
    }
    return '';
  };

  return (
    <div className="dtable__wrap">
      <table className="dtable">
        <thead>
          <tr>
            {cols.map((n) => (
              <th key={n.name} className={isNum(n) ? 'is-num' : ''}>
                <button type="button" onClick={() => setSort({ by: n.name, dir: sort.by === n.name ? -sort.dir : (isNum(n) ? -1 : 1) })}>
                  {n.label}{n.unit && n.type !== 'calculate' ? ` (${n.unit})` : ''}
                  <span className="dtable__sort">{sort.by === n.name ? (sort.dir === 1 ? '▲' : '▼') : ''}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id}>
              {cols.map((n) => {
                const v = val(r, n);
                if (n.type === 'calculate' && n.calc?.op === 'percent') {
                  const p = v === null || v === undefined || v === '' ? null : Number(v);
                  return (
                    <td key={n.name} className="is-num">
                      <span className="dtable__pct">
                        <span className="dtable__bar"><span className={p > 100 ? 'is-over' : ''} style={{ width: `${Math.min(p ?? 0, 100)}%` }} /></span>
                        <b>{pctText(p)}</b>
                      </span>
                    </td>
                  );
                }
                if (isNum(n)) return <td key={n.name} className="is-num" dir="ltr">{v === '' || v == null ? '—' : fmt(Math.round(Number(v) * 10) / 10)}</td>;
                if (n.choices && n.type === 'select_one' && n.report?.chip) {
                  return <td key={n.name}><span className={`dtable__chip dtable__chip--${n.choices.findIndex((c) => String(c.value) === String(v))}`}>{text(r, n)}</span></td>;
                }
                return <td key={n.name} className={n.type === 'text' || n.type === 'textarea' ? 'is-text' : ''}>{text(r, n) || '—'}</td>;
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            {cols.map((n, i) => (
              <td key={n.name} className={isNum(n) ? 'is-num' : ''} dir={isNum(n) ? 'ltr' : undefined}>
                {i === 0 ? `الإجمالي (${fmt(rows.length)})` : total(n)}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* ---------------- الفلاتر ---------------- */

function FilterBar({ fields, responses, values, onChange, names, shown }) {
  if (!fields.length) return null;
  /*
    أعداد كل فلتر تُحسب ضمن الفلاتر الأخرى المختارة، فلا يَعِد خيار
    بأربعة سجلات ثم يعرض واحداً. الخيار الذي يعطي صفراً يُخفى
    (إلا إن كان هو المختار).
  */
  const optionsFor = (n) => {
    const others = fields.filter((f) => f.name !== n.name);
    const pool = responses.filter((r) => matches(r, others, values));
    const seen = new Map();
    for (const r of pool) {
      const v = r.answers?.[n.name];
      if (v === undefined || v === null || v === '') continue;
      const list = n.type === 'admin_area' ? [v.governorate] : Array.isArray(v) ? v : [v];
      for (const k of list) {
        if (!k) continue;
        const label = n.type === 'admin_area' ? (names?.get(k) || k)
          : n.choices?.find((c) => String(c.value) === String(k))?.label ?? String(k);
        const cur = seen.get(String(k)) || { value: String(k), label, n: 0 };
        cur.n += 1;
        seen.set(String(k), cur);
      }
    }
    const opts = [...seen.values()];
    if (values[n.name] && !seen.has(values[n.name])) {
      opts.push({ value: values[n.name], label: values[n.name], n: 0 });
    }
    /* الخيارات بترتيبها في الاستبيان إن وُجد، وإلا أبجدياً */
    if (n.choices) {
      const order = new Map(n.choices.map((c, i) => [String(c.value), i]));
      return opts.sort((a, b) => (order.get(a.value) ?? 99) - (order.get(b.value) ?? 99));
    }
    return opts.sort((a, b) => a.label.localeCompare(b.label, 'ar'));
  };
  const active = Object.values(values).filter(Boolean).length;

  return (
    <div className="pfilters">
      {fields.map((n) => (
        <label className="pfilters__field" key={n.name}>
          <span>{n.type === 'admin_area' ? 'المحافظة' : n.label}</span>
          <select className={`pfilters__select${values[n.name] ? ' is-on' : ''}`} value={values[n.name] || ''}
            onChange={(e) => onChange({ ...values, [n.name]: e.target.value || undefined })}>
            <option value="">الكل</option>
            {optionsFor(n).map((o) => <option key={o.value} value={o.value}>{o.label} ({o.n})</option>)}
          </select>
        </label>
      ))}
      <span className="pfilters__count">
        {active ? <>يعرض <b>{fmt(shown)}</b> من {fmt(responses.length)}</> : <>كل السجلات ({fmt(responses.length)})</>}
      </span>
      {active > 0 && (
        <button type="button" className="pfilters__clear" onClick={() => onChange({})}>مسح الفلاتر</button>
      )}
    </div>
  );
}

function matches(r, fields, values) {
  return fields.every((n) => {
    const want = values[n.name];
    if (!want) return true;
    const v = r.answers?.[n.name];
    if (n.type === 'admin_area') return v?.governorate === want;
    if (Array.isArray(v)) return v.map(String).includes(want);
    return String(v) === want;
  });
}

/* ---------------- لوحة واحدة ---------------- */

function PanelFor({ item, tone, basemap, nodes, names, rows, noun }) {
  const { node, settings, data, chart, span } = item;
  const title = settings?.title || node?.label;

  const geo = useGeo(data?.geo, basemap);

  if (chart === 'compare') {
    const c = item.compare;
    const A = nodes.get(c.a);
    const B = nodes.get(c.b);
    return (
      <Panel span="full" title={c.title || `${B?.label} مقابل ${A?.label}`}
        note={`نسبة الإنجاز = ${B?.label || 'المنجز'} ÷ ${A?.label || 'المرجع'}، ${nodes.get(c.by)?.choices?.length ? 'بترتيب الفئات' : 'مرتّبة حسب الحجم'}`}>
        <Compare groups={item.groups} unit={A?.unit} names={names}
          labelA={A?.label || c.a} labelB={B?.label || c.b} />
      </Panel>
    );
  }

  if (chart === 'table') {
    return (
      <Panel span="full" title="التفاصيل" note="اضغط عنوان أي عمود للترتيب">
        <DetailTable rows={rows} columns={item.columns} nodes={nodes} names={names} />
      </Panel>
    );
  }

  if (chart === 'numbers') {
    return (
      <Panel span="full" title="مؤشرات رقمية" note="محسوبة من كل الاستمارات المعتمدة">
        <Toll rows={item.rows.map((r) => ({
          icon: `t_${r.node.type}`,
          label: `${r.settings.title || r.node.label}${r.settings.agg !== 'sum' ? ` (${AGGS[r.settings.agg]})` : ''}`,
          value: aggValue(r.data.stats, r.settings.agg),
        }))} />
      </Panel>
    );
  }

  const answered = `${fmt(data.answered)} إجابة`;
  switch (chart) {
    case 'donut':
      return (
        <Panel span={span} title={title} note={answered}>
          <Donut data={data.dist.map((d) => ({ label: d.label, value: d.count }))} tone={tone} caption="إجابة" />
        </Panel>
      );
    case 'bars': {
      const rows = node.type === 'range'
        ? data.dist.map((d) => ({ label: `الدرجة ${d.value}`, value: d.count }))
        : data.dist.map((d) => ({ label: d.label, value: d.count }));
      const note = node.type === 'range' && data.stats
        ? `المتوسط ${fmt(data.stats.avg)} من ${node.max ?? 5}`
        : node.type === 'select_multiple' ? 'يمكن اختيار أكثر من إجابة' : answered;
      return (
        <Panel span={span} title={title} note={note}>
          <BarChart data={rows} tone={tone} showShare />
        </Panel>
      );
    }
    case 'map':
      return (
        <Panel span={span} title={title} note={data.geo.bySubdistrict.length
          ? `${fmt(geo.locations.length)} ناحية، مطابقة بحدودها الرسمية`
          : `${fmt(geo.locations.length)} محافظة`}>
          <SyriaMap basemap={basemap} locations={geo.locations} noun={noun} />
        </Panel>
      );
    case 'gov':
      return (
        <Panel span={span} title={item.group ? 'التوزّع حسب المحافظة' : title} note="مرتّبة تنازلياً">
          <BarChart data={geo.byGov} showShare />
        </Panel>
      );
    case 'timeline':
      return (
        <Panel span={span} title={title} note={`${fmt(data.series.length)} يوماً`}>
          <Columns series={data.series} />
        </Panel>
      );
    case 'summary':
      return (
        <Panel span={span} title={title} note="مجموع ما سُجّل في كل الاستمارات">
          <Toll rows={[
            { icon: 't_repeat', label: 'إجمالي المسجّل', value: data.rowCount },
            ...data.sums.map((s) => ({ icon: `t_${s.node.type}`, label: s.node.label, value: s.total })),
          ]} />
        </Panel>
      );
    case 'quotes':
      return (
        <Panel span={span} title={title} note={`نماذج من ${answered}، المتطابقة مجمّعة`}>
          <Quotes samples={data.samples} />
        </Panel>
      );
    default:
      return null;
  }
}

/* ---------------- التقرير ---------------- */

export default function ProjectReport({ project, basemap }) {
  const [surveyId, setSurveyId] = useState(project.surveys[0]?.id ?? null);
  const survey = project.surveys.find((s) => s.id === surveyId) || project.surveys[0];

  const all = useMemo(
    () => project.responses.filter((r) => r.surveyId === survey?.id),
    [project.responses, survey],
  );

  const cfg = survey?.report || {};
  const topNodes = useMemo(
    () => (survey ? survey.pages.flatMap((p) => p.children) : []),
    [survey],
  );
  const nodes = useMemo(() => new Map(topNodes.map((n) => [n.name, n])), [topNodes]);
  /* الفلاتر: المختارة في المصمّم، وافتراضياً أسئلة الموقع */
  const filterFields = useMemo(() => (Array.isArray(cfg.filters)
    ? cfg.filters.map((n) => nodes.get(n)).filter(Boolean)
    : topNodes.filter((n) => n.type === 'admin_area')), [cfg.filters, nodes, topNodes]);
  const [filters, setFilters] = useState({});
  const responses = useMemo(
    () => all.filter((r) => matches(r, filterFields, filters)),
    [all, filterFields, filters],
  );
  const names = useMemo(
    () => (basemap ? new Map(basemap.governorates.map((g) => [g.code, g.name])) : null),
    [basemap],
  );
  const noun = cfg.noun || 'الاستمارات';
  const forms = cfg.record || RECORD;

  const report = useMemo(() => (survey ? buildReport(survey, responses) : null), [survey, responses]);
  const plan = useMemo(() => (survey && report ? planReport(survey, report) : null), [survey, report]);

  if (!survey) return <div className="pending"><h3>لا يوجد استبيان في هذا المشروع</h3></div>;

  const dated = responses.map((r) => r.submittedAt).filter(Boolean).sort();
  const govCount = [...report.data.values()].find((d) => d.geo)?.geo.byGovernorate.length || 0;
  const hero = plan.hero;

  return (
    <>
      {project.surveys.length > 1 && (
        <div className="preport__tabs">
          {project.surveys.map((s) => (
            <button key={s.id} type="button" className={`preport__tab${s.id === survey.id ? ' is-on' : ''}`}
              onClick={() => setSurveyId(s.id)}>{s.title}</button>
          ))}
        </div>
      )}

      {all.length > 0 && (
        <FilterBar fields={filterFields} responses={all} values={filters}
          onChange={setFilters} names={names} shown={responses.length} />
      )}

      {report.total === 0 ? (
        <div className="pending">
          {all.length ? (
            <><h3>لا توجد سجلات تطابق الفلاتر</h3><p>غيّر اختيارك أو امسح الفلاتر.</p></>
          ) : (
            <><h3>لا توجد إجابات معتمدة بعد</h3><p>يظهر التقرير حين تُعتمد أول إجابة.</p></>
          )}
        </div>
      ) : (
        <>
          <section className="hero">
            <div className="hero__primary">
              <span className="hero__eyebrow">
                <Icon name={hero.kind === 'field' ? `t_${hero.node.type}` : 't_textarea'} />
                {hero.kind === 'field' ? (hero.settings.title || hero.node.label) : survey.title}
              </span>
              <Figure
                value={hero.kind === 'field' ? aggValue(hero.data?.stats, hero.settings.agg) : report.total}
                className="hero__figure" />
              <span className="hero__sub">
                {hero.kind === 'field'
                  ? <>{hero.node.unit ? `${hero.node.unit}، ` : ''}{AGG_OF[hero.settings.agg]} {counted(report.total, forms)}{govCount > 0 && ` ${govsText(govCount)}`}</>
                  : <>{forms === RECORD ? 'استمارة معتمدة' : forms.many}{govCount > 0 && ` ${govsText(govCount)}`}</>}
                {dated.length > 0 && (dmy(dated[0]) === dmy(dated[dated.length - 1]) ? (
                  <>، بيانات <span className="nowrap" dir="ltr">{dmy(dated[0])}</span></>
                ) : (
                  <>
                    ، جُمعت بين <span className="nowrap" dir="ltr">{dmy(dated[0])}</span>
                    {' '}و<span className="nowrap" dir="ltr">{dmy(dated[dated.length - 1])}</span>
                  </>
                ))}
              </span>
            </div>

            {plan.side.length > 0 && (
              <div className={`hero__side hero__side--${plan.side.length}`}>
                {plan.side.map((sd, i) => {
                  if (sd.kind === 'ratio') {
                    const v = sd.value;
                    return (
                      <Stat
                        key={`ratio-${sd.ratio.id}`}
                        icon="t_calculate"
                        tone="forest"
                        label={sd.ratio.label}
                        value={v?.pct === null || v?.pct === undefined ? 0 : Math.round(v.pct * 10) / 10}
                        unit="%"
                        share={Math.min(Math.round(v?.pct ?? 0), 100)}
                        note={`${fmt(Math.round(v?.num ?? 0))} من ${fmt(Math.round(v?.den ?? 0))}${nodes.get(sd.ratio.den)?.unit ? ` ${nodes.get(sd.ratio.den).unit}` : ''}`}
                      />
                    );
                  }
                  const st = sd.data.stats;
                  const v = aggValue(st, sd.settings.agg);
                  return (
                    <Stat
                      key={sd.node.name}
                      icon={`t_${sd.node.type}`}
                      tone={i === 1 ? 'forest' : 'teal'}
                      label={sd.settings.title || sd.node.label}
                      value={v}
                      unit={sd.node.unit || ''}
                      share={st.max ? Math.round((st.avg / st.max) * 100) : 0}
                      note={sd.settings.agg === 'sum'
                        ? `بمتوسط ${fmt(st.avg)} لكل ${forms.unit || 'استمارة'}، وأعلى قيمة ${fmt(st.max)}`
                        : `${AGGS[sd.settings.agg]} من ${fmt(st.count)} إجابة`}
                    />
                  );
                })}
              </div>
            )}
          </section>

          <div className="panels">
            {plan.panels.map((item, i) => (
              <PanelFor key={item.key} item={item} tone={TONES[i % TONES.length]} basemap={basemap}
                nodes={nodes} names={names} rows={responses} noun={noun} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

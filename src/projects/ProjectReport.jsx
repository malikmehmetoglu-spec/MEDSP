import { useEffect, useMemo, useState } from 'react';
import { buildReport } from './buildReport';
import { planReport, aggValue, AGGS } from './reportPlan';
import { Panel, Stat, Toll } from '../components/ReportShell';
import BarChart from '../components/BarChart';
import Donut from '../components/Donut';
import SyriaMap from '../components/SyriaMap';
import Figure from '../components/Figure';
import Icon from '../components/Icon';
import { loadOps, summarizeOps } from './opsSource';
import { governorateIndex, matchGovernorate } from '../admin/importer/parse';

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

/* مجاميع من سجلات المشروع — للمقارنة مع العمليات */
const sumOf = (rows, field) => Math.round(rows.reduce((a, r) => a + (Number(r.answers?.[field]) || 0), 0) * 10) / 10;
const govSums = (rows, govField, valueField) => {
  const m = new Map();
  for (const r of rows) {
    const code = r.answers?.[govField]?.governorate;
    if (!code) continue;
    m.set(code, (m.get(code) || 0) + (Number(r.answers?.[valueField]) || 0));
  }
  return [...m.entries()];
};

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
    const byGov = geo.byGovernorate.map((d) => ({ key: d.code, label: names.get(d.code) || d.code, value: d.count }))
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
function Compare({ groups, unit, names, labelA, labelB, onSelect, selected, highlighting, parts }) {
  const max = Math.max(...groups.map((g) => g.a), 1);
  const Row = onSelect ? 'button' : 'div';
  return (
    <div className="cmp">
      <div className="cmp__legend">
        <span><i className="cmp__sw cmp__sw--a" />{labelA}</span>
        <span><i className="cmp__sw cmp__sw--b" />{labelB}</span>
      </div>
      {groups.map((g) => {
        const over = g.pct !== null && g.pct > 100;
        const on = selected != null && String(selected) === String(g.key);
        const part = highlighting ? (parts?.get(String(g.key)) ?? 0) : null;
        return (
          <Row
            type={onSelect ? 'button' : undefined}
            className={`cmp__row${on ? ' is-on' : ''}${highlighting && !part ? ' is-dim' : ''}`}
            key={g.key}
            onClick={onSelect ? () => onSelect(on ? null : g.key) : undefined}
            aria-pressed={onSelect ? on : undefined}>
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
              {part != null && part !== g.b ? `${fmt(Math.round(part))} / ` : ''}
              {fmt(Math.round(g.b))} <em>/ {fmt(Math.round(g.a))}</em>{unit && ` ${unit}`}
            </span>
          </Row>
        );
      })}
    </div>
  );
}

/* جدول تفصيلي — قابل للترتيب بالضغط على العناوين */
export function DetailTable({ rows, columns, nodes, names, dimOutside }) {
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
            <tr key={r.id} className={dimOutside && !dimOutside.has(r.id) ? 'is-dim' : ''}>
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

/* ---------------- عمليات الإزالة والمجموع ---------------- */

/* شريط مجزّأ يبدّل مصدر الأرقام */
function SourceSwitch({ value, onChange, options }) {
  return (
    <div className="psrc" role="tablist" aria-label="مصدر البيانات">
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id}
          className={`psrc__tab${value === o.id ? ' is-on' : ''}`} onClick={() => onChange(o.id)}>
          <span className="psrc__label">{o.label}</span>
          <span className="psrc__note">{o.note}</span>
        </button>
      ))}
    </div>
  );
}

function DistPanel({ title, note, rows, tone, span }) {
  const data = rows.filter((r) => r.label !== '—').map((r) => ({ label: r.label, value: r.count }));
  const missing = rows.find((r) => r.label === '—');
  if (!data.length) return null;
  return (
    <Panel span={span} title={title} note={note}>
      <BarChart data={data} tone={tone} showShare />
      {missing && <p className="bx-hint">{fmt(missing.count)} عملية بلا تسجيل لهذا الحقل.</p>}
    </Panel>
  );
}

function OpsReport({ ops, cfg, basemap, names }) {
  if (!ops.ops) {
    return <div className="pending"><h3>لا توجد عمليات مطابقة</h3><p>غيّر الفلاتر أو امسحها.</p></div>;
  }
  /* محافظة عملياتها كلها بوحدات غير المتر المكعب كميتها صفر — لا تُعرض كشريط فارغ */
  const withQty = ops.byGovernorate.filter((g) => g.quantity > 0);
  const govBars = withQty.map((g) => ({ label: names?.get(g.code) || g.name, value: g.quantity }));
  return (
    <>
      <section className="hero">
        <div className="hero__primary">
          <span className="hero__eyebrow"><Icon name="t_calculate" />{cfg.label || 'عمليات الإزالة الاعتيادية'}</span>
          <Figure value={ops.quantity} className="hero__figure" />
          <span className="hero__sub">
            م³، مرحّلة ضمن الأعمال الخدمية اليومية خارج المشاريع
            {ops.from && ops.to && <>، بين <span className="nowrap" dir="ltr">{dmy(ops.from)}</span> و<span className="nowrap" dir="ltr">{dmy(ops.to)}</span></>}
          </span>
        </div>
        <div className="hero__side hero__side--2">
          <Stat icon="t_repeat" tone="teal" label="عدد العمليات" value={ops.ops} unit="عملية"
            note={ops.otherUnits ? `استُبعدت ${fmt(ops.otherUnits)} مسجّلة بغير المتر المكعب` : 'إزالة وإعادة تدوير'} />
          <Stat icon="t_integer" tone="forest" label="متوسط الكمية للعملية" value={ops.avg} unit="م³"
            note={govsText(withQty.length)} />
        </div>
      </section>

      <div className="panels">
        <Panel span="wide" title="الكميات حسب المحافظة" note="بالمتر المكعب، مرتّبة تنازلياً">
          <BarChart data={govBars} showShare />
        </Panel>
        <DistPanel title="ملكية الموقع" rows={ops.ownership} tone="gold" note="عدد العمليات" />
        <DistPanel span="wide" title="المكان المستهدف" rows={ops.target} tone="teal" note="عدد العمليات" />
        <DistPanel title="موافقة المالكين على الترحيل" rows={ops.consent} tone="gold" note="عدد العمليات" />
        {basemap && ops.locations.length > 0 && (
          <Panel span="full" title="مواقع عمليات الإزالة" note={`${fmt(ops.locations.length)} موقعاً مُرمّزاً`}>
            <SyriaMap basemap={basemap} locations={ops.locations} noun="العمليات" />
          </Panel>
        )}
      </div>
    </>
  );
}

/* المشاريع + العمليات معاً */
function CombinedReport({ projectExecuted, projectPlanned, byGovProjects, ops, names }) {
  const total = Math.round((projectExecuted + ops.quantity) * 10) / 10;
  const rows = useMemo(() => {
    const m = new Map();
    for (const [code, v] of byGovProjects) {
      m.set(code, { code, label: names?.get(code) || code, projects: v, ops: 0 });
    }
    for (const g of ops.byGovernorate) {
      const cur = m.get(g.code) || { code: g.code, label: names?.get(g.code) || g.name, projects: 0, ops: 0 };
      cur.ops += g.quantity;
      m.set(g.code, cur);
    }
    return [...m.values()].map((r) => ({ ...r, total: r.projects + r.ops }))
      .sort((a, b) => b.total - a.total);
  }, [byGovProjects, ops, names]);
  const max = Math.max(...rows.map((r) => r.total), 1);
  const share = total ? Math.round((ops.quantity / total) * 1000) / 10 : 0;

  return (
    <>
      <section className="hero">
        <div className="hero__primary">
          <span className="hero__eyebrow"><Icon name="t_calculate" />إجمالي الأنقاض المرحّلة</span>
          <Figure value={total} className="hero__figure" />
          <span className="hero__sub">م³، من المشاريع والأعمال الاعتيادية معاً</span>
        </div>
        <div className="hero__side hero__side--2">
          <Stat icon="t_repeat" tone="teal" label="من المشاريع" value={projectExecuted} unit="م³"
            share={total ? Math.round((projectExecuted / total) * 100) : 0}
            note={`من أصل ${fmt(projectPlanned)} م³ مخططة`} />
          <Stat icon="t_integer" tone="forest" label="من الأعمال الاعتيادية" value={ops.quantity} unit="م³"
            share={Math.round(share)} note={`${share}% من الإجمالي، في ${fmt(ops.ops)} عملية`} />
        </div>
      </section>

      <div className="panels">
        <Panel span="full" title="الأنقاض المرحّلة حسب المحافظة" note="المشاريع والأعمال الاعتيادية معاً">
          <div className="cmp">
            <div className="cmp__legend">
              <span><i className="cmp__sw cmp__sw--b" />المشاريع</span>
              <span><i className="cmp__sw cmp__sw--ops" />الأعمال الاعتيادية</span>
            </div>
            {rows.map((r) => (
              <div className="cmp__row cmp__row--stack" key={r.code}>
                <span className="cmp__label">{r.label}</span>
                <div className="cmp__bars">
                  <span className="cmp__track cmp__track--stack" style={{ width: `${(r.total / max) * 100}%` }}>
                    <span className="cmp__seg cmp__seg--a" style={{ width: `${r.total ? (r.projects / r.total) * 100 : 0}%` }} />
                    <span className="cmp__seg cmp__seg--b" style={{ width: `${r.total ? (r.ops / r.total) * 100 : 0}%` }} />
                  </span>
                </div>
                <span className="cmp__nums" dir="ltr">{fmt(Math.round(r.total))} م³</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}

/* شريط يبيّن ما هو مميَّز الآن */
function HighlightBar({ node, label, shown, total, onClear }) {
  return (
    <div className="phl" role="status">
      <Icon name="t_select_one" className="phl__icon" />
      <span className="phl__text">
        مميَّز: <b>{node?.label || ''}</b> = <b>{label}</b>
        <span className="phl__count">{fmt(shown)} من {fmt(total)}</span>
      </span>
      <span className="phl__hint">بقية الأرقام تعرض حصة هذا التحديد، والباقي باهت.</span>
      <button type="button" className="phl__clear" onClick={onClear}>إلغاء التمييز</button>
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

function PanelFor({ item, tone, basemap, nodes, names, rows, noun, part, partGroups, partRows, highlight, onPick }) {
  const cmpParts = useMemo(
    () => (partGroups ? new Map(partGroups.map((g) => [String(g.key), g.b])) : null),
    [partGroups],
  );
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
          labelA={A?.label || c.a} labelB={B?.label || c.b}
          highlighting={Boolean(highlight)}
          parts={cmpParts}
          selected={highlight?.field === c.by ? highlight.value : null}
          onSelect={onPick ? onPick(c.by) : undefined} />
      </Panel>
    );
  }

  if (chart === 'table') {
    const keep = partRows ? new Set(partRows.map((r) => r.id)) : null;
    return (
      <Panel span="full" title="التفاصيل" note="اضغط عنوان أي عمود للترتيب">
        <DetailTable rows={rows} columns={item.columns} nodes={nodes} names={names} dimOutside={keep} />
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
    case 'donut': {
      const partOf = (v) => part?.dist.find((x) => String(x.value) === String(v))?.count ?? 0;
      return (
        <Panel span={span} title={title} note={answered}>
          <Donut
            data={data.dist.map((d) => ({ key: d.value, label: d.label, value: d.count, part: partOf(d.value) }))}
            tone={tone} caption="إجابة"
            highlighting={Boolean(highlight)}
            selected={highlight?.field === node.name ? highlight.value : null}
            onSelect={onPick ? onPick(node.name) : undefined}
          />
        </Panel>
      );
    }
    case 'bars': {
      const partOf = (v) => part?.dist.find((x) => String(x.value) === String(v))?.count ?? 0;
      const rows = data.dist.map((d) => ({
        key: d.value,
        label: node.type === 'range' ? `الدرجة ${d.value}` : d.label,
        value: d.count,
        part: partOf(d.value),
      }));
      const note = node.type === 'range' && data.stats
        ? `المتوسط ${fmt(data.stats.avg)} من ${node.max ?? 5}`
        : node.type === 'select_multiple' ? 'يمكن اختيار أكثر من إجابة' : answered;
      return (
        <Panel span={span} title={title} note={note}>
          <BarChart data={rows} tone={tone} showShare
            highlighting={Boolean(highlight)}
            selected={highlight?.field === node.name ? highlight.value : null}
            onSelect={onPick ? onPick(node.name) : undefined} />
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
    case 'gov': {
      const partGeo = part?.geo?.byGovernorate || [];
      const bars = geo.byGov.map((g) => ({
        ...g,
        part: partGeo.find((x) => x.code === g.key)?.count ?? 0,
      }));
      return (
        <Panel span={span} title={item.group ? 'التوزّع حسب المحافظة' : title} note="مرتّبة تنازلياً">
          <BarChart data={bars} showShare
            highlighting={Boolean(highlight)}
            selected={highlight?.field === node.name ? highlight.value : null}
            onSelect={onPick ? onPick(node.name) : undefined} />
        </Panel>
      );
    }
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

  /* مصدر ثانٍ: عمليات الإزالة من تقرير الأعمال الخدمية */
  const opsCfg = cfg.ops;
  const [view, setView] = useState('project');
  const [opsData, setOpsData] = useState(null);
  const [opsError, setOpsError] = useState(false);
  useEffect(() => {
    if (!opsCfg) return;
    loadOps(opsCfg.feed || 'services').then(setOpsData).catch(() => setOpsError(true));
  }, [opsCfg]);

  const govIdx = useMemo(() => (basemap ? governorateIndex(basemap) : null), [basemap]);
  const govFilterField = filterFields.find((f) => f.type === 'admin_area');
  const opsSummary = useMemo(() => {
    if (!opsCfg || !opsData || !govIdx) return null;
    return summarizeOps(opsData, {
      types: opsCfg.types,
      govOf: (name) => matchGovernorate(name, govIdx)?.code || name,
      filter: { gov: govFilterField ? filters[govFilterField.name] : undefined },
    });
  }, [opsCfg, opsData, govIdx, filters, govFilterField]);

  /*
    الفلترة المتقاطعة: الضغط على فئة في أي رسم يميّزها، فتعرض بقية
    الرسوم حصتها منها ويبهت الباقي. قيمة واحدة في كل مرة.
  */
  const [highlight, setHighlight] = useState(null);
  useEffect(() => { setHighlight(null); }, [filters, view, surveyId]);

  const highlighted = useMemo(() => {
    if (!highlight) return null;
    const node = nodes.get(highlight.field);
    return responses.filter((r) => {
      const v = r.answers?.[highlight.field];
      if (node?.type === 'admin_area') return v?.governorate === highlight.value;
      if (Array.isArray(v)) return v.map(String).includes(String(highlight.value));
      return String(v) === String(highlight.value);
    });
  }, [highlight, responses, nodes]);

  const pick = (field) => (value) => setHighlight(value == null ? null : { field, value });

  const report = useMemo(() => (survey ? buildReport(survey, responses) : null), [survey, responses]);
  /* تقرير المجموعة المميَّزة — منه تُؤخذ الأجزاء المعروضة فوق الأشرطة */
  const partReport = useMemo(
    () => (survey && highlighted ? buildReport(survey, highlighted) : null),
    [survey, highlighted],
  );
  const plan = useMemo(() => (survey && report ? planReport(survey, report) : null), [survey, report]);

  if (!survey) return <div className="pending"><h3>لا يوجد استبيان في هذا المشروع</h3></div>;

  /* مع وجود تمييز: البطاقات تعرض قيمة المجموعة المميَّزة، والإجمالي يُذكر تحتها */
  const shown = partReport || report;
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

      {opsCfg && (
        <SourceSwitch value={view} onChange={setView} options={[
          { id: 'project', label: opsCfg.projectLabel || 'المشاريع', note: 'مشاريع الترحيل المتعاقد عليها' },
          { id: 'ops', label: opsCfg.opsLabel || 'عمليات الإزالة', note: 'الأعمال الخدمية اليومية' },
          { id: 'both', label: 'الإجمالي', note: 'الاثنان معاً' },
        ]} />
      )}

      {all.length > 0 && (
        <FilterBar fields={view === 'project' ? filterFields : filterFields.filter((f) => f.type === 'admin_area')}
          responses={all} values={filters}
          onChange={setFilters} names={names} shown={responses.length} />
      )}

      {highlight && highlighted && view === 'project' && (
        <HighlightBar node={nodes.get(highlight.field)} shown={highlighted.length} total={responses.length}
          onClear={() => setHighlight(null)}
          label={(() => {
            const n = nodes.get(highlight.field);
            if (n?.type === 'admin_area') return names?.get(highlight.value) || highlight.value;
            return n?.choices?.find((c) => String(c.value) === String(highlight.value))?.label ?? highlight.value;
          })()} />
      )}

      {opsCfg && view !== 'project' && (opsError || !opsSummary) ? (
        <div className="pending">
          <h3>{opsError ? 'تعذّر تحميل بيانات العمليات' : 'جارٍ التحميل…'}</h3>
          {opsError && <p>حدّث الصفحة وحاول مجدداً.</p>}
        </div>
      ) : view === 'ops' ? (
        <OpsReport ops={opsSummary} cfg={opsCfg} basemap={basemap} names={names} />
      ) : view === 'both' ? (
        <CombinedReport
          ops={opsSummary}
          names={names}
          projectExecuted={sumOf(responses, opsCfg.executed)}
          projectPlanned={sumOf(responses, opsCfg.planned)}
          byGovProjects={govSums(responses, opsCfg.gov, opsCfg.executed)}
        />
      ) : report.total === 0 ? (
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
                value={hero.kind === 'field'
                  ? aggValue(shown.data.get(hero.node.name)?.stats, hero.settings.agg)
                  : shown.total}
                className="hero__figure" />
              <span className="hero__sub">
                {highlight && <><b className="hero__of">من أصل {fmt(hero.kind === 'field' ? aggValue(hero.data?.stats, hero.settings.agg) : report.total)}</b>{' '}</>}
                {hero.kind === 'field'
                  ? <>{hero.node.unit ? `${hero.node.unit}، ` : ''}{AGG_OF[hero.settings.agg]} {counted(shown.total, forms)}{govCount > 0 && ` ${govsText(govCount)}`}</>
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
                    const v = (shown.ratios || report.ratios)?.get(sd.ratio.id) || sd.value;
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
                  const full = sd.data.stats;
                  const st = shown.data.get(sd.node.name)?.stats || full;
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
                      note={highlight
                        ? `من أصل ${fmt(aggValue(full, sd.settings.agg))}${sd.node.unit ? ` ${sd.node.unit}` : ''} للكل`
                        : sd.settings.agg === 'sum'
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
                nodes={nodes} names={names} rows={responses} noun={noun}
                part={partReport?.data.get(item.node?.name)}
                partGroups={item.compare ? partReport?.compares?.get(item.compare.id) : null}
                partRows={highlighted}
                highlight={highlight} onPick={pick} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

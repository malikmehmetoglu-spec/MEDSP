import TemplateDownload from '../components/TemplateDownload';
import { useMemo, useState } from 'react';
import SyriaMap from '../components/SyriaMap';
import { coKey } from './RubbleTransfer';

/*
  سجلّا إدارة الأنقاض:
  - الجهات العاملة: لكل جهة دور أو أكثر (مقاول تنفيذ، مورد آليات، مشغّل مكب…).
  - المكبات: كل المكبات المعتمدة والمقترحة على مستوى سوريا، ولكل مكب بطاقة.

  المصدران: الاستمارات (تلقائياً) + data/rubble-registry/*.xlsx (تكميل وتصنيف).
*/

/* مشروع «سجل الجهات العاملة» في مساحة العمل: سجلاته المعتمدة هي بطاقات الجهات */
export const isEntityRegistry = (p) => (p.surveys || []).some((s) => s.report?.feed === 'rubble-entities'
  || JSON.stringify(s.pages || []).includes('"ent_roles"'));
const split = (v) => String(v ?? '').split(/[،,;\n]/).map((x) => x.trim()).filter(Boolean);
export function entitiesFromProject(p) {
  return (p.responses || []).map((r) => {
    const a = r.answers || {};
    return {
      name: String(a.ent_name || '').trim(), aliases: split(a.ent_aliases), type: a.ent_type || '',
      roles: [].concat(a.ent_roles || []), govs: [].concat(a.ent_govs || []), contact: a.ent_contact || '', notes: a.ent_notes || '',
    };
  }).filter((e) => e.name);
}

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
const norm = (s) => String(s ?? '').trim().replace(/[إأآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ');

const ROLE_COLOR = {
  'مقاول تنفيذ': '#2f9e74', 'مورد آليات': '#4f8fdc', 'مشغّل مكب': '#d4a443', 'مشغّل تدوير': '#35b3ad',
  'مستثمر': '#8d6bc9', 'جهة إشرافية': '#e0735a', 'مجلس محلي': '#86a23c', 'جهة مانحة': '#d2668f',
  'جهة تقييم أضرار': '#5b6b8c',
};
const roleColor = (r) => ROLE_COLOR[r] || '#7a8a86';

/* ---------------- الجهات ---------------- */

export function Entities({ surveys, registry }) {
  const [roles, setRoles] = useState([]);
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const m = new Map();
    const get = (key, name) => {
      if (!m.has(key)) m.set(key, { key, name, roles: new Set(), govs: new Set(), vol: 0, sites: 0, type: '', contact: '', notes: '', names: new Map() });
      return m.get(key);
    };
    /* السجل أولاً: الاسم الرسمي، وتسمياته البديلة تشير إلى المفتاح نفسه */
    const alias = new Map();
    for (const e of registry.entities) {
      const k = coKey(e.name);
      const x = get(k, e.name);
      e.roles.forEach((r) => x.roles.add(r));
      e.govs.forEach((g) => x.govs.add(g));
      Object.assign(x, { type: e.type, contact: e.contact, notes: e.notes, official: true });
      e.aliases.forEach((a) => alias.set(coKey(a), k));
    }
    for (const s of surveys) {
      const k0 = coKey(s.co);
      if (!k0) continue;
      const k = alias.get(k0) || k0;
      const x = get(k, s.co);
      x.roles.add('مقاول تنفيذ');
      x.vol += s.vol; x.sites += 1;
      if (s.gov) x.govs.add(s.gov);
      x.names.set(s.co, (x.names.get(s.co) || 0) + 1);
    }
    /* الجهة المورّدة للآليات من الاستمارة الرسمية ← دور «مورد آليات» */
    for (const s of surveys) {
      if (!s.supplier) continue;
      const k0 = coKey(s.supplier);
      const x = get(alias.get(k0) || k0, s.supplier);
      x.roles.add('مورد آليات');
      x.supplied = (x.supplied || 0) + 1;
    }
    for (const d of registry.dumps) if (d.operator) get(alias.get(coKey(d.operator)) || coKey(d.operator), d.operator).roles.add('مشغّل مكب');
    return [...m.values()].map((x) => ({
      ...x,
      name: x.official ? x.name : ([...x.names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || x.name),
      roles: [...x.roles],
    })).sort((a, b) => b.roles.length - a.roles.length || b.vol - a.vol);
  }, [surveys, registry]);

  const allRoles = [...new Set(list.flatMap((x) => x.roles))].sort((a, b) =>
    list.filter((x) => x.roles.includes(b)).length - list.filter((x) => x.roles.includes(a)).length);
  const k = norm(q);
  const shown = list.filter((x) => (!roles.length || roles.every((r) => x.roles.includes(r)))
    && (!k || norm(x.name).includes(k)));
  const multi = list.filter((x) => x.roles.length > 1).length;

  return (
    <div className="reg">
      <TemplateDownload id="entities" />
      <div className="hub-kpis" style={{ '--c': '#2f9e74' }}>
        <div><span>الجهات العاملة</span><b>{fmt(list.length)}</b></div>
        <div><span>أدوار مسجّلة</span><b>{fmt(allRoles.length)}</b></div>
        <div><span>جهات بأكثر من دور</span><b>{fmt(multi)}</b></div>
        <div><span>مصنّفة رسمياً في السجل</span><b>{fmt(list.filter((x) => x.official).length)}</b></div>
      </div>

      <div className="reg-roles">
        <span>الدور:</span>
        {allRoles.map((r) => (
          <button type="button" key={r} style={{ '--c': roleColor(r) }} className={roles.includes(r) ? 'is-on' : ''}
            onClick={() => setRoles(roles.includes(r) ? roles.filter((x) => x !== r) : [...roles, r])}>
            {r} <small>{fmt(list.filter((x) => x.roles.includes(r)).length)}</small>
          </button>
        ))}
        {roles.length > 1 && <em>تُعرض الجهات التي تجمع كل الأدوار المختارة</em>}
        <input className="rt-search reg-search" type="search" value={q} placeholder="ابحث عن جهة…" onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="reg-grid">
        {shown.map((x) => (
          <article key={x.key} className="reg-card">
            <header>
              <h4>{x.name}</h4>
              {x.type && <span className="reg-card__type">{x.type}</span>}
            </header>
            <div className="reg-card__roles">
              {x.roles.map((r) => <span key={r} style={{ '--c': roleColor(r) }}>{r}</span>)}
            </div>
            <dl>
              {x.sites > 0 && <div><dt>أعمال الترحيل</dt><dd>{fmt(x.vol)} م³ · {fmt(x.sites)} موقعاً</dd></div>}
              {x.supplied > 0 && <div><dt>توريد آليات</dt><dd>{fmt(x.supplied)} موقعاً</dd></div>}
              {x.govs.size > 0 && <div><dt>المحافظات</dt><dd>{[...x.govs].join('، ')}</dd></div>}
              {x.contact && <div><dt>التواصل</dt><dd>{x.contact}</dd></div>}
            </dl>
            {x.notes && <p className="reg-card__notes">{x.notes}</p>}
            {!x.official && <p className="reg-card__auto">مستخرجة تلقائياً من الاستمارات — لم تُصنَّف في السجل بعد</p>}
          </article>
        ))}
        {shown.length === 0 && <p className="rt-empty">لا جهات بهذه التصفية.</p>}
      </div>
    </div>
  );
}

/* ---------------- المكبات ---------------- */

/* مسافة تقريبية بالكيلومتر (كافية لمطابقة مكب ضمن 1 كم) */
const km = (a, b) => {
  const dLat = (a.lat - b.lat) * 111;
  const dLon = (a.lon - b.lon) * 111 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
};

/* المكبات: مستخرجة من إحداثيات المكب في الاستمارات، ومكمّلة من سجل المكبات */
export function buildDumps(surveys, registry) {
    /* تجميع الاستمارات حسب إحداثيات المكب (خلية ~1 كم) */
    const m = new Map();
    for (const s of surveys) {
      if (!s.dumpLat || !s.dumpLon) continue;
      const key = `${s.dumpLat.toFixed(2)},${s.dumpLon.toFixed(2)}`;
      const d = m.get(key) || { key, names: new Map(), lat: 0, lon: 0, n: 0, received: 0, approved: 0, gov: s.gov, areas: new Set(), cos: new Set() };
      d.names.set(s.dumpName || 'بلا اسم', (d.names.get(s.dumpName || 'بلا اسم') || 0) + 1);
      d.lat += s.dumpLat; d.lon += s.dumpLon; d.n += 1; d.received += s.vol;
      if (/معتمد/.test(s.dump)) d.approved += 1;
      if (s.area) d.areas.add(s.area);
      if (s.co) d.cos.add(s.co);
      m.set(key, d);
    }
    const out = [...m.values()].map((d) => ({
      key: d.key,
      name: [...d.names.entries()].sort((a, b) => b[1] - a[1])[0][0],
      lat: d.lat / d.n, lon: d.lon / d.n, gov: d.gov, sites: d.n, received: d.received,
      status: d.approved * 2 >= d.n ? 'معتمد' : 'مقترح',
      areas: [...d.areas], cos: d.cos.size,
    }));
    /* تكميل من السجل: بالإحداثيات ضمن 1 كم، أو بالاسم */
    for (const r of registry.dumps) {
      let hit = r.lat && r.lon ? out.find((d) => km(d, r) <= 1) : null;
      if (!hit) hit = out.find((d) => norm(d.name) === norm(r.name));
      if (hit) {
        Object.assign(hit, { name: r.name, official: true, area: r.area, capacity: r.capacity, height: r.height, operator: r.operator, notes: r.notes });
        if (r.status) hit.status = r.status;
        if (r.gov) hit.gov = r.gov;
      } else if (r.lat && r.lon) {
        out.push({ key: `r-${r.name}`, name: r.name, lat: r.lat, lon: r.lon, gov: r.gov, sites: 0, received: 0,
          status: r.status || 'مقترح', areas: [], cos: 0, official: true, area: r.area, capacity: r.capacity, height: r.height, operator: r.operator, notes: r.notes });
      }
    }
    return out.sort((a, b) => b.received - a.received);
}

export function Dumps({ surveys, registry, basemap }) {
  const [status, setStatus] = useState('all');
  const [gov, setGov] = useState('all');
  const [open, setOpen] = useState(null);

  const dumps = useMemo(() => buildDumps(surveys, registry), [surveys, registry]);

  const govs = [...new Set(dumps.map((d) => d.gov).filter(Boolean))];
  const shown = dumps.filter((d) => (status === 'all' || d.status === status) && (gov === 'all' || d.gov === gov));
  const approved = dumps.filter((d) => d.status === 'معتمد');
  const locations = shown.map((d) => ({
    code: d.key, name: `${d.name} — ${d.status}`, governorate: d.gov, lat: d.lat, lon: d.lon,
    count: Math.max(1, d.sites), color: d.status === 'معتمد' ? '#2f9e74' : '#e0a33a',
  }));

  return (
    <div className="reg">
      <TemplateDownload id="dumps" />
      <div className="hub-kpis" style={{ '--c': '#d4a443' }}>
        <div><span>المكبات</span><b>{fmt(dumps.length)}</b></div>
        <div><span>معتمدة</span><b>{fmt(approved.length)}</b></div>
        <div><span>مقترحة من المجالس المحلية</span><b>{fmt(dumps.length - approved.length)}</b></div>
        <div><span>الكمية المستقبلة</span><b>{fmt(dumps.reduce((a, d) => a + d.received, 0))}</b><small>م³</small></div>
      </div>

      <div className="hub-chips">
        {['all', 'معتمد', 'مقترح'].map((s) => (
          <button type="button" key={s} className={status === s ? 'is-on' : ''} onClick={() => setStatus(s)}>
            {s === 'all' ? 'كل المكبات' : s} <small>{fmt(s === 'all' ? dumps.length : dumps.filter((d) => d.status === s).length)}</small>
          </button>
        ))}
        {govs.length > 1 && ['all', ...govs].map((g) => (
          <button type="button" key={g} className={gov === g ? 'is-on' : ''} onClick={() => setGov(g)}>{g === 'all' ? 'كل المحافظات' : g}</button>
        ))}
      </div>

      {basemap && (
        <div className="rx-mapcard">
          <div className="rx-mapcard__legend">
            <span className="reg-dot" style={{ '--c': '#2f9e74' }}><i /> مكب معتمد</span>
            <span className="reg-dot" style={{ '--c': '#e0a33a' }}><i /> موقع مقترح من المجلس المحلي</span>
            <span>حجم الدائرة = عدد مواقع العمل التي رُحّلت إليه</span>
          </div>
          <SyriaMap basemap={basemap} locations={locations} noun="المكبات" className="rx-map reg-map" height={520} />
        </div>
      )}

      <div className="reg-grid">
        {shown.slice(0, open === 'all' ? undefined : 24).map((d) => {
          const remaining = d.capacity != null ? Math.max(0, d.capacity - d.received) : null;
          const fill = d.capacity ? Math.min(100, (d.received / d.capacity) * 100) : null;
          return (
            <article key={d.key} className={`reg-card reg-dump reg-dump--${d.status === 'معتمد' ? 'ok' : 'prop'}`}>
              <header>
                <h4>{d.name}</h4>
                <span className="reg-card__type">{d.status}</span>
              </header>
              <dl>
                <div><dt>المحافظة</dt><dd>{d.gov || '—'}</dd></div>
                <div><dt>الإحداثيات</dt><dd dir="ltr">{d.lat.toFixed(5)}, {d.lon.toFixed(5)}</dd></div>
                <div><dt>المساحة</dt><dd>{d.area != null ? `${fmt(d.area)} م²` : '—'}</dd></div>
                {d.area != null && d.height != null && <div><dt>الأنقاض المتوضعة (المساحة × متوسط الارتفاع)</dt><dd>{fmt(d.area * d.height)} م³</dd></div>}
                <div><dt>السعة التصميمية</dt><dd>{d.capacity != null ? `${fmt(d.capacity)} م³` : '—'}</dd></div>
                <div><dt>المستقبل حتى تاريخه</dt><dd className="is-strong">{fmt(d.received)} م³</dd></div>
                <div><dt>السعة المتبقية</dt><dd>{remaining != null ? `${fmt(remaining)} م³` : '—'}</dd></div>
                <div><dt>الجهة المشغّلة</dt><dd>{d.operator || '—'}</dd></div>
              </dl>
              {fill != null && <div className="hub-card__prog"><span className="hub-card__track"><span style={{ width: `${fill}%`, background: fill > 85 ? '#e0735a' : undefined }} /></span><b>{Math.round(fill)}%</b></div>}
              <p className="reg-card__auto">
                {d.sites ? `${fmt(d.sites)} موقع عمل رحّل إليه${d.areas.length ? ` من ${d.areas.slice(0, 3).join('، ')}` : ''}` : 'مسجّل في سجل المكبات — لم تُرحَّل إليه أنقاض بعد'}
              </p>
            </article>
          );
        })}
      </div>
      {shown.length > 24 && open !== 'all' && (
        <button type="button" className="rx-more" onClick={() => setOpen('all')}>عرض كل المكبات ({fmt(shown.length)})</button>
      )}
    </div>
  );
}

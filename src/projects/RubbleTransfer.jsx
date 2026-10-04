import { useEffect, useMemo, useState } from 'react';
import Figure from '../components/Figure';
import SyriaMap from '../components/SyriaMap';
import { rubbleTransferFeed } from './store';

/*
  مشروع ترحيل الأنقاض — إدارة تقييم الأضرار والتعافي.
  مراحل المشروع (مخطط/منفذ لكل منطقة) + الاستبيانات الميدانية من KoBoToolbox.
  البيانات في data/rubble-transfer.json وتُنسخ إلى public/data عند البناء.
*/

export const RUBBLE_PROJECT = {
  id: 'rubble-transfer',
  name: 'مشروع ترحيل الأنقاض',
  description: 'إدارة تقييم الأضرار والتعافي — متابعة خطة ترحيل الأنقاض عبر المحافظات، والاستبيانات الميدانية، وأداء الجهات المنفذة.',
  surveysCount: 1289,
};

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
/* توحيد الكتابة للمطابقة: ادلب = إدلب، ريف حلب = حلب */
const norm = (s) => String(s ?? '').trim().replace(/[إأآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/\s+/g, ' ');
const govKey = (g) => { const n = norm(g); return n === 'ريف حلب' ? 'حلب' : n; };
const GOV_LABEL = { ادلب: 'إدلب', حماه: 'حماة', 'ريف دمشق': 'ريف دمشق' };
const govName = (raw) => {
  /* إجابات المنصة تحمل رمز المحافظة (SY07) */
  const g = (/^SY\d/.test(raw || '') && govNames?.get(raw)) || raw;
  return GOV_LABEL[govKey(g)] ?? govKey(g).replace(/ه$/, 'ة');
};
/* اسم الجهة المنفذة: يُدمج «شركة الفاتح» و«شركة الفاتح للانشاءات» وأخطاء الإملاء الشائعة */
const coKey = (raw) => {
  const n = norm(raw);
  if (!n) return '';
  if (n.includes('الطوارئ')) return 'وزاره الطوارئ';
  if (n.includes('الدفاع المدني')) return 'الدفاع المدني';
  /* تُحذف الكلمات العامة و«ال» التعريف، وتُرتّب الكلمات: «ركان فرج عقدي» = «شركة فرج ركان عقدي» */
  return n.split(' ')
    .filter((w) => !/^(شركه|شركة|موسسه|مؤسسه|المقاول|للمقاولات|المقاولات|للانشاءات|الانشاءات|انشاءات|للاعمار|و)$/.test(w))
    .map((w) => w.replace(/^ال(?=..)/, '').replace(/^ل(?=ل)/, ''))
    .sort().join(' ');
};

let govNames = null;



/* لوحة ألوان المشروع: لون ثابت لكل فئة حتى يُعرف الشيء بلونه في كل الأقسام */
const PAL = ['#2f9e74', '#d4a443', '#e0735a', '#4f8fdc', '#8d6bc9', '#35b3ad', '#d2668f', '#86a23c'];
const PHASE_COLOR = ['#35b3ad', '#d4a443', '#8d6bc9'];
const PHASE_KEYS = ['المرحلة الأولى', 'المرحلة الثانية', 'المرحلة الثالثة'];
const projLabel = (s) => `المشروع ${['', 'الأول', 'الثاني', 'الثالث'][s.p] || ''}`;

/* درجة الإنجاز → لون الخلية في المصفوفة */
const heat = (r, planned) => {
  if (!planned) return 'none';
  if (r >= 100) return 'h4';
  if (r >= 60) return 'h3';
  if (r >= 20) return 'h2';
  if (r > 0) return 'h1';
  return 'h0';
};

function sumBy(list, key, val = () => 1) {
  const m = new Map();
  for (const x of list) { const k = key(x); if (k) m.set(k, (m.get(k) || 0) + val(x)); }
  return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

/* ---------------- حلقة الإنجاز ---------------- */

function Ring({ value }) {
  const r = 70;
  const c = 2 * Math.PI * r;
  return (
    <svg className="rx-ring" viewBox="0 0 180 180" role="img" aria-label={`نسبة الإنجاز ${value}%`}>
      <defs>
        <linearGradient id="rxg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#35b3ad" /><stop offset="1" stopColor="#d4a443" />
        </linearGradient>
      </defs>
      <circle cx="90" cy="90" r={r} className="rx-ring__track" />
      <circle cx="90" cy="90" r={r} className="rx-ring__val" stroke="url(#rxg)"
        strokeDasharray={`${(Math.min(100, value) / 100) * c} ${c}`} transform="rotate(-90 90 90)" />
      <text x="90" y="88" className="rx-ring__num">{value}%</text>
      <text x="90" y="112" className="rx-ring__cap">من الخطة منجز</text>
    </svg>
  );
}

/* ---------------- قراءات ذكية ---------------- */

function insights({ govs, surveys, t, contractors }) {
  const out = [];
  const active = govs.filter((g) => g.planned > 0);
  const best = [...active].sort((a, b) => b.rate - a.rate)[0];
  if (best) out.push({ tone: 0, icon: '▲', text: <>محافظة <b>{best.name}</b> الأعلى إنجازاً بنسبة <b>{best.rate}%</b> من مخططها.</> });

  const remaining = active.map((g) => ({ ...g, rem: Math.max(0, g.planned - g.executed) })).sort((a, b) => b.rem - a.rem);
  const remTotal = remaining.reduce((a, g) => a + g.rem, 0) || 1;
  const top3 = remaining.slice(0, 3);
  out.push({ tone: 2, icon: '◎', text: <><b>{pct(top3.reduce((a, g) => a + g.rem, 0), remTotal)}%</b> من الكميات المتبقية تتركز في {top3.map((g) => g.name).join(' و')} — هنا يجب أن يتجه الجهد القادم.</> });

  const idle = active.filter((g) => g.executed === 0);
  if (idle.length) out.push({ tone: 3, icon: '◷', text: <>{idle.length} محافظات لم يبدأ فيها التنفيذ بعد ({idle.map((g) => g.name).join('، ')}) بمخطط <b>{fmt(idle.reduce((a, g) => a + g.planned, 0))} م³</b>.</> });

  const roads = surveys.filter((s) => /طريق/.test(s.nature)).length;
  out.push({ tone: 5, icon: '⇢', text: <><b>{pct(roads, surveys.length)}%</b> من المواقع الموثقة طرق رئيسية وفرعية، أي أن فتح الطرق هو العمل الغالب ميدانياً.</> });

  const local = surveys.filter((s) => s.dump && !/معتمد/.test(s.dump));
  const localVol = local.reduce((a, s) => a + s.vol, 0);
  if (local.length) out.push({ tone: 2, icon: '!', text: <><b>{pct(localVol, t.surveyVol)}%</b> من الأنقاض الموثقة نُقلت إلى مواقع مقترحة محلياً لا إلى مكبات معتمدة — يستحق متابعة بيئية.</> });

  const top5 = contractors.slice(0, 5).reduce((a, c) => a + c.vol, 0);
  out.push({ tone: 4, icon: '★', text: <>أكبر خمس جهات منفذة رحّلت <b>{pct(top5, t.surveyVol)}%</b> من الكميات الموثقة، وتتصدرها <b>{contractors[0]?.name}</b>.</> });

  out.push({ tone: 1, icon: '≈', text: <>متوسط الكمية في الموقع الواحد <b>{fmt(t.surveyVol / (surveys.length || 1))} م³</b>.</> });
  return out;
}

/* ---------------- الصفحة: الأقسام ---------------- */

function Summary({ t, items }) {
  return (
    <section className="rx-top">
      <div className="rx-top__ring">
        <Ring value={pct(t.executed, t.planned)} />
      </div>
      <div className="rx-top__nums">
        <div className="rx-num rx-num--a"><span>المخطط ترحيله</span><Figure value={t.planned} className="rx-num__v" /><em>م³</em></div>
        <div className="rx-num rx-num--b"><span>تم ترحيله</span><Figure value={t.executed} className="rx-num__v" /><em>م³</em></div>
        <div className="rx-num rx-num--c"><span>بانتظار الترحيل</span><Figure value={Math.max(0, t.planned - t.executed)} className="rx-num__v" /><em>م³</em></div>
        <div className="rx-num rx-num--d"><span>مواقع موثّقة ميدانياً</span><Figure value={t.surveys} className="rx-num__v" /><em>{t.live ? `منها ${fmt(t.live)} من استبيان المنصة` : 'موقع'}</em></div>
      </div>
      <div className="rx-insights">
        <h3>ماذا تقول الأرقام؟</h3>
        <ul>
          {items.map((x, i) => (
            <li key={i} style={{ '--c': PAL[x.tone] }}><span className="rx-insights__ic">{x.icon}</span><p>{x.text}</p></li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function PhaseRibbon({ phases }) {
  const total = phases.reduce((a, p) => a + p.planned, 0) || 1;
  return (
    <section className="rx-block">
      <header className="rx-head"><h2>مسار المراحل الثلاث</h2><p>عرض كل مرحلة يتناسب مع حجمها المخطط، والجزء الملوّن هو ما أُنجز منها.</p></header>
      <div className="rx-ribbon">
        {phases.map((p, i) => (
          <div key={p.key} className="rx-ribbon__seg" style={{ flexGrow: p.planned / total, '--c': PHASE_COLOR[i] }}>
            <span className="rx-ribbon__fill" style={{ width: `${Math.min(100, p.rate)}%` }} />
            <span className={`rx-ribbon__pct${p.rate < 50 ? ' is-low' : ''}`}>{p.rate}%</span>
          </div>
        ))}
      </div>
      <div className="rx-phases">
        {phases.map((p, i) => (
          <article key={p.key} style={{ '--c': PHASE_COLOR[i] }}>
            <span className="rx-dot" />
            <div>
              <h3>{p.title} <small>{p.rate >= 100 ? 'منجزة' : p.executed > 0 ? 'قيد التنفيذ' : 'إعداد وتجهيز'}</small></h3>
              <p><b>{fmt(p.executed)}</b> من {fmt(p.planned)} م³ — {p.govs.join('، ')}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Matrix({ govs }) {
  const [open, setOpen] = useState(null);
  return (
    <section className="rx-block">
      <header className="rx-head">
        <h2>المحافظات عبر المراحل</h2>
        <p>كل خلية نسبة الإنجاز في محافظة ضمن مرحلة. اضغط اسم المحافظة لرؤية مناطقها.</p>
      </header>
      <div className="rx-legend">
        <span className="h0">لم يبدأ</span><span className="h1">أقل من 20%</span><span className="h2">20–59%</span><span className="h3">60–99%</span><span className="h4">مكتمل</span>
      </div>
      <div className="rx-matrix" role="table">
        <div className="rx-matrix__row rx-matrix__row--head" role="row">
          <span role="columnheader">المحافظة</span>
          {PHASE_KEYS.map((k, i) => <span key={k} role="columnheader" style={{ color: PHASE_COLOR[i] }}>{k}</span>)}
          <span role="columnheader">الإجمالي</span>
        </div>
        {govs.map((g) => (
          <div key={g.key} className="rx-matrix__group">
            <div className="rx-matrix__row" role="row">
              <button type="button" className="rx-matrix__gov" aria-expanded={open === g.key} onClick={() => setOpen(open === g.key ? null : g.key)}>
                {g.name}<small>{fmt(g.planned)} م³</small>
              </button>
              {PHASE_KEYS.map((k) => {
                const rs = g.regions.filter((r) => r.phase === k);
                const pl = rs.reduce((a, r) => a + r.planned, 0);
                const ex = rs.reduce((a, r) => a + r.executed, 0);
                const r = pct(ex, pl);
                return (
                  <span key={k} role="cell" className={`rx-cell rx-cell--${heat(r, pl)}`} title={pl ? `${fmt(ex)} من ${fmt(pl)} م³` : 'غير مشمولة'}>
                    {pl ? <>{r}%<small>{fmt(pl)}</small></> : '—'}
                  </span>
                );
              })}
              <span role="cell" className={`rx-cell rx-cell--total rx-cell--${heat(g.rate, g.planned)}`}>{g.rate}%</span>
            </div>
            {open === g.key && (
              <ul className="rx-regions">
                {g.regions.filter((r) => r.planned > 0).map((r, i) => (
                  <li key={i} style={{ '--c': PHASE_COLOR[PHASE_KEYS.indexOf(r.phase)] }}>
                    <b>{r.region}</b>
                    <span className="rx-mini"><span style={{ width: `${Math.min(100, pct(r.executed, r.planned))}%` }} /></span>
                    <span className="rx-regions__n">{fmt(r.executed)} / {fmt(r.planned)}</span>
                    {r.notes && <em>{r.notes}</em>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function Stack({ data, total, unit }) {
  return (
    <>
      <div className="rx-stack">
        {data.map((d, i) => <span key={d.label} style={{ flexGrow: d.value, background: PAL[i % PAL.length] }} title={`${d.label}: ${fmt(d.value)}`} />)}
      </div>
      <ul className="rx-keys">
        {data.map((d, i) => (
          <li key={d.label}><i style={{ background: PAL[i % PAL.length] }} />{d.label}<b>{pct(d.value, total)}%</b><small>{fmt(d.value)} {unit}</small></li>
        ))}
      </ul>
    </>
  );
}

/* هل النقطة داخل حدود سوريا؟ (ray casting على MultiPolygon من basemap.country) */
function inside(poly, x, y) {
  let hit = false;
  for (const ring of poly) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}
function inSyria(basemap, lon, lat) {
  const geoms = (basemap?.country || []).map((c) => c.g);
  if (!geoms.length) return true;
  return geoms.some((g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).some((poly) => inside(poly, lon, lat)));
}

function Field({ surveys, basemap, t }) {
  const locations = useMemo(() => {
    const m = new Map();
    for (const raw of surveys) {
      let s = raw;
      if (!s.lat || !s.lon) continue;
      /* إحداثيات خارج الحدود: إن كانت مقلوبة (خط الطول مكان العرض) تُصحَّح، وإلا تُستبعد من الخريطة */
      if (!inSyria(basemap, s.lon, s.lat)) {
        if (inSyria(basemap, s.lat, s.lon)) s = { ...s, lat: s.lon, lon: s.lat };
        else continue;
      }
      const code = `${s.lat.toFixed(3)},${s.lon.toFixed(3)}`;
      const cur = m.get(code) || { code, name: [s.village || s.town, s.area].filter(Boolean).join(' — '), governorate: govName(s.gov), lat: s.lat, lon: s.lon, count: 0 };
      cur.count += 1;
      m.set(code, cur);
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  }, [surveys, basemap]);
  const outside = surveys.filter((s) => s.lat && s.lon && !inSyria(basemap, s.lon, s.lat) && !inSyria(basemap, s.lat, s.lon)).length;
  const nature = sumBy(surveys, (s) => s.nature, (s) => s.vol);
  const dump = sumBy(surveys, (s) => s.dump.replace(/\s+/g, ' '), (s) => s.vol);
  const gov = sumBy(surveys, (s) => govName(s.gov), (s) => s.vol);
  const areas = sumBy(surveys, (s) => s.area && `${s.area}`, (s) => s.vol).slice(0, 6);

  return (
    <section className="rx-block">
      <header className="rx-head"><h2>من الميدان</h2><p>ما وثّقته الاستمارات: أين عملنا، وماذا رحّلنا، وإلى أين.</p></header>
      <div className="rx-field">
        {basemap && (
          <div className="rx-card rx-card--map">
            {outside > 0 && <p className="rx-mapnote">{fmt(outside)} استمارة إحداثياتها خارج الحدود أو غير صحيحة — لم تُرسم على الخريطة.</p>}
            <SyriaMap basemap={basemap} locations={locations} noun="المواقع" />
          </div>
        )}
        <div className="rx-col">
          <div className="rx-card">
            <h3>الكميات حسب المحافظة</h3>
            <Stack data={gov} total={t.surveyVol} unit="م³" />
          </div>
          <div className="rx-card">
            <h3>نوع الموقع</h3>
            <Stack data={nature} total={t.surveyVol} unit="م³" />
          </div>
          <div className="rx-card">
            <h3>وجهة الأنقاض</h3>
            <Stack data={dump} total={t.surveyVol} unit="م³" />
          </div>
        </div>
      </div>
      <div className="rx-card">
        <h3>المناطق الأكثر ترحيلاً</h3>
        <div className="rx-tiles">
          {areas.map((a, i) => (
            <div key={a.label} className="rx-tile" style={{ '--c': PAL[i % PAL.length] }}>
              <span>{a.label}</span><b>{fmt(a.value)}</b><small>م³</small>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Contractors({ list, total }) {
  const [all, setAll] = useState(false);
  const top = list[0]?.vol || 1;
  const shown = all ? list : list.slice(0, 8);
  const rest = list.slice(8);
  return (
    <section className="rx-block">
      <header className="rx-head"><h2>من نفّذ العمل؟</h2><p>الجهات حسب الكميات المرحّلة الموثقة. دُمجت التسميات المختلفة للجهة الواحدة.</p></header>
      <ol className="rx-cos">
        {shown.map((c, i) => (
          <li key={c.name} style={{ '--c': PAL[i % PAL.length] }}>
            <span className="rx-cos__n">{i + 1}</span>
            <span className="rx-cos__name">{c.name}<small>{fmt(c.count)} موقعاً · {[...c.govs].join('، ')}</small></span>
            <span className="rx-cos__bar"><span style={{ width: `${(c.vol / top) * 100}%` }} /></span>
            <b>{fmt(c.vol)}<small> م³ · {pct(c.vol, total)}%</small></b>
          </li>
        ))}
      </ol>
      {rest.length > 0 && (
        <button type="button" className="rx-more" onClick={() => setAll(!all)}>
          {all ? 'عرض أهم 8 جهات فقط' : `وبقية الجهات (${rest.length}) مجتمعةً ${pct(rest.reduce((a, c) => a + c.vol, 0), total)}% — عرض الكل`}
        </button>
      )}
    </section>
  );
}

function Registry({ surveys }) {
  const [q, setQ] = useState('');
  const [gov, setGov] = useState(null);
  const [n, setN] = useState(12);
  const [view, setView] = useState(null);
  const govs = sumBy(surveys, (s) => govName(s.gov));
  const list = useMemo(() => {
    const k = norm(q);
    return surveys.filter((s) => (!gov || govName(s.gov) === gov)
      && (!k || norm([s.co, s.by, s.area, s.town, s.village, s.addr, s.id].join(' ')).includes(k)))
      .sort((a, b) => b.vol - a.vol);
  }, [surveys, q, gov]);

  return (
    <section className="rx-block">
      <header className="rx-head"><h2>سجل المواقع</h2><p>مرتّبة من الأكبر كمية. اضغط أي موقع لتفاصيله.</p></header>
      <div className="rx-reg__bar">
        <input className="rt-search" type="search" value={q} placeholder="ابحث باسم الجهة أو القرية أو رقم الاستمارة…"
          onChange={(e) => { setQ(e.target.value); setN(12); }} />
        <div className="rx-chips">
          <button type="button" className={!gov ? 'is-on' : ''} onClick={() => setGov(null)}>الكل <small>{fmt(surveys.length)}</small></button>
          {govs.map((g, i) => (
            <button type="button" key={g.label} style={{ '--c': PAL[i % PAL.length] }} className={gov === g.label ? 'is-on' : ''}
              onClick={() => { setGov(gov === g.label ? null : g.label); setN(12); }}>{g.label} <small>{fmt(g.value)}</small></button>
          ))}
        </div>
      </div>
      <div className="rx-sites">
        {list.slice(0, n).map((s) => (
          <button type="button" key={`${s.p}-${s.id}`} className="rx-site" onClick={() => setView(s)}>
            <span className="rx-site__vol">{fmt(s.vol)}<small>م³</small></span>
            <span className="rx-site__main">
              <b>{[s.village || s.town, s.area].filter(Boolean).join(' — ')}</b>
              <small>{govName(s.gov)} · {s.nature} · {s.co}</small>
            </span>
            <span className="rx-site__tag">{projLabel(s)}</span>
          </button>
        ))}
        {list.length === 0 && <p className="rt-empty">لا نتائج.</p>}
      </div>
      {list.length > n && <button type="button" className="rx-more" onClick={() => setN(n + 24)}>عرض المزيد ({fmt(list.length - n)} متبقٍ)</button>}
      {view && <SurveyModal s={view} onClose={() => setView(null)} />}
    </section>
  );
}

function F({ k, v, strong }) {
  return v ? <div><dt>{k}</dt><dd className={strong ? 'is-strong' : ''}>{v}</dd></div> : null;
}

function SurveyModal({ s, onClose }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const photos = [['قبل البدء', s.photos?.[0]], ['أثناء التنفيذ', s.photos?.[1]], ['بعد الانتهاء', s.photos?.[2]]].filter((p) => p[1]);
  return (
    <div className="rt-modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="rt-modal__box" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <span className="rt-kicker">استبيان ميداني رقم #{s.id}</span>
            <h3>{[s.village || s.town, s.area].filter(Boolean).join(' — ')}</h3>
            <p>{projLabel(s)} — محافظة {govName(s.gov)}</p>
          </div>
          <button type="button" className="rt-modal__x" onClick={onClose} aria-label="إغلاق">✕</button>
        </header>
        <div className="rt-modal__vol"><Figure value={s.vol} className="rt-modal__fig" /> <span>م³ مرحّلة من الموقع</span></div>
        <dl className="rt-modal__grid">
          <F k="طبيعة الموقع" v={s.nature} />
          <F k="عنوان الموقع" v={s.addr} />
          <F k="الجهة المنفذة" v={s.co} strong />
          <F k="مدلي البيانات" v={s.by} />
          <F k="جهة الترحيل" v={s.dump.replace(/\s+/g, ' ')} />
          <F k="المسافة إلى المكب" v={s.dist} />
          <F k="ساعات عمل الآليات" v={s.hours ? `${fmt(s.hours)} ساعة` : null} />
          <F k="الأسر المستفيدة" v={s.fam ? fmt(s.fam) : null} />
          <F k="تاريخ رفع البيانات" v={s.date} />
          <F k="الإحداثيات" v={s.lat ? `${s.lat}, ${s.lon}` : null} />
          <F k="المصدر" v={s.live ? `استبيان المنصة${s.hasPhotos ? ' — الصور في مساحة العمل' : ''}` : 'KoBoToolbox'} />
        </dl>
        {photos.length > 0 && (
          <div className="rt-modal__photos">
            {photos.map(([label, url]) => (
              <a key={label} href={url} target="_blank" rel="noreferrer">صورة {label} ↗</a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* إجابة من استبيان المنصة ← صف بنفس شكل بيانات KoBo */
function fromResponse(r, i) {
  const a = r.answers || {};
  const code = a.rt_gov?.governorate || '';
  return {
    id: `م-${i + 1}`, p: Number(a.rt_phase) || 3, live: true,
    date: a.rt_date || String(r.submittedAt || '').slice(0, 10),
    by: a.rt_collector || '', co: a.rt_contractor || 'غير محدد', nature: a.rt_nature || '',
    addr: a.rt_address || '', gov: code, area: a.rt_area || '',
    town: a.rt_town || '', village: a.rt_village || '',
    lat: Number(a.rt_point?.lat) || 0, lon: Number(a.rt_point?.lng) || 0,
    vol: Number(a.rt_volume) || 0, dump: a.rt_dump || '', dist: a.rt_distance || '',
    hours: Number(a.rt_hours) || null, fam: Number(a.rt_families) || null, photos: [],
    hasPhotos: Boolean(r.photos),
  };
}

/* ---------------- الصفحة ---------------- */

export default function RubbleTransfer({ basemap }) {
  if (basemap && !govNames) govNames = new Map((basemap.governorates || []).map((g) => [g.code, g.name]));
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    /*
      البيانات الأساسية (KoBo) من الملف، ثم تُضاف إليها الإجابات المعتمدة من
      استبيان المنصة. إن تعذّر الاتصال بقاعدة البيانات يبقى التقرير بالبيانات الأساسية.
    */
    Promise.all([
      fetch('data/rubble-transfer.json').then((r) => r.json()),
      rubbleTransferFeed().catch(() => []),
    ]).then(([base, live]) => setData({ ...base, live: live.length, surveys: [...base.surveys, ...live.map(fromResponse)] }))
      .catch(() => setError(true));
  }, []);

  const model = useMemo(() => {
    if (!data) return null;
    const gm = new Map();
    for (const r of data.phases) {
      const k = govKey(r.gov);
      const g = gm.get(k) || { key: k, name: govName(r.gov), planned: 0, executed: 0, regions: [] };
      g.planned += r.planned; g.executed += r.executed; g.regions.push(r);
      gm.set(k, g);
    }
    const govs = [...gm.values()].map((g) => ({ ...g, rate: pct(g.executed, g.planned) })).sort((a, b) => b.planned - a.planned);
    const phases = PHASE_KEYS.map((key) => {
      const rs = data.phases.filter((r) => r.phase === key);
      const planned = rs.reduce((a, r) => a + r.planned, 0);
      const executed = rs.reduce((a, r) => a + r.executed, 0);
      return { key, title: key, planned, executed, rate: pct(executed, planned), govs: [...new Set(rs.map((r) => govName(r.gov)))] };
    });
    const cm = new Map();
    for (const s of data.surveys) {
      const k = coKey(s.co) || 'غير محدد';
      const c = cm.get(k) || { names: new Map(), count: 0, vol: 0, govs: new Set() };
      c.names.set(s.co, (c.names.get(s.co) || 0) + 1);
      c.count += 1; c.vol += s.vol; c.govs.add(govName(s.gov));
      cm.set(k, c);
    }
    const contractors = [...cm.values()].map((c) => ({ ...c, name: [...c.names.entries()].sort((a, b) => b[1] - a[1])[0][0] }))
      .sort((a, b) => b.vol - a.vol);
    const t = {
      planned: data.phases.reduce((a, r) => a + r.planned, 0),
      executed: Math.round(data.phases.reduce((a, r) => a + r.executed, 0)),
      surveys: data.surveys.length,
      live: data.live || 0,
      surveyVol: data.surveys.reduce((a, s) => a + s.vol, 0),
    };
    return { govs, phases, contractors, t, items: insights({ govs, surveys: data.surveys, t, contractors }) };
  }, [data]);

  if (error) return <div className="pending"><h3>تعذّر تحميل بيانات المشروع</h3><p>حدّث الصفحة وحاول مجدداً.</p></div>;
  if (!model) return <p className="results__empty">جارٍ التحميل…</p>;

  return (
    <div className="rx">
      <Summary t={model.t} items={model.items} />
      <PhaseRibbon phases={model.phases} />
      <Matrix govs={model.govs} />
      <Field surveys={data.surveys} basemap={basemap} t={model.t} />
      <Contractors list={model.contractors} total={model.t.surveyVol} />
      <Registry surveys={data.surveys} />
      <button type="button" className="rx-more rx-print" onClick={() => window.print()}>طباعة التقرير</button>
    </div>
  );
}

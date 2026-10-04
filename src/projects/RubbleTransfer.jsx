import { useEffect, useMemo, useState } from 'react';
import { Stat, Panel } from '../components/ReportShell';
import BarChart from '../components/BarChart';
import Donut from '../components/Donut';
import Figure from '../components/Figure';
import Icon from '../components/Icon';
import Dropdown from '../components/Dropdown';
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

const PHASES = [
  { key: 'المرحلة الأولى', title: 'المرحلة الأولى', scope: 'إزالة الأنقاض من المنشآت العامة والطرق الرئيسية في إدلب وحماة واللاذقية.' },
  { key: 'المرحلة الثانية', title: 'المرحلة الثانية', scope: 'ترحيل الأنقاض من الطرق الحيوية في ريف حلب وإدلب واللاذقية ودير الزور.' },
  { key: 'المرحلة الثالثة', title: 'المرحلة الثالثة', scope: 'مشاريع درعا وريف دمشق (حرستا) وحمص وحماة وريف حلب وإدلب.' },
];

const TABS = [
  { id: 'overview', label: 'نظرة عامة' },
  { id: 'govs', label: 'المحافظات والمراحل' },
  { id: 'spatial', label: 'التوزيع الجغرافي' },
  { id: 'surveys', label: 'الاستبيانات الميدانية' },
  { id: 'contractors', label: 'الجهات المنفذة' },
  { id: 'rca', label: 'تدوير الخرسانة' },
];

const status = (p) => (p >= 100 ? { cls: 'done', text: 'منجزة' } : p > 0 ? { cls: 'live', text: 'قيد التنفيذ' } : { cls: 'prep', text: 'إعداد وتجهيز' });

function Progress({ value }) {
  const s = status(value);
  return (
    <span className={`rt-bar rt-bar--${s.cls}`}>
      <span className="rt-bar__fill" style={{ width: `${Math.min(100, value)}%` }} />
    </span>
  );
}

/* ---------------- نظرة عامة ---------------- */

function Overview({ t, phases, go }) {
  return (
    <>
      <section className="hero">
        <div className="hero__primary">
          <span className="hero__eyebrow"><Icon name="area" /> إجمالي الأنقاض المخطط ترحيلها</span>
          <Figure value={t.planned} className="hero__figure" />
          <span className="hero__sub">متر مكعب في {fmt(t.govs)} محافظات و{fmt(t.regions)} منطقة، ضمن ثلاث مراحل تنفيذية</span>
        </div>
        <div className="hero__side">
          <Stat icon="target" tone="forest" label="المنفَّذ فعلياً" value={t.executed} unit="م³"
            note={`${pct(t.executed, t.planned)}% من المخطط`} share={pct(t.executed, t.planned)} />
          <Stat icon="clock" tone="gold" label="المتبقي للترحيل" value={Math.max(0, t.planned - t.executed)} unit="م³"
            note="الكميات غير المنجزة بعد" share={100 - pct(t.executed, t.planned)} />
          <Stat icon="t_integer" tone="teal" label="استبيانات ميدانية موثّقة" value={t.surveys} unit="استبيان"
            note={`${fmt(t.surveyVol)} م³ موثّقة ميدانياً${t.live ? `، منها ${fmt(t.live)} من استبيان المنصة` : ''}`} share={100} />
        </div>
      </section>

      <div className="rt-intro">
        <div className="rt-intro__text">
          <span className="rt-kicker">الإطار التنفيذي للمشروع</span>
          <h2>إدارة وترحيل الأنقاض لدعم التعافي وإعادة الإعمار</h2>
          <p>تهدف الخطة الوطنية لإدارة وترحيل الأنقاض إلى إزالة الركام وفتح الطرق والشرايين الحيوية في المناطق السكنية والخدمية المتضررة، تمهيداً لإعادة تأهيل البنية التحتية وتسهيل العودة الكريمة والآمنة للسكان.</p>
          <p>تعتمد المنظومة على رقابة ميدانية عبر استبيانات KoBoToolbox الرقمية لتوثيق كل موقع وكمية، مع نقل الأنقاض إلى مكبات معتمدة تمهيداً لفرزها وإعادة تدويرها هندسياً.</p>
          <div className="rt-intro__actions">
            <button type="button" className="rt-btn rt-btn--primary" onClick={() => go('govs')}>موقف المحافظات والمراحل</button>
            <button type="button" className="rt-btn" onClick={() => go('spatial')}>الخريطة والتوزيع الجغرافي</button>
          </div>
        </div>
        <aside className="rt-goals">
          <h3><Icon name="target" /> الأهداف الرئيسية</h3>
          <ul>
            <li>فتح الطرق الرئيسية والفرعية وإزالة عوائق الحركة</li>
            <li>ترحيل أنقاض المنشآت العامة والمدارس والمرافق الخدمية</li>
            <li>التوثيق الرقمي الجغرافي الدقيق لمواقع العمل</li>
            <li>نقل الأنقاض إلى المكبات المعتمدة وتهذيبها هندسياً</li>
            <li>سحق الخرسانة وإعادة تدويرها (RCA) لرصف الطرق والردم</li>
            <li>دعم جهود التعافي المبكر وتمكين المجتمعات المحلية</li>
          </ul>
        </aside>
      </div>

      <div className="rt-sechead">
        <span className="rt-kicker">حالة المراحل التنفيذية</span>
        <h2>خطة المراحل الثلاث لترحيل الأنقاض (2026)</h2>
      </div>
      <div className="rt-phases">
        {phases.map((p) => {
          const s = status(p.rate);
          return (
            <article className={`rt-phase rt-phase--${s.cls}`} key={p.key}>
              <header>
                <h3>{p.title}</h3>
                <span className={`rt-badge rt-badge--${s.cls}`}>{s.text} ({p.rate}%)</span>
              </header>
              <p>{p.scope}</p>
              <dl>
                <div><dt>المخطط</dt><dd>{fmt(p.planned)} م³</dd></div>
                <div><dt>المنفَّذ</dt><dd className="is-strong">{fmt(p.executed)} م³</dd></div>
              </dl>
              <Progress value={p.rate} />
              <span className="rt-phase__meta">{p.govs.join('، ')} — {fmt(p.regions)} منطقة</span>
            </article>
          );
        })}
      </div>
    </>
  );
}

/* ---------------- المحافظات ---------------- */

function Governorates({ govs }) {
  const [open, setOpen] = useState(null);
  return (
    <div className="rt-govs">
      {govs.map((g) => {
        const s = status(g.rate);
        const isOpen = open === g.key;
        return (
          <article className="rt-gov" key={g.key}>
            <header>
              <h3><Icon name="t_governorate" /> محافظة {g.name}</h3>
              <span className={`rt-badge rt-badge--${s.cls}`}>{g.rate >= 100 ? 'مكتملة' : g.executed > 0 ? `جاري العمل ${g.rate}%` : 'إعداد المناقصات'}</span>
            </header>
            <Progress value={g.rate} />
            <dl className="rt-gov__stats">
              <div><dt>المخطط</dt><dd>{fmt(g.planned)} م³</dd></div>
              <div><dt>المنفَّذ</dt><dd className="is-strong">{fmt(g.executed)} م³</dd></div>
              <div><dt>المتبقي</dt><dd>{fmt(Math.max(0, g.planned - g.executed))} م³</dd></div>
              <div><dt>الإنجاز</dt><dd className="is-gold">{g.rate}%</dd></div>
            </dl>
            <button type="button" className="rt-toggle" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : g.key)}>
              {isOpen ? 'إخفاء' : 'عرض'} تفاصيل المناطق والمراحل ({g.regions.length})
            </button>
            {isOpen && (
              <div className="rt-tablewrap">
                <table className="rt-table">
                  <thead><tr><th>المرحلة</th><th>المنطقة</th><th>المخطط م³</th><th>المنفَّذ م³</th><th>الإنجاز</th><th>الحالة والملاحظات</th></tr></thead>
                  <tbody>
                    {g.regions.map((r, i) => (
                      <tr key={i}>
                        <td>{r.phase}</td>
                        <td><b>{r.region}</b></td>
                        <td className="num">{fmt(r.planned)}</td>
                        <td className="num is-strong">{fmt(r.executed)}</td>
                        <td className="num">{pct(r.executed, r.planned)}%</td>
                        <td className="rt-note">{r.notes || (r.executed >= r.planned && r.planned ? 'تم الإنجاز' : r.executed ? 'قيد العمل' : '—')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

/* ---------------- التوزيع الجغرافي ---------------- */

function Spatial({ govs, surveys, basemap }) {
  const locations = useMemo(() => {
    const m = new Map();
    for (const s of surveys) {
      if (!s.lat || !s.lon) continue;
      const code = `${s.lat.toFixed(3)},${s.lon.toFixed(3)}`;
      const cur = m.get(code) || { code, name: [s.village || s.town, s.area].filter(Boolean).join(' — '), governorate: govName(s.gov), lat: s.lat, lon: s.lon, count: 0 };
      cur.count += 1;
      m.set(code, cur);
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  }, [surveys]);

  const by = (key, value = () => 1) => {
    const m = new Map();
    for (const s of surveys) { const k = key(s); if (k) m.set(k, (m.get(k) || 0) + value(s)); }
    return [...m.entries()].map(([label, v]) => ({ label, key: label, value: Math.round(v) })).sort((a, b) => b.value - a.value);
  };

  return (
    <div className="panels">
      {basemap && (
        <Panel span="full" title="مواقع العمل الموثّقة ميدانياً" note={`${fmt(locations.length)} موقعاً من ${fmt(surveys.length)} استبياناً`}>
          <SyriaMap basemap={basemap} locations={locations} noun="الاستبيانات" />
        </Panel>
      )}
      <Panel span="wide" title="ترتيب نسب الإنجاز الفعلي بالمحافظات" note="المنفَّذ ÷ المخطط">
        <ul className="rt-rank">
          {[...govs].sort((a, b) => b.rate - a.rate).map((g) => (
            <li key={g.key}>
              <span className="rt-rank__name">{g.name}</span>
              <Progress value={g.rate} />
              <span className="rt-rank__val">{g.rate}%</span>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="مسافات النقل إلى المكبات" note="عدد الاستبيانات">
        <Donut data={by((s) => s.dist && s.dist.replace('كم', ' كم'))} tone="gold" caption="استبيان" />
      </Panel>
      <Panel span="wide" title="الكميات الموثّقة ميدانياً حسب المحافظة" note="م³ من الاستبيانات">
        <BarChart data={by((s) => govName(s.gov), (s) => s.vol)} tone="forest" showShare />
      </Panel>
      <Panel title="طبيعة مواقع العمل" note="عدد الاستبيانات">
        <Donut data={by((s) => s.nature)} tone="teal" caption="استبيان" />
      </Panel>
      <Panel span="wide" title="أكثر المناطق نشاطاً" note="م³ موثّقة ميدانياً">
        <BarChart data={by((s) => s.area && `${s.area} (${govName(s.gov)})`, (s) => s.vol)} tone="teal" max={10} showShare />
      </Panel>
      <Panel title="جهة ترحيل الأنقاض" note="عدد الاستبيانات">
        <Donut data={by((s) => s.dump.replace(/\s+/g, ' '))} tone="forest" caption="استبيان" />
      </Panel>
    </div>
  );
}

/* ---------------- الاستبيانات ---------------- */

const PAGE = 25;
const projLabel = (s) => `المشروع ${['', 'الأول', 'الثاني', 'الثالث'][s.p] || ''}`;

function Surveys({ surveys }) {
  const [f, setF] = useState({ gov: [], p: [], nature: [], q: '' });
  const [page, setPage] = useState(1);
  const [view, setView] = useState(null);

  const opts = (key) => {
    const m = new Map();
    for (const s of surveys) { const k = key(s); if (k) m.set(k, (m.get(k) || 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([v, n]) => ({ value: v, label: v, count: n }));
  };
  const list = useMemo(() => {
    const q = norm(f.q);
    return surveys.filter((s) => (!f.gov.length || f.gov.includes(govName(s.gov)))
      && (!f.p.length || f.p.includes(projLabel(s)))
      && (!f.nature.length || f.nature.includes(s.nature))
      && (!q || norm([s.co, s.by, s.area, s.town, s.village, s.addr, s.id].join(' ')).includes(q)));
  }, [surveys, f]);
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const rows = list.slice((page - 1) * PAGE, page * PAGE);
  const set = (k) => (v) => { setF((x) => ({ ...x, [k]: v })); setPage(1); };
  const vol = list.reduce((a, s) => a + s.vol, 0);
  const dirty = f.gov.length || f.p.length || f.nature.length || f.q;

  return (
    <>
      <div className="filters">
        <div className="filters__fields rt-sfilters">
          <div className="ffield"><span className="ffield__label">المحافظة</span>
            <Dropdown multi placeholder="كل المحافظات" value={f.gov} onChange={set('gov')} options={opts((s) => govName(s.gov))} /></div>
          <div className="ffield"><span className="ffield__label">المشروع الميداني</span>
            <Dropdown multi placeholder="كل المشاريع" value={f.p} onChange={set('p')} options={opts((s) => projLabel(s))} /></div>
          <div className="ffield"><span className="ffield__label">طبيعة الموقع</span>
            <Dropdown multi placeholder="كل المواقع" value={f.nature} onChange={set('nature')} options={opts((s) => s.nature)} /></div>
          <label className="ffield"><span className="ffield__label">بحث سريع</span>
            <input className="rt-search" type="search" value={f.q} placeholder="الجهة، مدلي البيانات، القرية، رقم الاستبيان…"
              onChange={(e) => set('q')(e.target.value)} /></label>
        </div>
      </div>

      <div className="rt-tablehead">
        <h3>الاستبيانات الميدانية المرفوعة (KoBoToolbox)</h3>
        <span><b>{fmt(list.length)}</b> من {fmt(surveys.length)} استبياناً — <b>{fmt(vol)}</b> م³
          {dirty ? <button type="button" className="filters__reset" onClick={() => { setF({ gov: [], p: [], nature: [], q: '' }); setPage(1); }}>إزالة المرشّحات</button> : null}</span>
      </div>

      <div className="rt-tablewrap rt-tablewrap--card">
        <table className="rt-table rt-table--click">
          <thead><tr><th>#</th><th>المشروع</th><th>المحافظة</th><th>المنطقة / البلدة</th><th>طبيعة الموقع</th><th>الكمية م³</th><th>الجهة المنفذة</th><th>جهة الترحيل</th><th>التاريخ</th></tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={`${s.p}-${s.id}`} onClick={() => setView(s)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setView(s)}>
                <td className="num">{s.id}</td>
                <td><span className={`rt-badge rt-badge--p${s.p}`}>{projLabel(s)}</span></td>
                <td><b>{govName(s.gov)}</b></td>
                <td>{[s.area, s.town, s.village].filter(Boolean).join(' — ')}</td>
                <td>{s.nature}</td>
                <td className="num is-strong">{fmt(s.vol)}</td>
                <td>{s.co}</td>
                <td className="rt-note">{s.dump.replace(/\s+/g, ' ')}</td>
                <td className="num">{s.date}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={9} className="rt-empty">لا توجد استبيانات بهذه المرشّحات</td></tr>}
          </tbody>
        </table>
      </div>

      <nav className="rt-pager" aria-label="الصفحات">
        <span>عرض {fmt(list.length ? (page - 1) * PAGE + 1 : 0)}–{fmt(Math.min(page * PAGE, list.length))} من {fmt(list.length)}</span>
        <div>
          <button type="button" disabled={page === 1} onClick={() => setPage(1)}>«</button>
          <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>‹</button>
          {Array.from({ length: pages }, (_, i) => i + 1).filter((n) => Math.abs(n - page) <= 2).map((n) => (
            <button type="button" key={n} className={n === page ? 'is-on' : ''} onClick={() => setPage(n)}>{n}</button>
          ))}
          <button type="button" disabled={page === pages} onClick={() => setPage(page + 1)}>›</button>
          <button type="button" disabled={page === pages} onClick={() => setPage(pages)}>»</button>
        </div>
      </nav>

      {view && <SurveyModal s={view} onClose={() => setView(null)} />}
    </>
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

/* ---------------- الجهات المنفذة ---------------- */

function Contractors({ surveys }) {
  const list = useMemo(() => {
    const m = new Map();
    for (const s of surveys) {
      const k = coKey(s.co) || 'غير محدد';
      const cur = m.get(k) || { names: new Map(), count: 0, vol: 0, hours: 0, govs: new Set() };
      cur.names.set(s.co, (cur.names.get(s.co) || 0) + 1);
      cur.count += 1; cur.vol += s.vol; cur.hours += s.hours || 0; cur.govs.add(govName(s.gov));
      m.set(k, cur);
    }
    return [...m.values()].map((c) => ({ ...c, name: [...c.names.entries()].sort((a, b) => b[1] - a[1])[0][0] }))
      .sort((a, b) => b.vol - a.vol);
  }, [surveys]);
  const top = list[0]?.vol || 1;
  const total = list.reduce((a, c) => a + c.vol, 0) || 1;

  return (
    <>
      <div className="rt-podium">
        {list.slice(0, 3).map((c, i) => (
          <article key={c.name} className={`rt-podium__item rt-podium__item--${i + 1}`}>
            <span className="rt-podium__rank">{i + 1}</span>
            <h3>{c.name}</h3>
            <Figure value={Math.round(c.vol)} className="rt-podium__fig" />
            <span>م³ — {fmt(c.count)} موقعاً — {pct(c.vol, total)}% من الإجمالي</span>
          </article>
        ))}
      </div>
      <div className="rt-tablewrap rt-tablewrap--card">
        <table className="rt-table">
          <thead><tr><th>#</th><th>الجهة المنفذة</th><th>المحافظات</th><th>المواقع</th><th>الأنقاض المرحّلة م³</th><th>الحصة</th><th>ساعات الآليات</th></tr></thead>
          <tbody>
            {list.map((c, i) => (
              <tr key={c.name}>
                <td className="num">{i + 1}</td>
                <td><b>{c.name}</b>{c.names.size > 1 && <span className="rt-alias" title={[...c.names.keys()].join('، ')}> +{c.names.size - 1} تسمية</span>}</td>
                <td className="rt-note">{[...c.govs].join('، ')}</td>
                <td><span className="rt-badge rt-badge--done">{fmt(c.count)} موقع</span></td>
                <td className="num is-strong">{fmt(c.vol)}</td>
                <td className="rt-sharecell"><span className="rt-share"><span style={{ width: `${(c.vol / top) * 100}%` }} /></span>{pct(c.vol, total)}%</td>
                <td className="num">{c.hours ? `${fmt(c.hours)} ساعة` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="rt-foot">دُمجت تسميات الجهة الواحدة المكتوبة بأكثر من صيغة (مثل «شركة الفاتح» و«شركة الفاتح للإنشاءات»). مرّر المؤشر على «+ تسمية» لرؤيتها.</p>
    </>
  );
}

/* ---------------- تدوير الخرسانة ---------------- */

function Recycling({ executed }) {
  const [rate, setRate] = useState(65);
  const [price, setPrice] = useState(14);
  const yieldM3 = Math.round(executed * (rate / 100));
  return (
    <div className="rt-rca">
      <div className="rt-rca__text">
        <span className="rt-kicker">الاقتصاد الدائري وإعادة الإعمار</span>
        <h2>حاسبة تدوير الخرسانة والأنقاض (RCA)</h2>
        <p>تعتمد المنظومة تقنيات فرز وسحق الأنقاض الميدانية لإنتاج ركام خرساني معاد تدويره (Recycled Concrete Aggregate) لاستخدامه في رصف الطرق والردم الهندسي وتصنيع البلوك، بما يحقق وفراً مالياً ويحمي المقالع الطبيعية.</p>
        <label className="rt-slider">
          <span>نسبة استرجاع الركام الخرساني <b>{rate}%</b></span>
          <input type="range" min="30" max="90" value={rate} onChange={(e) => setRate(Number(e.target.value))} />
        </label>
        <label className="rt-slider">
          <span>سعر المتر المكعب البديل من المقالع <b>${price} / م³</b></span>
          <input type="range" min="5" max="30" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
        </label>
        <p className="rt-foot">الحساب على الكمية المنفَّذة فعلياً: {fmt(executed)} م³.</p>
      </div>
      <aside className="rt-rca__out">
        <h3>المردود الاقتصادي والبيئي المقدّر</h3>
        <div><span>الركام المستخلص</span><b>{fmt(yieldM3)} م³</b></div>
        <div><span>الوفورات المالية المقدّرة</span><b className="is-gold">${fmt(yieldM3 * price)}</b></div>
        <div><span>خفض الانبعاثات الكربونية</span><b>~{fmt(yieldM3 * 0.012)} طن CO₂</b></div>
      </aside>
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
  const [tab, setTab] = useState('overview');

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
    const phases = PHASES.map((p) => {
      const rs = data.phases.filter((r) => r.phase === p.key);
      const planned = rs.reduce((a, r) => a + r.planned, 0);
      const executed = rs.reduce((a, r) => a + r.executed, 0);
      return { ...p, planned, executed, rate: pct(executed, planned), regions: rs.length,
        govs: [...new Set(rs.map((r) => r.gov.trim()))] };
    });
    const t = {
      planned: data.phases.reduce((a, r) => a + r.planned, 0),
      executed: Math.round(data.phases.reduce((a, r) => a + r.executed, 0)),
      surveys: data.surveys.length,
      live: data.live || 0,
      surveyVol: data.surveys.reduce((a, s) => a + s.vol, 0),
      govs: govs.length,
      regions: data.phases.filter((r) => r.planned > 0).length,
    };
    return { govs, phases, t };
  }, [data]);

  if (error) return <div className="pending"><h3>تعذّر تحميل بيانات المشروع</h3><p>حدّث الصفحة وحاول مجدداً.</p></div>;
  if (!model) return <p className="results__empty">جارٍ التحميل…</p>;

  const go = (id) => { setTab(id); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  return (
    <div className="rt">
      <div className="rt-tabsbar">
        <div className="pedit__seg" role="tablist">
          {TABS.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={tab === x.id}
              className={`pedit__tab${tab === x.id ? ' is-on' : ''}`} onClick={() => go(x.id)}>
              {x.label}
              {x.id === 'surveys' && <span className="pedit__count">{fmt(model.t.surveys)}</span>}
              {x.id === 'govs' && <span className="pedit__count">{model.govs.length}</span>}
            </button>
          ))}
        </div>
        <button type="button" className="rt-btn rt-print" onClick={() => window.print()}>طباعة</button>
      </div>

      {tab === 'overview' && <Overview t={model.t} phases={model.phases} go={go} />}
      {tab === 'govs' && <Governorates govs={model.govs} />}
      {tab === 'spatial' && <Spatial govs={model.govs} surveys={data.surveys} basemap={basemap} />}
      {tab === 'surveys' && <Surveys surveys={data.surveys} />}
      {tab === 'contractors' && <Contractors surveys={data.surveys} />}
      {tab === 'rca' && <Recycling executed={model.t.executed} />}
    </div>
  );
}

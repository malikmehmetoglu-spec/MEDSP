import { useEffect, useMemo, useState } from 'react';
import Dropdown from '../components/Dropdown';
import { rubblePhotos } from './store';

/*
  الأرشيف المصور الوطني لأعمال الأنقاض:
  صور كل موقع عمل (قبل / أثناء / بعد) من KoBo والاستمارة الرسمية،
  وصور المشاريع وروابط مجلداتها من قالب دورة إدارة الأنقاض.
*/
const PHASES = [['before', 'قبل التنفيذ', '#b3261e'], ['during', 'أثناء التنفيذ', '#d4a443'], ['after', 'بعد الإنجاز', '#2f9e74']];
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
const KIND = { assessment: 'تقدير', planned: 'مخطط', study: 'قيد الدراسة', recycling: 'تدوير', investment: 'استثمار' };

/* قيمة سؤال صورة: نص (رابط أو data URL) أو مصفوفة أو كائن */
export const toUrls = (v) => {
  if (!v) return [];
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flatMap(toUrls);
  return toUrls(v.url || v.dataUrl || v.data || v.src);
};

/* توحيد مواقع العمل والمشاريع في شكل واحد للأرشيف */
export function archiveItems(surveys, pipe) {
  const sites = surveys.map((s) => ({
    key: `s-${s.id}`, source: s.live ? 'form' : 'kobo', title: s.addr || s.village || s.town || s.area || 'موقع عمل',
    gov: s.gov, area: s.area, town: s.town, co: s.co, date: s.date, vol: s.vol, rid: s.rid, live: s.live,
    phase: s.p ? `المرحلة ${s.p}` : '',
    photos: s.live ? null : [toUrls(s.photos?.[0]), toUrls(s.photos?.[1]), toUrls(s.photos?.[2])],
    hasPhotos: s.live ? s.hasPhotos : (s.photos || []).some(Boolean),
  }));
  const projects = (pipe || []).map((x) => ({
    key: `p-${x.id}`, source: 'project', title: x.name, gov: x.gov, area: x.area, town: x.town, co: x.partner,
    date: x.start, vol: x.volume, phase: KIND[x.stage] || '', folder: x.folder,
    photos: x.photos || [[], [], []], hasPhotos: (x.photos || []).some((p) => p.length) || Boolean(x.folder),
  }));
  return [...projects, ...sites].filter((x) => x.hasPhotos);
}

function Img({ url, label }) {
  const [bad, setBad] = useState(false);
  if (bad) {
    return <a className="gal-img is-bad" href={url} target="_blank" rel="noreferrer">فتح الصورة<small>{label}</small></a>;
  }
  return (
    <a className="gal-img" href={url} target="_blank" rel="noreferrer">
      <img src={url} alt={label} loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} />
      <small>{label}</small>
    </a>
  );
}

function Card({ x, onOpen }) {
  const cover = x.photos && (x.photos[2][0] || x.photos[0][0] || x.photos[1][0]);
  return (
    <button type="button" className="gal-card" onClick={() => onOpen(x)}>
      <div className="gal-card__cover">
        {cover ? <img src={cover} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          : null}
        <span className="gal-card__ph">📷</span>
        <span className={`gal-card__src is-${x.source}`}>{x.source === 'project' ? 'مشروع' : x.source === 'form' ? 'الاستمارة الرسمية' : 'KoBo'}</span>
      </div>
      <div className="gal-card__body">
        <b>{x.title}</b>
        <small>{[x.gov, x.area, x.town].filter(Boolean).join(' · ')}</small>
        <small>{[x.phase, x.co, x.vol ? `${fmt(x.vol)} م³` : ''].filter(Boolean).join(' · ')}</small>
        {x.photos && (
          <span className="gal-card__dots">
            {PHASES.map(([k, l, c], i) => <i key={k} title={l} style={{ background: x.photos[i].length ? c : 'transparent', borderColor: c }} />)}
          </span>
        )}
      </div>
    </button>
  );
}

function Viewer({ x, onClose }) {
  const [photos, setPhotos] = useState(x.photos);
  useEffect(() => {
    if (x.live && !photos && x.rid) rubblePhotos(x.rid).then((p) => setPhotos(PHASES.map((_, i) => toUrls(p?.[i])))).catch(() => setPhotos([[], [], []]));
  }, [x, photos]);
  return (
    <div className="gal-view" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="gal-view__box" onClick={(e) => e.stopPropagation()}>
        <header>
          <div><h3>{x.title}</h3><p>{[x.gov, x.area, x.town, x.date].filter(Boolean).join(' · ')}</p></div>
          <button type="button" onClick={onClose} aria-label="إغلاق">✕</button>
        </header>
        {x.folder && <a className="tpl__btn gal-view__folder" href={x.folder} target="_blank" rel="noreferrer">فتح مجلد الصور والوثائق</a>}
        {!photos ? <p className="gal-note">جارٍ تحميل الصور…</p> : (
          <div className="gal-view__cols">
            {PHASES.map(([k, l, c], i) => (
              <section key={k} style={{ '--c': c }}>
                <h4>{l}</h4>
                {photos[i].length ? photos[i].map((u) => <Img key={u.slice(0, 80) + u.length} url={u} label={l} />) : <p className="gal-note">لا توجد صورة</p>}
              </section>
            ))}
          </div>
        )}
        <p className="gal-note">صور KoBo تُعرض من خادم الوزارة؛ إن لم تظهر فسجّل الدخول إلى KoBo ثم اضغط «فتح الصورة».</p>
      </div>
    </div>
  );
}

export default function RubbleGallery({ surveys, pipe }) {
  const all = useMemo(() => archiveItems(surveys, pipe), [surveys, pipe]);
  const [govs, setGovs] = useState([]);
  const [srcs, setSrcs] = useState([]);
  const [cos, setCos] = useState([]);
  const [after, setAfter] = useState(false);
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(24);
  const [open, setOpen] = useState(null);

  const list = all.filter((x) => (!govs.length || govs.includes(x.gov)) && (!srcs.length || srcs.includes(x.source))
    && (!cos.length || cos.includes(x.co)) && (!after || (x.photos ? x.photos[0].length && x.photos[2].length : true))
    && (!q || `${x.title} ${x.area} ${x.town}`.includes(q)));
  const opts = (k) => [...new Set(all.map((x) => x[k]).filter(Boolean))].sort().map((v) => ({ value: v, label: v }));
  const nPhotos = all.reduce((a, x) => a + (x.photos ? x.photos.flat().length : 3), 0);

  return (
    <div className="gal">
      <div className="hub-kpis" style={{ '--c': '#4f8fdc' }}>
        <div><span>مواقع ومشاريع موثّقة</span><b>{fmt(all.length)}</b></div>
        <div><span>صور في الأرشيف</span><b>{fmt(nPhotos)}</b></div>
        <div><span>محافظات</span><b>{fmt(new Set(all.map((x) => x.gov).filter(Boolean)).size)}</b></div>
      </div>
      <div className="filters gal-filters">
        <div className="filters__fields" style={{ '--n': 4 }}>
          <div className="ffield"><span className="ffield__label">المحافظة</span>
            <Dropdown multi label="المحافظة" placeholder="الكل" value={govs} onChange={setGovs} options={opts('gov')} /></div>
          <div className="ffield"><span className="ffield__label">المصدر</span>
            <Dropdown multi label="المصدر" placeholder="الكل" value={srcs} onChange={setSrcs}
              options={[['project', 'المشاريع'], ['form', 'الاستمارة الرسمية'], ['kobo', 'KoBo']].map(([value, label]) => ({ value, label }))} /></div>
          <div className="ffield"><span className="ffield__label">الجهة المنفذة</span>
            <Dropdown multi label="الجهة" placeholder="الكل" value={cos} onChange={setCos} options={opts('co')} /></div>
          <div className="ffield"><span className="ffield__label">بحث</span>
            <input className="q-input gal-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="اسم الموقع أو المنطقة" /></div>
        </div>
      </div>
      <label className="gal-toggle"><input type="checkbox" checked={after} onChange={(e) => setAfter(e.target.checked)} /> مقارنة قبل/بعد فقط</label>

      {list.length ? (
        <div className="gal-grid">{list.slice(0, limit).map((x) => <Card key={x.key} x={x} onOpen={setOpen} />)}</div>
      ) : <div className="hub-empty"><p>لا توجد صور مطابقة.</p></div>}
      {list.length > limit && <button type="button" className="gal-more" onClick={() => setLimit((n) => n + 48)}>عرض المزيد ({fmt(list.length - limit)})</button>}
      {open && <Viewer x={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';

/*
  منتقي المناطق الإدارية — كله قوائم منسدلة، بلا أي إدخال يدوي:
    level 'governorate' : المحافظة فقط
    (افتراضي)           : المحافظة ← المنطقة ← الناحية
    level 'community'   : المحافظة ← المنطقة ← الناحية ← القرية/البلدة

  الرموز رسمية (SY02 / SY0202 / SY020206 / C1234) من نفس مصدر خرائط المنصة،
  وتُحفظ معها الأسماء (names) لتقرأها التقارير مباشرة.
*/

let cache = null;
let inflight = null;

const byName = (a, b) => a.name.localeCompare(b.name, 'ar');

function loadAreas() {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  const get = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error('تعذّر تحميل بيانات المناطق'); return r.json(); });
  inflight = Promise.all([get('data/basemap.json'), get('data/admin-areas.json').catch(() => null)])
    .then(([b, t]) => {
      const rows = (l) => (l || []).map(([code, name, parent]) => ({ code, name, parent }));
      cache = {
        governorates: (b.governorates || []).map(({ code, name }) => ({ code, name })).sort(byName),
        districts: rows(t?.districts),
        /* بلا الشجرة: النواحي من الخريطة وأبوها المحافظة */
        subdistricts: t ? rows(t.subdistricts) : (b.subdistricts || []).map(({ code, name, parent }) => ({ code, name, parent })),
        communities: rows(t?.communities),
        tree: Boolean(t),
      };
      return cache;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

function Select({ label, value, options, placeholder, disabled, onChange, onBlur, invalid, hide }) {
  if (hide) return null;
  return (
    <label className="q-area__part">
      {label && <span className="q-area__label">{label}</span>}
      <select className="q-input q-input--select" value={value || ''} disabled={disabled}
        aria-invalid={invalid || undefined} onChange={(e) => onChange(e.target.value)} onBlur={onBlur}>
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}
      </select>
    </label>
  );
}

export default function AdminAreaPicker({ node, value, onChange, onBlur, invalid }) {
  const govOnly = node?.level === 'governorate';
  const withCommunity = node?.level === 'community';
  const [areas, setAreas] = useState(cache);
  const [status, setStatus] = useState(cache ? 'ready' : 'loading');

  useEffect(() => {
    if (cache) return;
    let alive = true;
    loadAreas()
      .then((d) => { if (alive) { setAreas(d); setStatus('ready'); } })
      .catch(() => { if (alive) setStatus('error'); });
    return () => { alive = false; };
  }, []);

  const cur = value || { governorate: '', subdistrict: '' };
  const tree = areas?.tree;
  /* إجابة قديمة بلا منطقة: تُستنتج المنطقة من رمز الناحية (SY020206 ← SY0202) */
  const district = cur.district || (tree && cur.subdistrict ? cur.subdistrict.slice(0, 6) : '');

  const kids = (list, parent) => (list || []).filter((x) => x.parent === parent).sort(byName);
  const dists = useMemo(() => (tree && cur.governorate ? kids(areas.districts, cur.governorate) : []), [areas, cur.governorate]); // eslint-disable-line react-hooks/exhaustive-deps
  const subs = useMemo(() => {
    if (!areas || !cur.governorate) return [];
    return tree ? (district ? kids(areas.subdistricts, district) : []) : kids(areas.subdistricts, cur.governorate);
  }, [areas, cur.governorate, district]); // eslint-disable-line react-hooks/exhaustive-deps
  const comms = useMemo(() => (withCommunity && cur.subdistrict ? kids(areas?.communities, cur.subdistrict) : []), [areas, cur.subdistrict, withCommunity]); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === 'loading') return <p className="q-hint">جارٍ تحميل المناطق…</p>;
  if (status === 'error') return <p className="q-error">تعذّر تحميل بيانات المناطق. حدّث الصفحة وحاول مجدداً.</p>;

  const nameOf = (list, code) => list.find((x) => x.code === code)?.name || '';
  const emit = (next) => onChange({
    ...next,
    names: {
      governorate: nameOf(areas.governorates, next.governorate),
      district: nameOf(areas.districts, next.district),
      subdistrict: nameOf(areas.subdistricts, next.subdistrict),
      community: nameOf(areas.communities, next.community),
    },
  });

  const common = { onBlur, invalid };
  const n = 1 + (govOnly ? 0 : (tree ? 2 : 1)) + (withCommunity && tree ? 1 : 0);

  return (
    <div className={`q-area${govOnly ? ' q-area--single' : ''}`} style={{ '--n': n }}>
      <Select {...common} label={govOnly ? '' : 'المحافظة'} value={cur.governorate} options={areas.governorates} placeholder="اختر المحافظة"
        onChange={(v) => emit({ governorate: v, district: '', subdistrict: '', community: '' })} />
      <Select {...common} hide={govOnly || !tree} label="المنطقة" value={district} options={dists}
        disabled={!cur.governorate} placeholder={cur.governorate ? 'اختر المنطقة' : 'اختر المحافظة أولاً'}
        onChange={(v) => emit({ governorate: cur.governorate, district: v, subdistrict: '', community: '' })} />
      <Select {...common} hide={govOnly} label="الناحية" value={cur.subdistrict} options={subs}
        disabled={tree ? !district : !cur.governorate} placeholder={(tree ? district : cur.governorate) ? 'اختر الناحية' : (tree ? 'اختر المنطقة أولاً' : 'اختر المحافظة أولاً')}
        onChange={(v) => emit({ governorate: cur.governorate, district, subdistrict: v, community: '' })} />
      <Select {...common} hide={!withCommunity || !tree} label="القرية / البلدة" value={cur.community} options={comms}
        disabled={!cur.subdistrict} placeholder={cur.subdistrict ? 'اختر القرية أو البلدة' : 'اختر الناحية أولاً'}
        onChange={(v) => emit({ governorate: cur.governorate, district, subdistrict: cur.subdistrict, community: v })} />
    </div>
  );
}

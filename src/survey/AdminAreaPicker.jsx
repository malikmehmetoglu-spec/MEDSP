import { useEffect, useMemo, useState } from 'react';

/*
  منتقي المحافظة ← الناحية.

  يقرأ من نفس basemap.json الذي تستخدمه خريطة التقارير، فالإجابات
  تحمل رموز المناطق الرسمية (SY02، SY020206) وتظهر على الخريطة
  تلقائياً بلا أي مطابقة لاحقة.
*/

let cache = null;
let inflight = null;

function loadAreas() {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = fetch('data/basemap.json')
    .then((r) => {
      if (!r.ok) throw new Error('تعذّر تحميل بيانات المناطق');
      return r.json();
    })
    .then((d) => {
      cache = {
        governorates: (d.governorates || [])
          .map(({ code, name }) => ({ code, name }))
          .sort((a, b) => a.name.localeCompare(b.name, 'ar')),
        subdistricts: (d.subdistricts || [])
          .map(({ code, name, parent }) => ({ code, name, parent })),
      };
      return cache;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

export default function AdminAreaPicker({ value, onChange, onBlur, invalid }) {
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

  const current = value || { governorate: '', subdistrict: '' };

  const subs = useMemo(() => {
    if (!areas || !current.governorate) return [];
    return areas.subdistricts
      .filter((s) => s.parent === current.governorate)
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }, [areas, current.governorate]);

  if (status === 'loading') {
    return <p className="q-hint">جارٍ تحميل المناطق…</p>;
  }
  if (status === 'error') {
    return <p className="q-error">تعذّر تحميل بيانات المناطق. حدّث الصفحة وحاول مجدداً.</p>;
  }

  return (
    <div className="q-area">
      <label className="q-area__part">
        <span className="q-area__label">المحافظة</span>
        <select
          className="q-input q-input--select"
          value={current.governorate}
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange({ governorate: e.target.value, subdistrict: '' })}
          onBlur={onBlur}
        >
          <option value="">اختر المحافظة</option>
          {areas.governorates.map((g) => (
            <option key={g.code} value={g.code}>{g.name}</option>
          ))}
        </select>
      </label>

      <label className="q-area__part">
        <span className="q-area__label">الناحية</span>
        <select
          className="q-input q-input--select"
          value={current.subdistrict}
          disabled={!current.governorate}
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange({ ...current, subdistrict: e.target.value })}
          onBlur={onBlur}
        >
          <option value="">
            {current.governorate ? 'اختر الناحية' : 'اختر المحافظة أولاً'}
          </option>
          {subs.map((s) => (
            <option key={s.code} value={s.code}>{s.name}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

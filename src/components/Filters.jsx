import Dropdown from './Dropdown';

/* التسلسل الجغرافي: كل مستوى يتقلص بحسب ما فوقه */
const GEO_LEVELS = [
  { key: 'gov', label: 'المحافظة', all: 'كل المحافظات' },
  { key: 'area', label: 'المنطقة', all: 'كل المناطق' },
  { key: 'sub', label: 'الناحية', all: 'كل النواحي' },
];

/*
  شريط المرشّحات: الفترة الزمنية + المديرية + المركز،
  ومرشّحات إضافية يحدّدها كل تقرير (extra).
  كلها تعمل معاً، وتظهر أسفلها المرشّحات النشطة مع إمكانية إزالتها.
*/

const shift = (day, back) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
};

export default function Filters({
  bounds,
  range,
  onRange,
  directorates,
  centers,
  directorate,
  center,
  onDirectorate,
  onCenter,
  onReset,
  extra = [],
  onExtra,
  geo = null,
  onGeo,
  geoOptions = null,
}) {
  const presets = [
    { id: 'all', name: 'كامل الفترة', from: bounds.from, to: bounds.to },
    { id: '7', name: 'آخر 7 أيام', from: shift(bounds.to, 6), to: bounds.to },
    { id: '14', name: 'آخر 14 يوماً', from: shift(bounds.to, 13), to: bounds.to },
    { id: '30', name: 'آخر 30 يوماً', from: shift(bounds.to, 29), to: bounds.to },
  ];

  const activePreset = presets.find((p) => p.from === range.from && p.to === range.to);
  const isFullRange = range.from === bounds.from && range.to === bounds.to;
  const has = (v) => (Array.isArray(v) ? v.length > 0 : Boolean(v));
  const dirty = !isFullRange || has(directorate) || has(center) || extra.some((f) => has(f.value))
    || (geo && ['gov', 'area', 'sub'].some((k) => has(geo[k])));

  /*
    لا تُصحَّح القيمة أثناء الكتابة — التصحيح الفوري كان يعيد الحقل
    إلى حدّه كلما كتب المستخدم رقماً، فيتعذّر إدخال تاريخ يدوياً.
    التصحيح يجري عند مغادرة الحقل فقط.
  */
  const settle = (next) => {
    let from = next.from || bounds.from;
    let to = next.to || bounds.to;

    if (from < bounds.from) from = bounds.from;
    if (to > bounds.to) to = bounds.to;
    if (from > to) [from, to] = [to, from];

    onRange({ from, to });
  };

  return (
    <div className="filters">
      <div className="filters__row">
        <div className="filters__presets">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="chip"
              aria-pressed={activePreset?.id === preset.id}
              onClick={() => onRange({ from: preset.from, to: preset.to })}
            >
              {preset.name}
            </button>
          ))}
        </div>

        <div className="filters__dates">
          <label>
            <span>من</span>
            <input
              type="date"
              value={range.from ?? ''}
              min={bounds.from}
              max={bounds.to}
              onChange={(e) => onRange({ ...range, from: e.target.value })}
              onBlur={() => settle(range)}
            />
          </label>
          <label>
            <span>إلى</span>
            <input
              type="date"
              value={range.to ?? ''}
              min={bounds.from}
              max={bounds.to}
              onChange={(e) => onRange({ ...range, to: e.target.value })}
              onBlur={() => settle(range)}
            />
          </label>
        </div>

        {dirty && (
          <button type="button" className="filters__reset" onClick={onReset}>
            إزالة المرشّحات
          </button>
        )}
      </div>

      <div className="filters__fields" style={{ '--n': 2 + extra.length + (geo ? 3 : 0) }}>
        {geo && GEO_LEVELS.map((g) => (
          <div className="ffield" key={g.key}>
            <span className="ffield__label">{g.label}</span>
            <Dropdown multi label={g.label} placeholder={g.all} value={geo[g.key]}
              onChange={(v) => onGeo(g.key, v)}
              options={[
                ...geo[g.key].filter((v) => !geoOptions?.[g.key]?.some((o) => o.label === v)).map((v) => ({ value: v, label: v })),
                ...(geoOptions?.[g.key] || []).map((o) => ({ value: o.label, label: o.label, count: o.count })),
              ]} />
          </div>
        ))}
        <div className="ffield">
          <span className="ffield__label">المديرية</span>
          <Dropdown multi label="المديرية" placeholder="كل المديريات" value={directorate}
            onChange={onDirectorate}
            options={directorates.map((name) => ({ value: name, label: name }))} />
        </div>

        <div className="ffield">
          <span className="ffield__label">المركز</span>
          <Dropdown multi label="المركز" placeholder="كل المراكز" value={center}
            onChange={onCenter}
            options={centers.map((name) => ({ value: name, label: name }))} />
        </div>

        {extra.map((f) => (
          <div className="ffield" key={f.dim}>
            <span className="ffield__label">{f.label}</span>
            <Dropdown label={f.label} placeholder={f.all ?? 'الكل'} value={f.value}
              multi
              onChange={(v) => onExtra(f.dim, v)}
              options={[
                /* القيم المختارة تبقى ظاهرة حتى لو اختفت من الخيارات */
                ...[].concat(f.value ?? [])
                  .filter((v) => !f.options.some((o) => o.label === v))
                  .map((v) => ({ value: v, label: v })),
                ...f.options.map((o) => ({ value: o.label, label: o.label, count: o.count })),
              ]} />
          </div>
        ))}
      </div>
    </div>
  );
}

/*
  شريط المرشّحات: الفترة الزمنية + المديرية + المركز.
  كلها تعمل معاً، وتظهر أسفلها المرشّحات النشطة مع إمكانية إزالتها.
*/

const MONTHS = [
  'كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران',
  'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول',
];

const shift = (day, back) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
};

const label = (day) => {
  const d = new Date(`${day}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
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
  count,
}) {
  const presets = [
    { id: 'all', name: 'كامل الفترة', from: bounds.from, to: bounds.to },
    { id: '7', name: 'آخر ٧ أيام', from: shift(bounds.to, 6), to: bounds.to },
    { id: '14', name: 'آخر ١٤ يوماً', from: shift(bounds.to, 13), to: bounds.to },
    { id: '30', name: 'آخر ٣٠ يوماً', from: shift(bounds.to, 29), to: bounds.to },
  ];

  const activePreset = presets.find((p) => p.from === range.from && p.to === range.to);
  const isFullRange = range.from === bounds.from && range.to === bounds.to;
  const dirty = !isFullRange || directorate || center;

  const clampDay = (value) => {
    if (!value) return null;
    if (value < bounds.from) return bounds.from;
    if (value > bounds.to) return bounds.to;
    return value;
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
              max={range.to ?? bounds.to}
              onChange={(e) => onRange({ ...range, from: clampDay(e.target.value) })}
            />
          </label>
          <label>
            <span>إلى</span>
            <input
              type="date"
              value={range.to ?? ''}
              min={range.from ?? bounds.from}
              max={bounds.to}
              onChange={(e) => onRange({ ...range, to: clampDay(e.target.value) })}
            />
          </label>
        </div>
      </div>

      <div className="filters__row filters__row--bottom">
        <label className="select">
          <span>المديرية</span>
          <select
            value={directorate ?? ''}
            onChange={(e) => onDirectorate(e.target.value || null)}
          >
            <option value="">كل المديريات</option>
            {directorates.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>

        <label className="select">
          <span>المركز</span>
          <select value={center ?? ''} onChange={(e) => onCenter(e.target.value || null)}>
            <option value="">كل المراكز</option>
            {centers.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>

        {dirty && (
          <button type="button" className="chip chip--clear" onClick={onReset}>
            إزالة المرشّحات
          </button>
        )}

        <p className="filters__summary">
          {label(range.from)} — {label(range.to)}
          <strong dir="ltr">{count.toLocaleString('en-US')}</strong>
          <span>حريق</span>
        </p>
      </div>
    </div>
  );
}

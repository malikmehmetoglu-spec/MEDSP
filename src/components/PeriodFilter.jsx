/*
  فلتر الفترة الزمنية.
  أزرار سريعة للفترات الشائعة، وحقلا تاريخ لفترة مخصّصة.
  كل تغيير يعيد حساب التقرير في المتصفح فوراً.
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

export default function PeriodFilter({ bounds, range, onChange, count }) {
  const presets = [
    { id: 'all', name: 'كامل الفترة', from: bounds.from, to: bounds.to },
    { id: '7', name: 'آخر ٧ أيام', from: shift(bounds.to, 6), to: bounds.to },
    { id: '14', name: 'آخر ١٤ يوماً', from: shift(bounds.to, 13), to: bounds.to },
    { id: '30', name: 'آخر ٣٠ يوماً', from: shift(bounds.to, 29), to: bounds.to },
  ];

  const active = presets.find((p) => p.from === range.from && p.to === range.to);

  const clampDay = (value) => {
    if (!value) return null;
    if (value < bounds.from) return bounds.from;
    if (value > bounds.to) return bounds.to;
    return value;
  };

  return (
    <div className="period">
      <div className="period__presets">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="period__chip"
            aria-pressed={active?.id === preset.id}
            onClick={() => onChange({ from: preset.from, to: preset.to })}
          >
            {preset.name}
          </button>
        ))}
      </div>

      <div className="period__range">
        <label>
          <span>من</span>
          <input
            type="date"
            value={range.from ?? ''}
            min={bounds.from}
            max={range.to ?? bounds.to}
            onChange={(e) => onChange({ ...range, from: clampDay(e.target.value) })}
          />
        </label>
        <label>
          <span>إلى</span>
          <input
            type="date"
            value={range.to ?? ''}
            min={range.from ?? bounds.from}
            max={bounds.to}
            onChange={(e) => onChange({ ...range, to: clampDay(e.target.value) })}
          />
        </label>
      </div>

      <p className="period__summary">
        {label(range.from)} — {label(range.to)}
        <strong dir="ltr">{count.toLocaleString('en-US')}</strong>
        <span>حريق ضمن الفترة</span>
      </p>
    </div>
  );
}

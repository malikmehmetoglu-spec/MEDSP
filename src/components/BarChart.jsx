/*
  رسم شريطي أفقي مبني بـ CSS.
  اختير على مكتبات الرسم لأن اتجاه النص العربي فيها غير موثوق،
  ولأنه يوفّر نحو ٦٠٠ كيلوبايت من حجم الصفحة.
*/

const ar = (n) => Number(n).toLocaleString('ar-SY');

export default function BarChart({ data, tone = 'forest', max }) {
  const items = max ? data.slice(0, max) : data;
  const peak = items.reduce((m, d) => Math.max(m, d.value), 0) || 1;

  return (
    <ul className={`bars bars--${tone}`}>
      {items.map((item) => (
        <li className="bars__row" key={item.label}>
          <span className="bars__label" title={item.label}>{item.label}</span>
          <span className="bars__track">
            <span className="bars__fill" style={{ width: `${(item.value / peak) * 100}%` }} />
          </span>
          <span className="bars__value">{ar(item.value)}</span>
        </li>
      ))}
    </ul>
  );
}

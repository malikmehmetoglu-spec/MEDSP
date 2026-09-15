/*
  رسم شريطي أفقي مبني بـ CSS.
  الأرقام باللاتينية دائماً، والنسبة تُعرض بجانب القيمة عند الحاجة.
*/

const fmt = (n) => Number(n).toLocaleString('en-US');

export default function BarChart({ data, tone = 'forest', max, showShare }) {
  const items = max ? data.slice(0, max) : data;
  const peak = items.reduce((m, d) => Math.max(m, d.value), 0) || 1;
  const total = data.reduce((sum, d) => sum + d.value, 0) || 1;

  return (
    <ul className={`bars bars--${tone}`}>
      {items.map((item, i) => (
        <li className="bars__row" key={item.label}>
          <span className="bars__rank">{i + 1}</span>
          <span className="bars__label" title={item.label}>{item.label}</span>
          <span className="bars__track">
            <span className="bars__fill" style={{ width: `${(item.value / peak) * 100}%` }} />
          </span>
          <span className="bars__value">
            {fmt(item.value)}
            {showShare && (
              <span className="bars__share">{Math.round((item.value / total) * 100)}%</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

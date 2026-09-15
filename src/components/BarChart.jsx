import { useInView } from '../hooks/motion';

/*
  رسم شريطي أفقي مبني بـ CSS.
  الأعمدة تنمو عند ظهورها على الشاشة، والصف يُبرز عند المرور عليه.
*/

const fmt = (n) => Number(n).toLocaleString('en-US');

export default function BarChart({ data, tone = 'forest', max, showShare }) {
  const [ref, seen] = useInView();
  const items = max ? data.slice(0, max) : data;
  const peak = items.reduce((m, d) => Math.max(m, d.value), 0) || 1;
  const total = data.reduce((sum, d) => sum + d.value, 0) || 1;

  return (
    <ul className={`bars bars--${tone}`} ref={ref}>
      {items.map((item, i) => (
        <li className="bars__row" key={item.label}>
          <span className="bars__rank" dir="ltr">{i + 1}</span>
          <span className="bars__label" title={item.label}>{item.label}</span>
          <span className="bars__track">
            <span
              className="bars__fill"
              style={{
                width: seen ? `${(item.value / peak) * 100}%` : '0%',
                transitionDelay: `${Math.min(i, 12) * 55}ms`,
              }}
            />
          </span>
          <span className="bars__value" dir="ltr">
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

import { useInView } from '../hooks/motion';

/*
  رسم شريطي أفقي مبني بـ CSS.

  الفلترة المتقاطعة: عند تمرير onSelect تصبح الصفوف قابلة للضغط.
  ومع وجود تحديد، يبقى الشريط الكامل باهتاً ويظهر فوقه الجزء المطابق
  للتحديد بلون صريح — فترى حصة المحدد من كل فئة دون أن تفقد سياق الكل.
*/

const fmt = (n) => Number(n).toLocaleString('en-US');

export default function BarChart({
  data, tone = 'forest', max, showShare, onSelect, selected, highlighting,
}) {
  const [ref, seen] = useInView();
  const items = max ? data.slice(0, max) : data;
  const peak = items.reduce((m, d) => Math.max(m, d.value), 0) || 1;
  const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
  const clickable = Boolean(onSelect);

  return (
    <ul className={`bars bars--${tone}${highlighting ? ' is-highlighting' : ''}`} ref={ref}>
      {items.map((item, i) => {
        const key = item.key ?? item.label;
        const isOn = selected != null && String(selected) === String(key);
        const part = highlighting ? (item.part ?? 0) : null;
        const Row = clickable ? 'button' : 'span';
        return (
          <li className={`bars__row${isOn ? ' is-on' : ''}${highlighting && !isOn && !part ? ' is-dim' : ''}`} key={key}>
            <Row
              type={clickable ? 'button' : undefined}
              className="bars__hit"
              onClick={clickable ? () => onSelect(isOn ? null : key, item) : undefined}
              aria-pressed={clickable ? isOn : undefined}
              title={clickable ? (isOn ? 'إلغاء التحديد' : `عرض ${item.label} في بقية الرسوم`) : item.label}
            >
              <span className="bars__rank" dir="ltr">{i + 1}</span>
              <span className="bars__label">{item.label}</span>
              <span className="bars__track">
                <span className="bars__fill" style={{
                  width: seen ? `${(item.value / peak) * 100}%` : '0%',
                  transitionDelay: `${Math.min(i, 12) * 55}ms`,
                }} />
                {part > 0 && (
                  <span className="bars__part" style={{ width: seen ? `${(part / peak) * 100}%` : '0%' }} />
                )}
              </span>
              <span className="bars__value" dir="ltr">
                {part != null && part !== item.value ? `${fmt(part)} / ${fmt(item.value)}` : fmt(item.value)}
                {showShare && (
                  <span className="bars__share">{Math.round(((part ?? item.value) / total) * 100)}%</span>
                )}
              </span>
            </Row>
          </li>
        );
      })}
    </ul>
  );
}

import { useMemo, useState } from 'react';
import { useInView } from '../hooks/motion';

/*
  رسم حلقي.

  - ستة ألوان متمايزة من هوية الوزارة، مرتّبة بتناوب دافئ/بارد حتى لا
    يتجاور لونان متقاربان. ما زاد عن ست فئات يُجمع في «أخرى».
  - فواصل بين الأجزاء وأطراف مستديرة.
  - تفاعلي: تمرير أو لمس أو تركيز أي فئة يُبرزها ويعرض أرقامها في المركز.
  - الحلقة والمفتاح جنباً إلى جنب حين تتسع اللوحة (container query).
*/

const COLORS = 6;
/* نقطة بداية مختلفة لكل نغمة، فلا تتطابق الألوان بين لوحتين متجاورتين */
const START = { teal: 0, gold: 1, forest: 3 };
const MAX_SLICES = 6;

const fmt = (n) => Number(n).toLocaleString('en-US');
const pct = (x) => {
  const v = x * 100;
  return v > 0 && v < 1 ? '<1' : String(Math.round(v));
};

export default function Donut({ data, tone = 'teal', caption, unit = '' }) {
  const [ref, seen] = useInView();
  const [active, setActive] = useState(null);

  const slices = useMemo(() => {
    const sorted = [...data].filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
    if (sorted.length <= MAX_SLICES) return sorted;
    const head = sorted.slice(0, MAX_SLICES - 1);
    const rest = sorted.slice(MAX_SLICES - 1);
    return [...head, {
      label: `أخرى (${rest.length})`,
      value: rest.reduce((s, d) => s + d.value, 0),
      other: true,
    }];
  }, [data]);

  const total = slices.reduce((s, d) => s + d.value, 0);
  if (!total) return <p className="donut__empty">لا توجد بيانات.</p>;

  const R = 62;
  const SW = 14;
  const C = 2 * Math.PI * R;
  /* الطرف المستدير يمتد نصف السماكة في كل جهة، فالفاصل = السماكة + فراغ */
  const GAP = slices.length > 1 ? SW + 5 : 0;
  const start = START[tone] ?? 0;

  let run = 0;
  const segs = slices.map((s, i) => {
    const share = s.value / total;
    const len = share * C;
    const dash = Math.max(len - GAP, 0.01);
    const seg = {
      ...s,
      i,
      share,
      color: s.other ? 'var(--donut-other)' : `var(--donut-${((i + start) % COLORS) + 1})`,
      dash,
      offset: -(run + GAP / 2),
      delay: i * 110,
    };
    run += len;
    return seg;
  });

  const focus = active === null ? null : segs[active];

  return (
    <div className="donut" ref={ref}>
      <div className="donut__inner">
      <div className="donut__ring">
        <svg viewBox="0 0 160 160" className="donut__svg" role="img"
          aria-label={segs.map((s) => `${s.label} ${pct(s.share)}٪`).join('، ')}>
          <circle cx="80" cy="80" r={R} fill="none" className="donut__track" strokeWidth={SW} />
          <g transform="rotate(-90 80 80)">
            {segs.map((s) => (
              <circle
                key={s.label}
                cx="80" cy="80" r={R}
                fill="none"
                stroke={s.color}
                strokeWidth={active === s.i ? SW + 5 : SW}
                strokeLinecap={slices.length > 1 ? 'round' : 'butt'}
                strokeDasharray={`${seen ? s.dash : 0} ${C}`}
                strokeDashoffset={s.offset}
                className={`donut__seg${active !== null && active !== s.i ? ' is-dim' : ''}${active === s.i ? ' is-on' : ''}`}
                style={{ transitionDelay: seen && active === null ? `${s.delay}ms` : '0ms' }}
                onMouseEnter={() => setActive(s.i)}
                onMouseLeave={() => setActive(null)}
                onClick={() => setActive(active === s.i ? null : s.i)}
              />
            ))}
          </g>
        </svg>

        <div className="donut__center" aria-live="polite">
          {focus ? (
            <>
              <strong className="donut__big" dir="ltr">{pct(focus.share)}<small>%</small></strong>
              <span className="donut__what">{focus.label}</span>
              <span className="donut__count" dir="ltr">{fmt(focus.value)}{unit && ` ${unit}`}</span>
            </>
          ) : (
            <>
              <strong className="donut__big" dir="ltr">{fmt(total)}</strong>
              <span className="donut__what">{caption ?? 'الإجمالي'}</span>
              <span className="donut__count">{segs.length} {segs.length === 1 ? 'فئة' : 'فئات'}</span>
            </>
          )}
        </div>
      </div>

      <ul className="donut__key">
        {segs.map((s) => (
          <li key={s.label}>
            <button
              type="button"
              className={`donut__row${active === s.i ? ' is-on' : ''}${active !== null && active !== s.i ? ' is-dim' : ''}`}
              onMouseEnter={() => setActive(s.i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(s.i)}
              onBlur={() => setActive(null)}
              onClick={() => setActive(active === s.i ? null : s.i)}
              style={{ '--c': s.color }}
            >
              <span className="donut__swatch" />
              <span className="donut__name">{s.label}</span>
              <span className="donut__pct" dir="ltr">{pct(s.share)}%</span>
              <span className="donut__bar"><span style={{ width: seen ? `${s.share * 100}%` : 0 }} /></span>
              <span className="donut__num" dir="ltr">{fmt(s.value)}</span>
            </button>
          </li>
        ))}
      </ul>
      </div>
    </div>
  );
}

import { useInView } from '../hooks/motion';

/*
  رسم حلقي مبني بـ SVG، يُرسم تدريجياً عند ظهوره.
*/

const TONES = {
  forest: ['#02443a', '#428177', '#b9a779'],
  gold: ['#958563', '#b9a779', '#d6c9a4'],
  teal: ['#428177', '#b9a779', '#958563'],
};

const fmt = (n) => Number(n).toLocaleString('en-US');

export default function Donut({ data, tone = 'teal', caption }) {
  const [ref, seen] = useInView();
  const palette = TONES[tone] ?? TONES.teal;
  const total = data.reduce((sum, d) => sum + d.value, 0) || 1;

  const R = 60;
  const C = 2 * Math.PI * R;
  let running = 0;

  const segments = data.map((item, i) => {
    const share = item.value / total;
    const seg = {
      ...item,
      share,
      color: palette[i % palette.length],
      dash: share * C,
      offset: -running * C,
      delay: i * 160,
    };
    running += share;
    return seg;
  });

  const lead = segments[0];

  return (
    <div className="donut" ref={ref}>
      <svg viewBox="0 0 160 160" className="donut__svg" role="img">
        <circle cx="80" cy="80" r={R} fill="none" stroke="rgba(149,133,99,.14)" strokeWidth="20" />
        <g transform="rotate(-90 80 80)">
          {segments.map((s) => (
            <circle
              key={s.label}
              cx="80"
              cy="80"
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth="20"
              strokeLinecap="butt"
              strokeDasharray={`${seen ? s.dash : 0} ${C}`}
              strokeDashoffset={s.offset}
              style={{
                transition: `stroke-dasharray 900ms cubic-bezier(.22,1,.36,1) ${s.delay}ms`,
              }}
            />
          ))}
        </g>
        <text x="80" y="76" className="donut__figure">
          {Math.round(lead.share * 100)}%
        </text>
        <text x="80" y="96" className="donut__caption">
          {caption ?? lead.label}
        </text>
      </svg>

      <ul className="donut__key">
        {segments.map((s) => (
          <li key={s.label}>
            <span className="donut__swatch" style={{ background: s.color }} />
            <span className="donut__name">{s.label}</span>
            <span className="donut__num" dir="ltr">{fmt(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

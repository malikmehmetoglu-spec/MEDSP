/*
  رسم حلقي مبني بـ SVG.
  يُستخدم للنسب ذات الفئتين أو الثلاث حيث تكون النسبة أهم من الرقم المطلق.
*/

const TONES = {
  forest: ['#02443a', '#428177', '#b9a779'],
  gold: ['#958563', '#b9a779', '#ebe8d7'],
  teal: ['#428177', '#7fada5', '#b9a779'],
};

export default function Donut({ data, tone = 'forest', caption }) {
  const palette = TONES[tone] ?? TONES.forest;
  const total = data.reduce((sum, d) => sum + d.value, 0) || 1;

  const R = 62;
  const C = 2 * Math.PI * R;
  let offset = 0;

  const segments = data.map((item, i) => {
    const share = item.value / total;
    const seg = {
      ...item,
      share,
      color: palette[i % palette.length],
      dash: share * C,
      gap: C - share * C,
      offset: -offset * C,
    };
    offset += share;
    return seg;
  });

  const lead = segments[0];

  return (
    <div className="donut">
      <svg viewBox="0 0 160 160" className="donut__svg" role="img">
        <g transform="rotate(-90 80 80)">
          {segments.map((s) => (
            <circle
              key={s.label}
              cx="80"
              cy="80"
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth="21"
              strokeDasharray={`${s.dash} ${s.gap}`}
              strokeDashoffset={s.offset}
            />
          ))}
        </g>
        <text x="80" y="74" className="donut__figure">
          {Math.round(lead.share * 100)}%
        </text>
        <text x="80" y="94" className="donut__caption">
          {caption ?? lead.label}
        </text>
      </svg>

      <ul className="donut__key">
        {segments.map((s) => (
          <li key={s.label}>
            <span className="donut__swatch" style={{ background: s.color }} />
            <span className="donut__name">{s.label}</span>
            <span className="donut__num">{s.value.toLocaleString('en-US')}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

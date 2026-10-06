import { useEffect, useMemo, useState } from 'react';
import RubbleTransfer from './RubbleTransfer';

/*
  إدارة الأنقاض — دورة كاملة في تبويب واحد:
    التقدير ← التخطيط والدراسة ← التنفيذ (الترحيل) ← التدوير والاستثمار

  التنفيذ يأتي من الاستمارة الرسمية وتصديرات KoBo (صفحة مشروع ترحيل الأنقاض).
  بقية المراحل من القالب data/rubble-pipeline/pipeline.xlsx.
*/

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
const short = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : fmt(n));

const STAGES = [
  {
    id: 'assessment', title: 'التقدير', color: '#4f8fdc', sub: 'حصر وتقدير كميات الأنقاض',
    kinds: ['assessment'], volLabel: 'الكمية المقدّرة',
    empty: 'لم تُسجَّل بعد أي مناطق مقدّرة. تُضاف من قالب «دورة إدارة الأنقاض» بمرحلة «تقدير».',
  },
  {
    id: 'planning', title: 'التخطيط والدراسة', color: '#8d6bc9', sub: 'المشاريع المخططة وقيد الدراسة والمتابعة',
    kinds: ['planned', 'study'], volLabel: 'الكمية المستهدفة',
    empty: 'لا توجد مشاريع مخططة أو قيد الدراسة بعد. تُضاف من القالب بمرحلة «مخطط» أو «قيد الدراسة».',
  },
  { id: 'execution', title: 'التنفيذ', color: '#2f9e74', sub: 'ترحيل الأنقاض — من الاستمارة الرسمية' },
  {
    id: 'recycling', title: 'التدوير والاستثمار', color: '#d4a443', sub: 'سحق الأنقاض وتدويرها واستثمار نواتجها',
    kinds: ['recycling', 'investment'], volLabel: 'الأنقاض المدخلة',
    empty: 'لا توجد مشاريع تدوير أو استثمار بعد. تُضاف من القالب بمرحلة «تدوير» أو «استثمار».',
  },
];

const KIND_LABEL = { assessment: 'تقدير', planned: 'مخطط', study: 'قيد الدراسة', recycling: 'تدوير', investment: 'استثمار' };

function StageList({ stage, items }) {
  const [kind, setKind] = useState('all');
  const [gov, setGov] = useState('all');
  const list = items.filter((x) => (kind === 'all' || x.stage === kind) && (gov === 'all' || x.gov === gov));
  const govs = [...new Set(items.map((x) => x.gov).filter(Boolean))];
  const vol = list.reduce((a, x) => a + (x.volume || 0), 0);
  const out = list.reduce((a, x) => a + (x.output || 0), 0);
  const budget = list.reduce((a, x) => a + (x.budget || 0), 0);

  if (!items.length) {
    return (
      <div className="hub-empty" style={{ '--c': stage.color }}>
        <h3>{stage.title}</h3>
        <p>{stage.empty}</p>
      </div>
    );
  }

  return (
    <div className="hub-stage">
      <div className="hub-kpis" style={{ '--c': stage.color }}>
        <div><span>المشاريع</span><b>{fmt(list.length)}</b></div>
        <div><span>{stage.volLabel}</span><b>{short(vol)}</b><small>م³</small></div>
        {stage.id === 'recycling' && <div><span>الركام المعاد تدويره</span><b>{short(out)}</b><small>م³ / $</small></div>}
        <div><span>الكلفة التقديرية</span><b>{budget ? `$${short(budget)}` : '—'}</b></div>
      </div>

      <div className="hub-chips">
        {stage.kinds.length > 1 && ['all', ...stage.kinds].map((k) => (
          <button type="button" key={k} className={kind === k ? 'is-on' : ''} onClick={() => setKind(k)}>
            {k === 'all' ? 'الكل' : KIND_LABEL[k]} <small>{fmt(k === 'all' ? items.length : items.filter((x) => x.stage === k).length)}</small>
          </button>
        ))}
        {govs.length > 1 && ['all', ...govs].map((g) => (
          <button type="button" key={g} className={gov === g ? 'is-on' : ''} onClick={() => setGov(g)}>
            {g === 'all' ? 'كل المحافظات' : g}
          </button>
        ))}
      </div>

      <div className="hub-cards">
        {list.map((x) => (
          <article key={x.id} className="hub-card" style={{ '--c': stage.color }}>
            <header>
              <span className="hub-card__kind">{KIND_LABEL[x.stage]}</span>
              {x.status && <span className="hub-card__status">{x.status}</span>}
            </header>
            <h4>{x.name}</h4>
            <p className="hub-card__where">{[x.gov, x.area, x.town].filter(Boolean).join(' · ') || '—'}</p>
            <dl>
              {x.volume != null && <div><dt>{stage.volLabel}</dt><dd>{fmt(x.volume)} م³</dd></div>}
              {x.output != null && <div><dt>{x.stage === 'investment' ? 'قيمة الاستثمار' : 'الناتج'}</dt><dd>{fmt(x.output)}{x.stage === 'investment' ? ' $' : ' م³'}</dd></div>}
              {x.budget != null && <div><dt>الكلفة</dt><dd>${fmt(x.budget)}</dd></div>}
              {x.partner && <div><dt>الجهة / الشريك</dt><dd>{x.partner}</dd></div>}
              {(x.start || x.end) && <div><dt>المدة</dt><dd dir="ltr">{x.start || '…'} → {x.end || '…'}</dd></div>}
            </dl>
            {x.progress != null && (
              <div className="hub-card__prog"><span className="hub-card__track"><span style={{ width: `${Math.min(100, x.progress)}%` }} /></span><b>{x.progress}%</b></div>
            )}
            {x.notes && <p className="hub-card__notes">{x.notes}</p>}
          </article>
        ))}
      </div>
    </div>
  );
}

export default function RubbleHub({ basemap }) {
  const [stage, setStage] = useState('execution');
  const [pipe, setPipe] = useState({ items: [] });
  const [exec, setExec] = useState(null);

  useEffect(() => {
    fetch('data/rubble-pipeline.json').then((r) => r.json()).then(setPipe).catch(() => setPipe({ items: [] }));
    fetch('data/rubble-transfer.json').then((r) => r.json())
      .then((d) => setExec({ n: d.surveys.length, vol: d.surveys.reduce((a, s) => a + s.vol, 0) }))
      .catch(() => setExec(null));
  }, []);

  const byStage = useMemo(() => Object.fromEntries(STAGES.map((s) => [s.id,
    s.kinds ? pipe.items.filter((x) => s.kinds.includes(x.stage)) : []])), [pipe]);

  const summary = (s) => {
    if (s.id === 'execution') return exec ? `${short(exec.vol)} م³ · ${fmt(exec.n)} موقعاً` : '…';
    const it = byStage[s.id];
    if (!it.length) return 'لا مشاريع بعد';
    return `${fmt(it.length)} مشروعاً · ${short(it.reduce((a, x) => a + (x.volume || 0), 0))} م³`;
  };

  const current = STAGES.find((s) => s.id === stage);

  return (
    <div className="hub">
      <nav className="hub-flow" aria-label="مراحل إدارة الأنقاض">
        {STAGES.map((s, i) => (
          <button type="button" key={s.id} className={`hub-step${stage === s.id ? ' is-on' : ''}`} style={{ '--c': s.color }}
            onClick={() => setStage(s.id)} aria-current={stage === s.id ? 'step' : undefined}>
            <span className="hub-step__n">{i + 1}</span>
            <span className="hub-step__t">{s.title}<small>{s.sub}</small></span>
            <span className="hub-step__s">{summary(s)}</span>
          </button>
        ))}
      </nav>

      {current.id === 'execution'
        ? <RubbleTransfer basemap={basemap} />
        : <StageList key={current.id} stage={current} items={byStage[current.id]} />}
    </div>
  );
}

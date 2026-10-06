import { useEffect, useMemo, useState } from 'react';
import RubbleTransfer from './RubbleTransfer';
import EstimateCalc from './EstimateCalc';
import TemplateDownload from '../components/TemplateDownload';
import DamagePanel from './DamagePanel';
import DroneCalc from './DroneCalc';
import RubbleOverview from './RubbleOverview';
import RubbleGallery from './RubbleGallery';
import { fromResponse } from './RubbleTransfer';
import { Entities, Dumps, isEntityRegistry, entitiesFromProject } from './RubbleRegistry';
import { listPublishedProjects, listEntities, rubbleTransferFeed } from './store';

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
  const list = items.filter((x) => (kind === 'all' || x.stage === kind) && (gov === 'all' || (x.govs || [x.gov]).includes(gov)));
  const govs = [...new Set(items.flatMap((x) => x.govs || [x.gov]).filter(Boolean))];
  const vol = list.reduce((a, x) => a + (x.volume || 0), 0);
  const out = list.reduce((a, x) => a + (x.output || 0), 0);
  const budget = list.reduce((a, x) => a + (x.budget || 0), 0);

  if (!items.length) {
    return (
      <div className="hub-empty" style={{ '--c': stage.color }}>
        <h3>{stage.title}</h3>
        <p>{stage.empty}</p>
        <TemplateDownload id="pipeline" />
      </div>
    );
  }

  return (
    <div className="hub-stage">
      <TemplateDownload id="pipeline" />
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
              {(x.start || x.end) && (String(x.start).startsWith('تقرير') ? <div><dt>المصدر</dt><dd>{x.start}</dd></div> : <div><dt>المدة</dt><dd dir="ltr">{x.start || '…'} → {x.end || '…'}</dd></div>)}
            </dl>
            {x.progress != null && (
              <div className="hub-card__prog"><span className="hub-card__track"><span style={{ width: `${Math.min(100, x.progress)}%` }} /></span><b>{x.progress}%</b></div>
            )}
            {x.notes && <p className="hub-card__notes">{x.notes}</p>}
            {x.parts && (
              <ul className="hub-card__parts">
                {x.parts.filter((r) => gov === 'all' || r.gov === gov).map((r) => (
                  <li key={r.gov}><b>{r.gov}</b> — {r.planned ? `${fmt(r.planned)} م³` : 'الكمية قيد التحديد'}{r.notes && <small>{r.notes}</small>}</li>
                ))}
              </ul>
            )}
            {(x.photos || []).some((l) => l.length) && (
              <div className="hub-card__photos">
                {['قبل', 'أثناء', 'بعد'].map((l, i) => x.photos[i][0] && (
                  <a key={l} href={x.photos[i][0]} target="_blank" rel="noreferrer">
                    <img src={x.photos[i][0]} alt={l} loading="lazy" referrerPolicy="no-referrer" /><small>{l}</small>
                  </a>
                ))}
              </div>
            )}
            {x.folder && <a className="hub-card__folder" href={x.folder} target="_blank" rel="noreferrer">مجلد الصور والوثائق ↗</a>}
          </article>
        ))}
      </div>
    </div>
  );
}

export default function RubbleHub({ basemap }) {
  const [stage, setStage] = useState('overview');
  const [pipe, setPipe] = useState({ items: [] });
  const [exec, setExec] = useState(null);
  const [surveys, setSurveys] = useState([]);
  const [plan, setPlan] = useState({ planned: 0, executed: 0, asOf: null, rows: [] });
  const [registry, setRegistry] = useState({ dumps: [], entities: [] });

  useEffect(() => {
    /* السجل: قالب Excel + سجلات مشروع «سجل الجهات» المعتمدة في مساحة العمل (الأحدث يُضاف فوقه) */
    Promise.all([
      fetch('data/rubble-registry.json').then((r) => r.json()).catch(() => ({ dumps: [], entities: [] })),
      listPublishedProjects().catch(() => []),
      listEntities().catch(() => []),
    ]).then(([file, projects, table]) => {
      const live = projects.filter(isEntityRegistry).flatMap(entitiesFromProject);
      /* السجل الرسمي (جدول مساحة العمل) أخيراً حتى يغلب اسمه وتصنيفه */
      setRegistry({ dumps: file.dumps || [], entities: [...(file.entities || []), ...live, ...table] });
    });
    fetch('data/rubble-pipeline.json').then((r) => r.json()).then(setPipe).catch(() => setPipe({ items: [] }));
    Promise.all([
      fetch('data/rubble-transfer.json').then((r) => r.json()).catch(() => ({ surveys: [] })),
      rubbleTransferFeed().catch(() => []),
    ]).then(([d, live]) => {
      const all = [...(d.surveys || []), ...live.map(fromResponse)];
      const ph = d.phases || [];
      setPlan({ rows: ph, planned: ph.reduce((a, r) => a + (r.planned || 0), 0), executed: ph.reduce((a, r) => a + (r.executed || 0), 0), asOf: d.planAsOf });
      setSurveys(all); setExec({ n: all.length, vol: all.reduce((a, s) => a + (s.vol || 0), 0) });
    });
  }, []);

  /* المشاريع (المراحل) التي فيها محافظات لم يبدأ تنفيذها بعد ← «التخطيط والدراسة»: بطاقة لكل مشروع */
  const planItems = useMemo(() => {
    const m = new Map();
    for (const r of plan.rows.filter((x) => !(x.executed > 0))) {
      const o = m.get(r.phase) || { id: `plan-${r.phase}`, stage: 'planned', name: `مشروع ترحيل الأنقاض — ${r.phase}`,
        govs: [], volume: 0, parts: [], start: plan.asOf ? `تقرير ${plan.asOf}` : '', photos: [[], [], []] };
      o.govs.push(r.gov); o.volume += r.planned || 0; o.parts.push(r);
      m.set(r.phase, o);
    }
    return [...m.values()].map((o) => {
      const all = plan.rows.filter((x) => x.phase === o.id.slice(5));
      return { ...o, gov: o.govs.join('، '), status: o.govs.length === all.length ? 'لم يبدأ التنفيذ' : `${o.govs.length} من ${all.length} محافظات لم يبدأ فيها التنفيذ` };
    });
  }, [plan]);

  const byStage = useMemo(() => Object.fromEntries(STAGES.map((s) => [s.id,
    s.kinds ? [...(s.id === 'planning' ? planItems : []), ...pipe.items.filter((x) => s.kinds.includes(x.stage))] : []])), [pipe, planItems]);

  const summary = (s) => {
    if (s.id === 'execution') return exec ? `${short(exec.vol)} م³ · ${fmt(exec.n)} موقعاً` : '…';
    const it = byStage[s.id];
    if (!it.length) return 'لا مشاريع بعد';
    return `${fmt(it.length)} مشروعاً · ${short(it.reduce((a, x) => a + (x.volume || 0), 0))} م³`;
  };

  /* إجابات الاستمارة الرسمية تحمل رمز المحافظة (SY..) — نعرض الاسم */
  const named = useMemo(() => {
    const m = new Map((basemap?.governorates || []).map((g) => [g.code, g.name]));
    return surveys.map((s) => (/^SY\d/.test(s.gov || '') && m.get(s.gov) ? { ...s, gov: m.get(s.gov) } : s));
  }, [surveys, basemap]);

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

      {/* سجلّان يخدمان كل المراحل: من يعمل، وأين تذهب الأنقاض */}
      <nav className="hub-side" aria-label="سجلات">
        <button type="button" className={stage === 'overview' ? 'is-on' : ''} onClick={() => setStage('overview')}>
          لمحة عامة
        </button>
        <button type="button" className={stage === 'gallery' ? 'is-on' : ''} onClick={() => setStage('gallery')}>
          الأرشيف المصور
        </button>
        <button type="button" className={stage === 'entities' ? 'is-on' : ''} onClick={() => setStage('entities')}>
          الجهات العاملة وأدوارها
        </button>
        <button type="button" className={stage === 'dumps' ? 'is-on' : ''} onClick={() => setStage('dumps')}>
          المكبات المعتمدة والمقترحة
        </button>
      </nav>

      {stage === 'overview' && <RubbleOverview plan={plan} surveys={named} pipe={pipe.items} registry={registry} go={setStage} />}
      {stage === 'gallery' && <RubbleGallery surveys={named} pipe={pipe.items} />}
      {stage === 'entities' && <Entities surveys={surveys} registry={registry} />}
      {stage === 'dumps' && <Dumps surveys={surveys} registry={registry} basemap={basemap} />}
      {!current ? null : current.id === 'execution'
        ? <RubbleTransfer basemap={basemap} />
        : (
          <>
            {current.id === 'assessment' && <><DamagePanel surveys={surveys} /><EstimateCalc /><TemplateDownload id="method" /><DroneCalc /></>}
            <StageList key={current.id} stage={current} items={byStage[current.id]} />
          </>
        )}
    </div>
  );
}

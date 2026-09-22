import { useMemo, useState } from 'react';
import { buildReport } from './buildReport';
import { planReport, aggValue, AGGS } from './reportPlan';
import { Panel, Stat, Toll } from '../components/ReportShell';
import BarChart from '../components/BarChart';
import Donut from '../components/Donut';
import SyriaMap from '../components/SyriaMap';
import Figure from '../components/Figure';
import Icon from '../components/Icon';

/*
  تقرير المشروع — بمكوّنات تقارير المنصة نفسها.
  ما يظهر، وبأي رسم، وبأي عرض وترتيب: يحدده reportPlan من إعدادات
  الاستبيان، وبلا إعدادات يُنتج التقرير الافتراضي.
*/

const fmt = (n) => Number(n).toLocaleString('en-US');
const dmy = (iso) => new Date(iso).toLocaleDateString('en-GB');
const TONES = ['teal', 'gold', 'forest'];

function centroid(geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let sx = 0; let sy = 0; let n = 0;
  for (const poly of polys) for (const [x, y] of poly[0]) { sx += x; sy += y; n += 1; }
  return n ? [sx / n, sy / n] : null;
}

function useGeo(geo, basemap) {
  return useMemo(() => {
    if (!basemap || !geo) return { locations: [], byGov: [] };
    const subs = new Map(basemap.subdistricts.map((x) => [x.code, x]));
    const names = new Map(basemap.governorates.map((g) => [g.code, g.name]));
    const locations = geo.bySubdistrict.map((d) => {
      const area = subs.get(d.code);
      const c = area && centroid(area.g);
      return c ? { lon: c[0], lat: c[1], name: area.name, count: d.count } : null;
    }).filter(Boolean).sort((a, b) => b.count - a.count);
    const byGov = geo.byGovernorate.map((d) => ({ label: names.get(d.code) || d.code, value: d.count }))
      .sort((a, b) => b.value - a.value);
    return { locations, byGov };
  }, [geo, basemap]);
}

/* ---------------- رسوم إضافية ---------------- */

/* أعمدة زمنية: عدد الإجابات لكل يوم */
function Columns({ series }) {
  const max = Math.max(...series.map((d) => d.count), 1);
  const step = Math.max(1, Math.ceil(series.length / 12));
  return (
    <div className="cols" role="img" aria-label="توزّع زمني">
      <div className="cols__plot">
        {series.map((d, i) => (
          <div className="cols__col" key={d.date} title={`${dmy(d.date)}: ${fmt(d.count)}`}>
            <span className="cols__n">{d.count}</span>
            <span className="cols__bar" style={{ height: `${(d.count / max) * 100}%` }} />
            <span className="cols__tick">{i % step === 0 ? d.date.slice(5).replace('-', '/') : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* نماذج من الإجابات النصية */
function Quotes({ samples }) {
  return (
    <ul className="quotes">
      {samples.slice(0, 8).map((q) => (
        <li key={q.text} className="quotes__item">
          <Icon name="t_textarea" className="quotes__mark" />
          <span className="quotes__text">{q.text}</span>
          {q.count > 1 && <span className="quotes__count" dir="ltr">×{q.count}</span>}
        </li>
      ))}
    </ul>
  );
}

/* ---------------- لوحة واحدة ---------------- */

function PanelFor({ item, tone, basemap }) {
  const { node, settings, data, chart, span } = item;
  const title = settings?.title || node?.label;

  const geo = useGeo(data?.geo, basemap);

  if (chart === 'numbers') {
    return (
      <Panel span="full" title="مؤشرات رقمية" note="محسوبة من كل الاستمارات المعتمدة">
        <Toll rows={item.rows.map((r) => ({
          icon: `t_${r.node.type}`,
          label: `${r.settings.title || r.node.label}${r.settings.agg !== 'sum' ? ` (${AGGS[r.settings.agg]})` : ''}`,
          value: aggValue(r.data.stats, r.settings.agg),
        }))} />
      </Panel>
    );
  }

  const answered = `${fmt(data.answered)} إجابة`;
  switch (chart) {
    case 'donut':
      return (
        <Panel span={span} title={title} note={answered}>
          <Donut data={data.dist.map((d) => ({ label: d.label, value: d.count }))} tone={tone} caption="إجابة" />
        </Panel>
      );
    case 'bars': {
      const rows = node.type === 'range'
        ? data.dist.map((d) => ({ label: `الدرجة ${d.value}`, value: d.count }))
        : data.dist.map((d) => ({ label: d.label, value: d.count }));
      const note = node.type === 'range' && data.stats
        ? `المتوسط ${fmt(data.stats.avg)} من ${node.max ?? 5}`
        : node.type === 'select_multiple' ? 'يمكن اختيار أكثر من إجابة' : answered;
      return (
        <Panel span={span} title={title} note={note}>
          <BarChart data={rows} tone={tone} showShare />
        </Panel>
      );
    }
    case 'map':
      return (
        <Panel span={span} title={title} note={`${fmt(geo.locations.length)} ناحية، مطابقة بحدودها الرسمية`}>
          <SyriaMap basemap={basemap} locations={geo.locations} noun="الاستمارات" />
        </Panel>
      );
    case 'gov':
      return (
        <Panel span={span} title={item.group ? 'التوزّع حسب المحافظة' : title} note="مرتّبة تنازلياً">
          <BarChart data={geo.byGov} showShare />
        </Panel>
      );
    case 'timeline':
      return (
        <Panel span={span} title={title} note={`${fmt(data.series.length)} يوماً`}>
          <Columns series={data.series} />
        </Panel>
      );
    case 'summary':
      return (
        <Panel span={span} title={title} note="مجموع ما سُجّل في كل الاستمارات">
          <Toll rows={[
            { icon: 't_repeat', label: 'إجمالي المسجّل', value: data.rowCount },
            ...data.sums.map((s) => ({ icon: `t_${s.node.type}`, label: s.node.label, value: s.total })),
          ]} />
        </Panel>
      );
    case 'quotes':
      return (
        <Panel span={span} title={title} note={`نماذج من ${answered}، المتطابقة مجمّعة`}>
          <Quotes samples={data.samples} />
        </Panel>
      );
    default:
      return null;
  }
}

/* ---------------- التقرير ---------------- */

export default function ProjectReport({ project, basemap }) {
  const [surveyId, setSurveyId] = useState(project.surveys[0]?.id ?? null);
  const survey = project.surveys.find((s) => s.id === surveyId) || project.surveys[0];

  const responses = useMemo(
    () => project.responses.filter((r) => r.surveyId === survey?.id),
    [project.responses, survey],
  );
  const report = useMemo(() => (survey ? buildReport(survey, responses) : null), [survey, responses]);
  const plan = useMemo(() => (survey && report ? planReport(survey, report) : null), [survey, report]);

  if (!survey) return <div className="pending"><h3>لا يوجد استبيان في هذا المشروع</h3></div>;

  const dated = responses.map((r) => r.submittedAt).filter(Boolean).sort();
  const govCount = [...report.data.values()].find((d) => d.geo)?.geo.byGovernorate.length || 0;
  const hero = plan.hero;

  return (
    <>
      {project.surveys.length > 1 && (
        <div className="preport__tabs">
          {project.surveys.map((s) => (
            <button key={s.id} type="button" className={`preport__tab${s.id === survey.id ? ' is-on' : ''}`}
              onClick={() => setSurveyId(s.id)}>{s.title}</button>
          ))}
        </div>
      )}

      {report.total === 0 ? (
        <div className="pending">
          <h3>لا توجد إجابات معتمدة بعد</h3>
          <p>يظهر التقرير حين تُعتمد أول إجابة.</p>
        </div>
      ) : (
        <>
          <section className="hero">
            <div className="hero__primary">
              <span className="hero__eyebrow">
                <Icon name={hero.kind === 'field' ? `t_${hero.node.type}` : 't_textarea'} />
                {hero.kind === 'field' ? (hero.settings.title || hero.node.label) : survey.title}
              </span>
              <Figure
                value={hero.kind === 'field' ? aggValue(hero.data?.stats, hero.settings.agg) : report.total}
                className="hero__figure" />
              <span className="hero__sub">
                {hero.kind === 'field'
                  ? <>{AGGS[hero.settings.agg]}{hero.node.unit ? ` (${hero.node.unit})` : ''} من {fmt(report.total)} استمارة معتمدة</>
                  : <>استمارة معتمدة{govCount > 0 && ` من ${fmt(govCount)} محافظة`}</>}
                {dated.length > 1 && (
                  <>
                    ، جُمعت بين <span className="nowrap" dir="ltr">{dmy(dated[0])}</span>
                    {' '}و<span className="nowrap" dir="ltr">{dmy(dated[dated.length - 1])}</span>
                  </>
                )}
              </span>
            </div>

            {plan.side.length > 0 && (
              <div className={`hero__side hero__side--${plan.side.length}`}>
                {plan.side.map((sd, i) => {
                  const st = sd.data.stats;
                  const v = aggValue(st, sd.settings.agg);
                  return (
                    <Stat
                      key={sd.node.name}
                      icon={`t_${sd.node.type}`}
                      tone={i === 1 ? 'forest' : 'teal'}
                      label={sd.settings.title || sd.node.label}
                      value={v}
                      unit={sd.node.unit || ''}
                      share={st.max ? Math.round((st.avg / st.max) * 100) : 0}
                      note={sd.settings.agg === 'sum'
                        ? `بمتوسط ${fmt(st.avg)} لكل استمارة، وأعلى قيمة ${fmt(st.max)}`
                        : `${AGGS[sd.settings.agg]} من ${fmt(st.count)} إجابة`}
                    />
                  );
                })}
              </div>
            )}
          </section>

          <div className="panels">
            {plan.panels.map((item, i) => (
              <PanelFor key={item.key} item={item} tone={TONES[i % TONES.length]} basemap={basemap} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

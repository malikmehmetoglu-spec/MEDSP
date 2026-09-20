import { useMemo, useState } from 'react';
import { buildReport } from './buildReport';
import Donut from '../components/Donut';
import SyriaMap from '../components/SyriaMap';

const fmt = (n) => Number(n).toLocaleString('en-US');

/* ---------------- كتل العرض ---------------- */

function StatBlock({ node, stats }) {
  return (
    <div className="stat">
      <span className="stat__label">{node.label}</span>
      <strong className="stat__number">{fmt(stats.sum)}</strong>
      <span className="stat__unit">{node.unit || ''}</span>
      <p className="stat__note">
        المتوسط {fmt(stats.avg)} · الأدنى {fmt(stats.min)} · الأعلى {fmt(stats.max)}
      </p>
    </div>
  );
}

function BarsBlock({ node, dist }) {
  const max = Math.max(...dist.map((d) => d.count), 1);
  return (
    <section className="panel">
      <div className="panel__head"><h3>{node.label}</h3></div>
      <div className="bars">
        {dist.map((d, i) => (
          <div className="bars__row" key={d.value}>
            <span className="bars__rank">{i + 1}</span>
            <span className="bars__label">{d.label}</span>
            <span className="bars__track">
              <span className="bars__fill" style={{ width: `${(d.count / max) * 100}%` }} />
            </span>
            <span className="bars__value">
              {fmt(d.count)}<small>{d.pct}%</small>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function DonutBlock({ node, dist }) {
  return (
    <section className="panel">
      <div className="panel__head"><h3>{node.label}</h3></div>
      <Donut data={dist.map((d) => ({ label: d.label, value: d.count }))} tone="teal" />
    </section>
  );
}

function ScaleBlock({ node, stats, dist }) {
  const ordered = [...dist].sort((a, b) => Number(a.value) - Number(b.value));
  const max = Math.max(...ordered.map((d) => d.count), 1);
  return (
    <section className="panel">
      <div className="panel__head">
        <h3>{node.label}</h3>
        <span className="panel__note">المتوسط {fmt(stats.avg)}</span>
      </div>
      <div className="scale">
        {ordered.map((d) => (
          <div className="scale__col" key={d.value}>
            <span className="scale__barwrap">
              <span className="scale__bar" style={{ height: `${(d.count / max) * 100}%` }} />
            </span>
            <span className="scale__num">{fmt(d.count)}</span>
            <span className="scale__tick">{d.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* مركز تقريبي لمضلّع — لوضع نقطة الناحية على الخريطة */
function centroid(geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const poly of polys) {
    for (const [x, y] of poly[0]) { sx += x; sy += y; n += 1; }
  }
  return n ? [sx / n, sy / n] : null;
}

function MapBlock({ node, geo, basemap }) {
  const locations = useMemo(() => {
    if (!basemap) return [];
    const subs = new Map(basemap.subdistricts.map((s) => [s.code, s]));
    const govs = new Map(basemap.governorates.map((g) => [g.code, g]));

    return geo.bySubdistrict
      .map((d) => {
        const area = subs.get(d.code) || govs.get(d.code);
        if (!area) return null;
        const c = centroid(area.g);
        if (!c) return null;
        return { lon: c[0], lat: c[1], name: area.name, count: d.count };
      })
      .filter(Boolean)
      .sort((a, b) => b.count - a.count);
  }, [basemap, geo]);

  if (!basemap || locations.length === 0) return null;

  return (
    <section className="panel">
      <div className="panel__head">
        <h3>{node.label}</h3>
        <span className="panel__note">{fmt(geo.total)} سجلاً</span>
      </div>
      <SyriaMap basemap={basemap} locations={locations} />
      <ul className="donut__key">
        {geo.byGovernorate
          .slice()
          .sort((a, b) => b.count - a.count)
          .slice(0, 8)
          .map((d) => {
            const name = basemap.governorates.find((g) => g.code === d.code)?.name || d.code;
            return (
              <li key={d.code}>
                <span className="donut__swatch" style={{ background: 'var(--mountain-teal)' }} />
                <span className="donut__name">{name}</span>
                <span className="donut__num" dir="ltr">{fmt(d.count)}</span>
              </li>
            );
          })}
      </ul>
    </section>
  );
}

function TimelineBlock({ node, series }) {
  const max = Math.max(...series.map((d) => d.count), 1);
  return (
    <section className="panel">
      <div className="panel__head"><h3>{node.label}</h3></div>
      <div className="timeline">
        {series.map((d) => (
          <div className="timeline__col" key={d.date} title={`${d.date}: ${d.count}`}>
            <span className="timeline__bar" style={{ height: `${(d.count / max) * 100}%` }} />
            <span className="timeline__tick">{d.date.slice(5)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function RepeatBlock({ node, rowCount, sums }) {
  return (
    <section className="panel">
      <div className="panel__head"><h3>{node.label}</h3></div>
      <div className="tolls">
        <div className="toll">
          <span className="toll__label">إجمالي المدخلات</span>
          <strong className="toll__value">{fmt(rowCount)}</strong>
        </div>
        {sums.map((s) => (
          <div className="toll" key={s.node.name}>
            <span className="toll__label">{s.node.label}</span>
            <strong className="toll__value">{fmt(s.total)}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- التقرير ---------------- */

export default function ProjectReport({ project, basemap }) {
  const [surveyId, setSurveyId] = useState(project.surveys[0]?.id ?? null);

  const survey = project.surveys.find((s) => s.id === surveyId) || project.surveys[0];
  const responses = useMemo(
    () => project.responses.filter((r) => r.surveyId === survey?.id),
    [project.responses, survey],
  );

  const report = useMemo(
    () => (survey ? buildReport(survey, responses) : null),
    [survey, responses],
  );

  if (!survey) {
    return <p className="results__empty">لا يوجد استبيان في هذا المشروع.</p>;
  }

  return (
    <div className="preport">
      {project.surveys.length > 1 && (
        <div className="preport__tabs">
          {project.surveys.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`preport__tab${s.id === survey.id ? ' is-on' : ''}`}
              onClick={() => setSurveyId(s.id)}
            >
              {s.title}
            </button>
          ))}
        </div>
      )}

      <div className="stats">
        <div className="stat stat--hero">
          <span className="stat__label">إجمالي السجلات المعتمدة</span>
          <strong className="stat__number">{fmt(report.total)}</strong>
        </div>
        {report.blocks.filter((b) => b.kind === 'stat').map((b) => (
          <StatBlock key={b.node.name} {...b} />
        ))}
      </div>

      {report.blocks.map((b) => {
        switch (b.kind) {
          case 'donut': return <DonutBlock key={b.node.name} {...b} />;
          case 'bars': return <BarsBlock key={b.node.name} {...b} />;
          case 'scale': return <ScaleBlock key={b.node.name} {...b} />;
          case 'map': return <MapBlock key={b.node.name} {...b} basemap={basemap} />;
          case 'timeline': return <TimelineBlock key={b.node.name} {...b} />;
          case 'repeat': return <RepeatBlock key={b.node.name} {...b} />;
          default: return null;
        }
      })}

      {report.blocks.length === 0 && (
        <p className="results__empty">
          لا توجد بيانات كافية لتوليد رسوم. أضف أسئلة رقمية أو اختيارية.
        </p>
      )}
    </div>
  );
}

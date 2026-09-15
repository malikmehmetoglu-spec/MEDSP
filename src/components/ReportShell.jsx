import { useState } from 'react';
import useReportStats from '../hooks/useReportStats';
import Filters from './Filters';
import SyriaMap from './SyriaMap';
import BarChart from './BarChart';
import Donut from './Donut';
import Figure from './Figure';
import Icon from './Icon';
import { useInView } from '../hooks/motion';

const fmt = (n) => Number(n).toLocaleString('en-US');

function Meter({ share, tone }) {
  const [ref, seen] = useInView();
  return (
    <span className={`meter meter--${tone}`} ref={ref}>
      <span className="meter__fill" style={{ width: seen ? `${share}%` : '0%' }} />
    </span>
  );
}

function Stat({ icon, label, value, unit, note, share, tone }) {
  return (
    <article className="stat">
      <span className="stat__head">
        <Icon name={icon} className={`icon--${tone}`} />
        <span className="stat__label">{label}</span>
      </span>
      <span className="stat__value">
        <Figure value={value} className="stat__number" />
        <em>{unit}</em>
      </span>
      <Meter share={share} tone={tone} />
      <span className="stat__note">{note}</span>
    </article>
  );
}

export function Panel({ title, note, children, span }) {
  return (
    <section className={span ? `panel panel--${span}` : 'panel'}>
      <div className="panel__head">
        <h3>{title}</h3>
        {note && <p className="panel__note">{note}</p>}
      </div>
      <div className="panel__body">{children}</div>
    </section>
  );
}

export function Toll({ rows }) {
  return (
    <div className="toll">
      {rows.map((row) => (
        <div className={row.staff ? 'toll__item toll__item--staff' : 'toll__item'} key={row.label}>
          <Icon name={row.icon} className="toll__icon" />
          <div className="toll__text">
            <Figure value={row.value} className="toll__value" />
            <span className="toll__label">{row.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* لوحة بُعد: تعرض رسماً شريطياً أو حلقياً حسب عدد الفئات */
export function DimPanel({ dim, tone = 'teal', max, span, donutAt = 3 }) {
  if (!dim || dim.data.length === 0) return null;

  const note = [
    dim.note,
    dim.excludeLabel && dim.excluded
      ? `${dim.excludeLabel}: ${fmt(dim.excluded)} حالة غير محدّدة`
      : null,
  ]
    .filter(Boolean)
    .join(' — ');

  return (
    <Panel title={dim.title} note={note || null} span={span}>
      {dim.data.length <= donutAt ? (
        <Donut data={dim.data} tone={tone} />
      ) : (
        <BarChart data={dim.data} tone={tone} max={max} showShare />
      )}
    </Panel>
  );
}

/*
  هيكل التقرير المشترك: المرشّحات، الواجهة الرئيسية، والخريطة.
  يتلقى محتواه الخاص من كل تقرير عبر children.
*/
export default function ReportShell({ report, basemap, hero, children }) {
  const [range, setRange] = useState({ from: report.from, to: report.to });
  const [directorate, setDirectorate] = useState(null);
  const [center, setCenter] = useState(null);

  const data = useReportStats(report, range, { directorate, center });

  const pickDirectorate = (value) => {
    setDirectorate(value);
    setCenter(null);
  };

  const reset = () => {
    setRange({ from: report.from, to: report.to });
    setDirectorate(null);
    setCenter(null);
  };

  const view = hero(data);

  return (
    <>
      <Filters
        bounds={{ from: report.from, to: report.to }}
        range={range}
        onRange={setRange}
        directorates={data.directorates}
        centers={data.availableCenters}
        directorate={directorate}
        center={center}
        onDirectorate={pickDirectorate}
        onCenter={setCenter}
        onReset={reset}
        count={data.total}
      />

      {data.total === 0 ? (
        <div className="pending">
          <h3>لا توجد بيانات بهذه المرشّحات</h3>
          <p>وسّع الفترة الزمنية أو أزل مرشّح المديرية أو المركز.</p>
        </div>
      ) : (
        <>
          <section className="hero">
            <div className="hero__primary">
              <span className="hero__eyebrow">
                <Icon name={view.icon} />
                {view.eyebrow}
              </span>
              <Figure value={data.total} className="hero__figure" />
              <span className="hero__sub">
                في {fmt(data.locations.length)} موقعاً ضمن{' '}
                {fmt(data.byGovernorate.length)} محافظة
              </span>
            </div>

            <div className="hero__side">
              {view.stats.map((stat) => (
                <Stat key={stat.label} {...stat} />
              ))}
            </div>
          </section>

          <div className="panels">
            {children(data)}

            <Panel
              span="full"
              title="التوزّع الجغرافي"
              note={`${fmt(data.locations.length)} موقعاً مُرمّزاً، مطابقة بإحداثياتها الرسمية`}
            >
              <SyriaMap basemap={basemap} locations={data.locations} />
            </Panel>

            <Panel title="التوزّع حسب المحافظة" note="مرتّبة تنازلياً" span="wide">
              <BarChart data={data.byGovernorate} showShare />
            </Panel>
          </div>
        </>
      )}
    </>
  );
}

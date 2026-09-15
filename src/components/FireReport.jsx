import SyriaMap from './SyriaMap';
import BarChart from './BarChart';
import Donut from './Donut';
import Figure from './Figure';
import Icon from './Icon';
import { useInView } from '../hooks/motion';
import useFireStats from '../hooks/useFireStats';
import Filters from './Filters';
import { useState } from 'react';

const fmt = (n) => Number(n).toLocaleString('en-US');

/* عمود مصغّر يرافق البطاقة ليعطي إحساساً بالنسبة دون رسم كامل */
function Meter({ share, tone }) {
  const [ref, seen] = useInView();
  return (
    <span className={`meter meter--${tone}`} ref={ref}>
      <span className="meter__fill" style={{ width: seen ? `${share}%` : '0%' }} />
    </span>
  );
}

function Hero({ data }) {
  const known = data.causes.reduce((s, c) => s + c.value, 0);

  const stats = [
    {
      icon: 'area',
      label: 'المساحة المحترقة',
      value: data.burnedArea,
      unit: 'دونم',
      note: `مسجّلة في ${fmt(data.burnedAreaRecords)} حريقاً`,
      share: data.total ? Math.round((data.burnedAreaRecords / data.total) * 100) : 0,
      tone: 'gold',
    },
    {
      icon: 'clock',
      label: 'متوسط زمن الوصول',
      value: data.avgArrival,
      unit: 'دقيقة',
      note: 'محسوب من كل البلاغات',
      share: 100,
      tone: 'teal',
    },
    {
      icon: 'target',
      label: 'الحرائق محدَّدة السبب',
      value: known,
      unit: 'حريق',
      note: `${data.total ? Math.round((known / data.total) * 100) : 0}% من الإجمالي`,
      share: data.total ? Math.round((known / data.total) * 100) : 0,
      tone: 'forest',
    },
  ];

  return (
    <section className="hero">
      <div className="hero__primary">
        <span className="hero__eyebrow">
          <Icon name="flame" />
          إجمالي الحرائق المسجّلة
        </span>
        <Figure value={data.total} className="hero__figure" />
        <span className="hero__sub">
          في {fmt(data.locations.length)} موقعاً ضمن {fmt(data.byGovernorate.length)} محافظة
        </span>
      </div>

      <div className="hero__side">
        {stats.map((stat) => (
          <article className="stat" key={stat.label}>
            <span className="stat__head">
              <Icon name={stat.icon} className={`icon--${stat.tone}`} />
              <span className="stat__label">{stat.label}</span>
            </span>
            <span className="stat__value">
              <Figure value={stat.value} className="stat__number" />
              <em>{stat.unit}</em>
            </span>
            <Meter share={stat.share} tone={stat.tone} />
            <span className="stat__note">{stat.note}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function Toll({ data }) {
  const rows = [
    { label: 'إصابات المدنيين', value: data.civilianInjuries, icon: 'civilianHurt' },
    { label: 'وفيات المدنيين', value: data.civilianDeaths, icon: 'civilian' },
    { label: 'إصابات كوادر الوزارة', value: data.staffInjuries, icon: 'staffHurt', staff: true },
    { label: 'وفيات كوادر الوزارة', value: data.staffDeaths, icon: 'staff', staff: true },
  ];

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

function Panel({ title, note, children, span }) {
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

export default function FireReport({ fire, basemap }) {
  const [range, setRange] = useState({ from: fire.from, to: fire.to });
  const [directorate, setDirectorate] = useState(null);
  const [center, setCenter] = useState(null);

  const data = useFireStats(fire, range, { directorate, center });

  /* تغيير المديرية يُلغي المركز لأنه قد لا يتبعها */
  const pickDirectorate = (value) => {
    setDirectorate(value);
    setCenter(null);
  };

  const reset = () => {
    setRange({ from: fire.from, to: fire.to });
    setDirectorate(null);
    setCenter(null);
  };

  const unknownShare = data.total
    ? Math.round((data.causesUnknown / data.total) * 100)
    : 0;
  const placeShare = data.total
    ? Math.round((data.placeTypesCoverage / data.total) * 100)
    : 0;

  return (
    <>
      <Filters
        bounds={{ from: fire.from, to: fire.to }}
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
          <h3>لا توجد حرائق بهذه المرشّحات</h3>
          <p>وسّع الفترة الزمنية أو أزل مرشّح المديرية أو المركز.</p>
        </div>
      ) : (
      <>
      <Hero data={data} />

      <div className="panels">
        <Panel title="الأثر البشري" note="مسجّل في كل بلاغات الإطفاء دون استثناء" span="full">
          <Toll data={data} />
        </Panel>

        <Panel
          span="full"
          title="مواقع الحرائق"
          note={`${fmt(data.locations.length)} موقعاً مُرمّزاً، مطابقة بإحداثياتها الرسمية`}
        >
          <SyriaMap basemap={basemap} locations={data.locations} />
        </Panel>

        <Panel title="توزّع الحرائق حسب المحافظة" note="مرتّبة تنازلياً" span="wide">
          <BarChart data={data.byGovernorate} showShare />
        </Panel>

        <Panel title="طبيعة الموقع" note="مأهول أم غير مأهول">
          <Donut data={data.inhabited} tone="teal" />
        </Panel>

        <Panel
          title="أسباب الحرائق"
          note={`لم يُحدَّد السبب في ${fmt(data.causesUnknown)} حريقاً، أي ${unknownShare}% من الإجمالي`}
          span="wide"
        >
          <BarChart data={data.causes} tone="gold" showShare />
        </Panel>

        <Panel title="نوع مكان الحريق" note={`مسجّل في ${placeShare}% من الحرائق`}>
          <BarChart data={data.placeTypes} tone="teal" max={8} />
        </Panel>
      </div>
      </>
      )}
    </>
  );
}

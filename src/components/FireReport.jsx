import FireMap from './FireMap';
import BarChart from './BarChart';
import Donut from './Donut';

const fmt = (n) => Number(n).toLocaleString('en-US');

function Hero({ data }) {
  const known = data.causes.reduce((s, c) => s + c.value, 0);
  return (
    <section className="hero">
      <div className="hero__primary">
        <span className="hero__eyebrow">إجمالي الحرائق المسجّلة</span>
        <span className="hero__figure">{fmt(data.total)}</span>
        <span className="hero__sub">
          موزّعة على {fmt(data.locations.length)} موقعاً في {fmt(data.byGovernorate.length)} محافظة
        </span>
      </div>

      <dl className="hero__side">
        <div>
          <dt>المساحة المحترقة</dt>
          <dd>{fmt(data.burnedArea)} <em>دونم</em></dd>
          <small>مسجّلة في {fmt(data.burnedAreaRecords)} حريقاً</small>
        </div>
        <div>
          <dt>متوسط زمن الوصول</dt>
          <dd>{fmt(data.avgArrival)} <em>دقيقة</em></dd>
          <small>محسوب من كل البلاغات</small>
        </div>
        <div>
          <dt>السبب محدَّد</dt>
          <dd>{fmt(known)} <em>حريق</em></dd>
          <small>{Math.round((known / data.total) * 100)}% من الإجمالي</small>
        </div>
      </dl>
    </section>
  );
}

function Toll({ data }) {
  const rows = [
    { label: 'إصابات المدنيين', value: data.civilianInjuries },
    { label: 'وفيات المدنيين', value: data.civilianDeaths },
    { label: 'إصابات كوادر الوزارة', value: data.staffInjuries, staff: true },
    { label: 'وفيات كوادر الوزارة', value: data.staffDeaths, staff: true },
  ];

  return (
    <div className="toll">
      {rows.map((row) => (
        <div className={row.staff ? 'toll__item toll__item--staff' : 'toll__item'} key={row.label}>
          <span className="toll__value">{fmt(row.value)}</span>
          <span className="toll__label">{row.label}</span>
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

export default function FireReport({ data, geo }) {
  const unknownShare = Math.round((data.causesUnknown / data.total) * 100);
  const placeShare = Math.round((data.placeTypesCoverage / data.total) * 100);

  return (
    <>
      <Hero data={data} />

      <Panel title="الأثر البشري" note="مسجّل في كل بلاغات الإطفاء دون استثناء" span="full">
        <Toll data={data} />
      </Panel>

      <div className="panels">
        <Panel
          span="full"
          title="مواقع الحرائق"
          note={`${fmt(data.locations.length)} موقعاً مُرمّزاً، مطابقة بإحداثياتها الرسمية`}
        >
          <FireMap backdrop={geo.backdrop} locations={data.locations} />
        </Panel>

        <Panel title="توزّع الحرائق حسب المحافظة" note="مرتّبة تنازلياً" span="wide">
          <BarChart data={data.byGovernorate} showShare />
        </Panel>

        <Panel title="طبيعة الموقع" note="مأهول أم غير مأهول">
          <Donut data={data.inhabited} tone="teal" />
        </Panel>

        <Panel
          title="أسباب الحرائق"
          note={`لم يُحدَّد السبب في ${fmt(data.causesUnknown)} حريقاً — ${unknownShare}% من الإجمالي`}
          span="wide"
        >
          <BarChart data={data.causes} tone="gold" showShare />
        </Panel>

        <Panel title="نوع مكان الحريق" note={`مسجّل في ${placeShare}% من الحرائق`}>
          <BarChart data={data.placeTypes} tone="teal" max={8} />
        </Panel>
      </div>
    </>
  );
}

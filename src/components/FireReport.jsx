import FireMap from './FireMap';
import BarChart from './BarChart';

const ar = (n) => Number(n).toLocaleString('ar-SY');

function Kpi({ value, unit, label, note, tone }) {
  return (
    <div className={tone ? `kpi kpi--${tone}` : 'kpi'}>
      <span className="kpi__value">
        {ar(value)}
        {unit && <span className="kpi__unit">{unit}</span>}
      </span>
      <span className="kpi__label">{label}</span>
      {note && <span className="kpi__note">{note}</span>}
    </div>
  );
}

function Panel({ title, note, children, wide }) {
  return (
    <section className={wide ? 'panel panel--wide' : 'panel'}>
      <div className="panel__head">
        <h3>{title}</h3>
        {note && <p className="panel__note">{note}</p>}
      </div>
      {children}
    </section>
  );
}

export default function FireReport({ data, geo }) {
  const causesTotal = data.causes.reduce((sum, c) => sum + c.value, 0);
  const unknownShare = Math.round((data.causesUnknown / data.total) * 100);
  const placeShare = Math.round((data.placeTypesCoverage / data.total) * 100);
  const areaShare = Math.round((data.burnedAreaRecords / data.total) * 100);

  return (
    <>
      <div className="kpis">
        <Kpi value={data.total} label="عدد الحرائق" />
        <Kpi
          value={data.burnedArea}
          unit="دونم"
          label="المساحة المحترقة"
          note={`مسجّلة في ${ar(data.burnedAreaRecords)} حريقاً (${ar(areaShare)}٪)`}
        />
        <Kpi value={data.civilianInjuries} label="إصابات المدنيين" />
        <Kpi value={data.civilianDeaths} label="وفيات المدنيين" tone="alert" />
        <Kpi
          value={data.staffInjuries}
          label="إصابات كوادر الوزارة"
          note={data.staffDeaths === 0 ? 'دون وفيات' : `${ar(data.staffDeaths)} وفاة`}
          tone="alert"
        />
        <Kpi value={data.avgArrival} unit="دقيقة" label="متوسط زمن الوصول" />
      </div>

      <div className="panels">
        <Panel
          wide
          title="مواقع الحرائق"
          note={`${ar(data.locations.length)} موقعاً في مختلف المحافظات`}
        >
          <FireMap backdrop={geo.backdrop} locations={data.locations} />
        </Panel>

        <Panel title="توزّع الحرائق حسب المحافظة">
          <BarChart data={data.byGovernorate} />
        </Panel>

        <Panel
          title="أسباب الحرائق"
          note={`السبب محدَّد في ${ar(causesTotal)} حريقاً. لم يُحدَّد في ${ar(
            data.causesUnknown
          )} حريقاً — أي ${ar(unknownShare)}٪ من الإجمالي.`}
        >
          <BarChart data={data.causes} tone="gold" />
        </Panel>

        <Panel title="طبيعة موقع الحريق" note="مسجّلة في كل الحرائق">
          <BarChart data={data.inhabited} tone="teal" />
        </Panel>

        <Panel
          title="نوع مكان الحريق"
          note={`مسجّل في ${ar(data.placeTypesCoverage)} حريقاً فقط (${ar(placeShare)}٪)`}
        >
          <BarChart data={data.placeTypes} tone="teal" max={10} />
        </Panel>
      </div>
    </>
  );
}

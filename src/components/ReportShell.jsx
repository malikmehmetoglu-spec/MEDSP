import { useEffect, useState } from 'react';
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

export function Stat({ icon, label, value, unit, note, share, tone }) {
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
export function DimPanel({ dim, tone = 'teal', max, span, donutAt = 3, part, selected, onSelect, highlighting }) {
  if (!dim || dim.data.length === 0) return null;

  const partOf = (label) => part?.data.find((d) => d.label === label)?.value ?? 0;
  const rows = dim.data.map((d) => ({ ...d, key: d.label, part: partOf(d.label) }));

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
        <Donut data={rows} tone={tone} highlighting={highlighting} selected={selected} onSelect={onSelect} />
      ) : (
        <BarChart data={rows} tone={tone} max={max} showShare
          highlighting={highlighting} selected={selected} onSelect={onSelect} />
      )}
    </Panel>
  );
}

/*
  هيكل التقرير المشترك: المرشّحات، الواجهة الرئيسية، والخريطة.
  يتلقى محتواه الخاص من كل تقرير عبر children.
*/
export default function ReportShell({ report, basemap, view }) {
  const [range, setRange] = useState({ from: report.from, to: report.to });
  const [directorate, setDirectorate] = useState(null);
  const [center, setCenter] = useState(null);
  /* الفلترة المتقاطعة: فئة واحدة مميَّزة في كل مرة */
  const [highlight, setHighlight] = useState(null);

  const data = useReportStats(report, range, { directorate, center }, highlight);
  /* البطاقات العلوية تعرض قيم المميَّز، والإجمالي يُذكر تحتها */
  const shown = data.part ?? data;
  const pick = (dim) => (value) => setHighlight(value == null ? null : { dim, value });
  const hlProps = (dim) => ({
    highlighting: Boolean(data.part),
    selected: highlight?.dim === dim ? highlight.value : null,
    onSelect: pick(dim),
  });

  const pickDirectorate = (value) => {
    setDirectorate(value);
    setCenter(null);
  };

  const reset = () => {
    setRange({ from: report.from, to: report.to });
    setDirectorate(null);
    setCenter(null);
    setHighlight(null);
  };

  /* تغيّر المرشّحات يلغي التمييز حتى لا يبقى على فئة لم تعد موجودة */
  useEffect(() => { setHighlight(null); }, [range, directorate, center]);

  const dimTitle = highlight
    ? (highlight.dim === 'gov' ? 'المحافظة' : data.dims[highlight.dim]?.title)
    : '';

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
        unit={view.unit ?? 'عملية'}
      />

      {highlight && data.part && (
        <div className="phl" role="status">
          <Icon name="target" className="phl__icon" />
          <span className="phl__text">
            مميَّز: <b>{dimTitle}</b> = <b>{highlight.value}</b>
            <span className="phl__count">{fmt(data.part.total)} من {fmt(data.total)}</span>
          </span>
          <span className="phl__hint">بقية الأرقام تعرض حصة هذا التحديد، والباقي باهت.</span>
          <button type="button" className="phl__clear" onClick={() => setHighlight(null)}>إلغاء التمييز</button>
        </div>
      )}

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
              <Figure value={shown.total} className="hero__figure" />
              <span className="hero__sub">
                {data.part && <><b className="hero__of">من أصل {fmt(data.total)}</b>{' '}</>}
                في {fmt(shown.locations.length)} موقعاً ضمن{' '}
                {fmt(shown.byGovernorate.length)} محافظة
              </span>
            </div>

            <div className={`hero__side${view.sidePanel ? ' hero__side--panel' : ''}`}>
              {view.stats(shown).map((stat) => (
                <Stat key={stat.label} {...stat} />
              ))}
              {/* لوحة في الصف الأول بعرض بطاقتين (قطاع الخدمة) */}
              {view.sidePanel && (
                <div className="hero__panel">
                  <DimPanel dim={data.dims[view.sidePanel.dim]} tone={view.sidePanel.tone} max={view.sidePanel.max}
                    part={data.part?.dims[view.sidePanel.dim]} {...hlProps(view.sidePanel.dim)} />
                </div>
              )}
            </div>
          </section>

          <div className="panels">
            {view.toll && (
              <Panel title={view.toll.title} note={view.toll.note} span="full">
                <Toll rows={view.toll.rows(shown)} />
              </Panel>
            )}

            {view.panels.map((panel) => (
              <DimPanel
                key={panel.dim}
                dim={data.dims[panel.dim]}
                tone={panel.tone}
                max={panel.max}
                span={panel.span}
                part={data.part?.dims[panel.dim]}
                {...hlProps(panel.dim)}
              />
            ))}

            <Panel
              span="full"
              title="التوزّع الجغرافي"
              note={`${fmt(data.locations.length)} موقعاً مُرمّزاً، مطابقة بإحداثياتها الرسمية`}
            >
              <SyriaMap basemap={basemap} locations={data.locations}
                faded={data.part ? new Set(data.part.locations.map((l) => l.code)) : null}
                onPickGovernorate={(name) => setHighlight(
                  highlight?.dim === 'gov' && highlight.value === name ? null : { dim: 'gov', value: name },
                )} />
            </Panel>

            <Panel title="التوزّع حسب المحافظة" note="مرتّبة تنازلياً" span="wide">
              <BarChart showShare
                data={data.byGovernorate.map((g) => ({
                  ...g, key: g.label,
                  part: data.part?.byGovernorate.find((x) => x.label === g.label)?.value ?? 0,
                }))}
                {...hlProps('gov')} />
            </Panel>

            {view.tail?.map((panel) => (
              <DimPanel key={panel.dim} dim={data.dims[panel.dim]} tone={panel.tone} max={panel.max} span={panel.span}
                part={data.part?.dims[panel.dim]} {...hlProps(panel.dim)} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

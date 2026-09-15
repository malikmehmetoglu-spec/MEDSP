import ReportShell, { DimPanel, Panel, Toll } from './ReportShell';

const fmt = (n) => Number(n).toLocaleString('en-US');

export default function FireReport({ report, basemap }) {
  const hero = (d) => {
    const known = d.dims.cause.coverage - d.dims.cause.excluded;
    const area = d.metrics.area;

    return {
      icon: 'flame',
      eyebrow: 'إجمالي الحرائق المسجّلة',
      stats: [
        {
          icon: 'area',
          tone: 'gold',
          label: 'المساحة المحترقة',
          value: area.sum,
          unit: 'دونم',
          note: `مسجّلة في ${fmt(area.count)} حريقاً`,
          share: d.total ? Math.round((area.count / d.total) * 100) : 0,
        },
        {
          icon: 'clock',
          tone: 'teal',
          label: 'وسيط زمن الوصول',
          value: d.metrics.eta.median,
          unit: 'دقيقة',
          note: 'نصف البلاغات وصلت خلال هذه المدة أو أقل',
          share: 100,
        },
        {
          icon: 'target',
          tone: 'forest',
          label: 'الحرائق محدَّدة السبب',
          value: known,
          unit: 'حريق',
          note: `${d.total ? Math.round((known / d.total) * 100) : 0}% من الإجمالي`,
          share: d.total ? Math.round((known / d.total) * 100) : 0,
        },
      ],
    };
  };

  return (
    <ReportShell report={report} basemap={basemap} hero={hero}>
      {(d) => (
        <>
          <Panel title="الأثر البشري" note="مسجّل في كل بلاغات الإطفاء دون استثناء" span="full">
            <Toll
              rows={[
                { label: 'إصابات المدنيين', value: d.metrics.civInjured.sum, icon: 'civilianHurt' },
                { label: 'وفيات المدنيين', value: d.metrics.civDead.sum, icon: 'civilian' },
                { label: 'إصابات كوادر الوزارة', value: d.metrics.staffInjured.sum, icon: 'staffHurt', staff: true },
                { label: 'وفيات كوادر الوزارة', value: d.metrics.staffDead.sum, icon: 'staff', staff: true },
              ]}
            />
          </Panel>

          <DimPanel dim={d.dims.cause} tone="gold" span="wide" />
          <DimPanel dim={d.dims.inhabited} tone="teal" />
          <DimPanel dim={d.dims.placeType} tone="teal" max={8} span="wide" />
        </>
      )}
    </ReportShell>
  );
}

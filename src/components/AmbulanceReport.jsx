import ReportShell, { DimPanel, Panel, Toll } from './ReportShell';

const fmt = (n) => Number(n).toLocaleString('en-US');

export default function AmbulanceReport({ report, basemap }) {
  const hero = (d) => {
    const toHospital = d.metrics.toHospital;
    const referrals = d.dims.referral.data.find((r) => r.label === 'احالة')?.value ?? 0;

    return {
      icon: 'civilianHurt',
      eyebrow: 'إجمالي بلاغات الإسعاف',
      stats: [
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
          tone: 'gold',
          label: 'وسيط زمن النقل للمشفى',
          value: toHospital.median,
          unit: 'دقيقة',
          note: `مسجّل في ${fmt(toHospital.count)} حالة`,
          share: d.total ? Math.round((toHospital.count / d.total) * 100) : 0,
        },
        {
          icon: 'staff',
          tone: 'forest',
          label: 'الكادر المشارك',
          value: d.metrics.crew.sum,
          unit: 'مشاركة',
          note: 'مجموع مشاركات الكوادر في البلاغات',
          share: 100,
        },
      ],
    };
  };

  return (
    <ReportShell report={report} basemap={basemap} hero={hero}>
      {(d) => {
        const dest = d.dims.destination.data;
        const hospital = dest.find((x) => x.label === 'مشفى')?.value ?? 0;
        const referral = d.dims.referral.data.find((r) => r.label === 'احالة')?.value ?? 0;
        const home = dest.find((x) => x.label === 'منزل')?.value ?? 0;
        const morgue = dest.find((x) => x.label === 'مقبرة')?.value ?? 0;

        return (
          <>
            <Panel title="مآل الحالات" note="إلى أين نُقلت الحالات بعد الإسعاف" span="full">
              <Toll
                rows={[
                  { label: 'نُقلت إلى مشفى', value: hospital, icon: 'civilianHurt' },
                  { label: 'أُسعفت في المنزل', value: home, icon: 'civilian' },
                  { label: 'حالات إحالة', value: referral, icon: 'target', staff: true },
                  { label: 'نقل إلى مقبرة', value: morgue, icon: 'civilian', staff: true },
                ]}
              />
            </Panel>

            <DimPanel dim={d.dims.reason} tone="gold" max={10} span="wide" />
            <DimPanel dim={d.dims.destination} tone="teal" max={7} />
            <DimPanel dim={d.dims.condition} tone="teal" max={10} span="wide" />
            <DimPanel dim={d.dims.referral} tone="gold" />
          </>
        );
      }}
    </ReportShell>
  );
}

import { useMemo, useState } from 'react';
import { buildReport } from './buildReport';
import { Panel, Stat, Toll } from '../components/ReportShell';
import BarChart from '../components/BarChart';
import Donut from '../components/Donut';
import SyriaMap from '../components/SyriaMap';
import Figure from '../components/Figure';
import Icon from '../components/Icon';

/*
  تقرير المشروع — مبني بمكوّنات تقارير المنصة نفسها (hero، panels،
  Stat، Panel، BarChart، Donut، SyriaMap) فيطابقها شكلاً وسلوكاً.

  التخطيط يُشتق من أنواع الأسئلة:
    البطاقة الرئيسية  ← إجمالي السجلات المعتمدة
    البطاقات الجانبية ← أول ثلاثة أسئلة رقمية
    اختيار واحد      ← رسم حلقي (ثلث العرض)
    اختيار متعدد     ← أشرطة (ثلثا العرض)
    مقياس            ← أشرطة مرتبة بالدرجة
    محافظة/ناحية     ← خريطة بعرض كامل + ترتيب المحافظات
    مجموعة متكررة    ← شريط أرقام بعرض كامل
*/

const fmt = (n) => Number(n).toLocaleString('en-US');
const TONES = ['teal', 'forest', 'gold'];
const dmy = (iso) => new Date(iso).toLocaleDateString('en-GB');

function centroid(geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let sx = 0; let sy = 0; let n = 0;
  for (const poly of polys) for (const [x, y] of poly[0]) { sx += x; sy += y; n += 1; }
  return n ? [sx / n, sy / n] : null;
}

function useGeo(block, basemap) {
  return useMemo(() => {
    if (!basemap) return { locations: [], byGov: [] };
    const subs = new Map(basemap.subdistricts.map((x) => [x.code, x]));
    const names = new Map(basemap.governorates.map((g) => [g.code, g.name]));
    const locations = block.geo.bySubdistrict
      .map((d) => {
        const area = subs.get(d.code);
        const c = area && centroid(area.g);
        return c ? { lon: c[0], lat: c[1], name: area.name, count: d.count } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.count - a.count);
    const byGov = block.geo.byGovernorate
      .map((d) => ({ label: names.get(d.code) || d.code, value: d.count }))
      .sort((a, b) => b.value - a.value);
    return { locations, byGov };
  }, [block, basemap]);
}

function MapPanel({ block, basemap }) {
  const { locations } = useGeo(block, basemap);
  if (!basemap) return null;
  return (
    <Panel span="full" title={block.node.label}
      note={`${fmt(locations.length)} ناحية، مطابقة بحدودها الرسمية`}>
      <SyriaMap basemap={basemap} locations={locations} noun="الاستمارات" />
    </Panel>
  );
}

function GovPanel({ block, basemap, span }) {
  const { byGov } = useGeo(block, basemap);
  if (!basemap) return null;
  return (
    <Panel span={span} title="التوزّع حسب المحافظة" note="مرتّبة تنازلياً">
      <BarChart data={byGov} showShare />
    </Panel>
  );
}

/*
  رصّ اللوحات في شبكة ثلاثية بلا فجوات.
  كل لوحة إما ثلث (small) أو ثلثان (wide) أو صف كامل (full).
  نقرن كل wide بـ small في صف واحد، ونجمع الصغيرة ثلاثاً ثلاثاً.
  الصغيرة المتبقية وحدها تتمدد لصف كامل، واثنتان تصيران ثلثاً وثلثين.
*/
function packPanels(items) {
  const full = items.filter((i) => i.span === 'full');
  const wide = items.filter((i) => i.span === 'wide');
  const small = items.filter((i) => !i.span);
  const out = [...full];

  for (const w of wide) {
    out.push(w);
    const partner = small.shift();
    if (partner) out.push(partner);
    else out[out.length - 1] = { ...w, span: 'full' };
  }

  while (small.length >= 3) out.push(...small.splice(0, 3));
  if (small.length === 2) out.push({ ...small[0], span: 'wide' }, small[1]);
  if (small.length === 1) out.push({ ...small[0], span: 'full' });

  return out.map((i) => i.render(i.span));
}

function panelsFor(report, numeric, basemap, nextTone) {
  const items = [];

  for (const b of report.blocks) {
    const key = b.node.name;
    if (b.kind === 'donut') {
      const tone = nextTone();
      items.push({ key, render: (span) => (
        <Panel key={key} span={span} title={b.node.label}
          note={`${fmt(b.dist.reduce((a, d) => a + d.count, 0))} إجابة`}>
          <Donut data={b.dist.map((d) => ({ label: d.label, value: d.count }))} tone={tone} />
        </Panel>
      ) });
    } else if (b.kind === 'bars') {
      const tone = nextTone();
      items.push({ key, span: 'wide', render: (span) => (
        <Panel key={key} span={span} title={b.node.label}
          note={b.node.type === 'rank' ? 'عدد مرات الاختيار' : 'يمكن اختيار أكثر من إجابة'}>
          <BarChart data={b.dist.map((d) => ({ label: d.label, value: d.count }))} tone={tone} showShare />
        </Panel>
      ) });
    } else if (b.kind === 'scale') {
      const tone = nextTone();
      const ordered = [...b.dist].sort((x, y) => Number(x.value) - Number(y.value));
      items.push({ key, render: (span) => (
        <Panel key={key} span={span} title={b.node.label}
          note={`المتوسط ${fmt(b.stats.avg)} من ${b.node.max ?? 5}`}>
          <BarChart data={ordered.map((d) => ({ label: `الدرجة ${d.value}`, value: d.count }))}
            tone={tone} showShare />
        </Panel>
      ) });
    } else if (b.kind === 'repeat') {
      items.push({ key, span: 'full', render: () => (
        <Panel key={key} span="full" title={b.node.label} note="مجموع ما سُجّل في كل الاستمارات">
          <Toll rows={[
            { icon: 't_repeat', label: 'إجمالي المسجّل', value: b.rowCount },
            ...b.sums.map((s) => ({ icon: `t_${s.node.type}`, label: s.node.label, value: s.total })),
          ]} />
        </Panel>
      ) });
    } else if (b.kind === 'map') {
      items.push({ key: `${key}-map`, span: 'full', render: () => (
        <MapPanel key={`${key}-map`} block={b} basemap={basemap} />
      ) });
      items.push({ key: `${key}-gov`, span: 'wide', render: (span) => (
        <GovPanel key={`${key}-gov`} span={span} block={b} basemap={basemap} />
      ) });
    }
  }

  if (numeric.length > 3) {
    items.push({ key: 'more-numbers', span: 'full', render: () => (
      <Panel key="more-numbers" span="full" title="مؤشرات رقمية أخرى" note="المجموع عبر كل الاستمارات">
        <Toll rows={numeric.slice(3).map((b) => ({
          icon: `t_${b.node.type}`, label: b.node.label, value: b.stats.sum,
        }))} />
      </Panel>
    ) });
  }

  return items;
}

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

  if (!survey) return <div className="pending"><h3>لا يوجد استبيان في هذا المشروع</h3></div>;

  const numeric = report.blocks.filter((b) => b.kind === 'stat');
  const side = numeric.slice(0, 3);
  const geo = report.blocks.find((b) => b.kind === 'map');
  const govCount = geo ? geo.geo.byGovernorate.length : 0;
  const dated = responses.map((r) => r.submittedAt).filter(Boolean).sort();

  let tone = 0;
  const nextTone = () => TONES[tone++ % TONES.length];

  return (
    <>
      {project.surveys.length > 1 && (
        <div className="preport__tabs">
          {project.surveys.map((s) => (
            <button key={s.id} type="button"
              className={`preport__tab${s.id === survey.id ? ' is-on' : ''}`}
              onClick={() => setSurveyId(s.id)}>
              {s.title}
            </button>
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
                <Icon name="t_textarea" />
                {survey.title}
              </span>
              <Figure value={report.total} className="hero__figure" />
              <span className="hero__sub">
                استمارة معتمدة
                {govCount > 0 && ` من ${fmt(govCount)} محافظة`}
                {dated.length > 1 && (
                  <>
                    ، جُمعت بين <span className="nowrap" dir="ltr">{dmy(dated[0])}</span>
                    {' '}و<span className="nowrap" dir="ltr">{dmy(dated[dated.length - 1])}</span>
                  </>
                )}
              </span>
            </div>

            {side.length > 0 && (
              <div className={`hero__side hero__side--${side.length}`}>
                {side.map((b, i) => {
                  const t = TONES[i % TONES.length];
                  const share = b.stats.max ? Math.round((b.stats.avg / b.stats.max) * 100) : 0;
                  return (
                    <Stat
                      key={b.node.name}
                      icon={`t_${b.node.type}`}
                      tone={t === 'gold' ? 'teal' : t}
                      label={b.node.label}
                      value={b.stats.sum}
                      unit={b.node.unit || ''}
                      share={share}
                      note={`بمتوسط ${fmt(b.stats.avg)} لكل استمارة، وأعلى قيمة ${fmt(b.stats.max)}`}
                    />
                  );
                })}
              </div>
            )}
          </section>

          <div className="panels">
            {packPanels(panelsFor(report, numeric, basemap, nextTone))}
          </div>
        </>
      )}
    </>
  );
}

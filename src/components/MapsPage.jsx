import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/*
  عارض الخرائط — خرائط منجزة في QGIS تُعرض كما هي تماماً.

  كل طبقة مجموعة بلاطات صور (XYZ) مولّدة من مشروع QGIS نفسه، فالألوان
  والحدود مطابقة بالبكسل. فوقها طبقة نواحٍ شفافة للنقر وقراءة القيم.
  لا خرائط أساس خارجية — كل شيء من ملفات المنصة.

  لإضافة خريطة جديدة: ولّد البلاطات إلى public/maps/<المجموعة>/<الطبقة>
  وأضف مدخلاً في MAPS أدناه.
*/

const BASE = 'maps/multihazard';
/* الخريطة الأساس والتسميات — مولّدتان من مشروع Syria_Basemap_Light في QGIS */
const BASEMAP = 'maps/basemap/syria/{z}/{x}/{y}.jpg';
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

/* تدرّج الهوية البصرية: عاجي ← قمحي ← أحمر دمشقي ← كرزي */
const LEVELS = ['منخفض جداً', 'منخفض', 'متوسط', 'مرتفع', 'مرتفع جداً'];
const RAMP = ['#ebe8d7', '#d3c7a3', '#b9a779', '#6d222d', '#48181d'];
const LEGEND = LEVELS.map((t, i) => [RAMP[i], t]);

const MAPS = [
  { id: 'risk', name: 'خريطة المخاطر — النواحي', note: 'الخطر المركّب مضروباً بقابلية التأثر، مصنّفاً على مستوى الناحية.' },
  { id: 'multihazard', name: 'مؤشر الأخطار المتعددة', note: 'الخطر الزلزالي بوزن 60% وقابلية الفيضان بوزن 40%، بدقة 90 م.' },
  { id: 'seismic', name: 'مؤشر الخطر الزلزالي', note: 'تحليل هرمي متعدد المعايير (AHP)، بدقة 90 م.' },
  { id: 'flood', name: 'مؤشر قابلية الفيضان', note: 'تحليل هرمي متعدد المعايير (AHP)، بدقة 90 م.' },
];

/* حدود الفئات كما في أنماط QGIS لكل مؤشر */
const BREAKS = {
  mh_mean: [0.34, 0.39, 0.454, 0.553, 0.9],
  seis_mean: [0.1, 0.2, 0.32, 0.5, 0.8],
  flood_mean: [0.35, 0.5, 0.6, 0.7, 0.85],
};
const levelOf = (v, br) => {
  let k = 0;
  br.forEach((b, i) => { if (v >= b) k = i; });
  return k;
};

const INDICATORS = [
  { key: 'mh_mean', name: 'الأخطار المتعددة', hint: 'متوسط المؤشر المركّب داخل الناحية' },
  { key: 'seis_mean', name: 'الخطر الزلزالي', hint: 'متوسط مؤشر الخطر الزلزالي' },
  { key: 'flood_mean', name: 'قابلية الفيضان', hint: 'متوسط مؤشر قابلية الفيضان' },
  { key: 'vuln_idx', name: 'قابلية التأثر', hint: 'الكثافة السكانية وحالة المباني' },
];

const fi = (v) => Math.round(v).toLocaleString('en-US');
const pct = (v) => `${(v * 100).toFixed(1)}%`;

const BOUNDS = L.latLngBounds([32.25, 35.55], [37.38, 42.45]);
/* حدود بيانات الخريطة الأساس (التضاريس) — لا يُسمح بالتحريك خارجها فلا تظهر حواف فارغة */
const PAN = L.latLngBounds([32.12, 35.06], [37.79, 42.78]);

function About() {
  return (
    <section className="mabout">
      <div className="mabout__col">
        <h2>عن الخريطة</h2>
        <p>
          تبيّن الخريطة مدى تعرّض كل ناحية من نواحي سوريا الـ 272 لخطرين طبيعيين رئيسيين هما الزلازل والفيضانات،
          ومدى قابلية سكانها ومبانيها للتأثر بهما. كلما اقترب اللون من الأحمر الداكن كان الخطر أعلى،
          وكلما اقترب من العاجي كان أدنى.
        </p>
        <h3>كيف تقرأ الطبقات</h3>
        <ul>
          <li><b>مؤشر الخطر الزلزالي</b> و<b>مؤشر قابلية الفيضان</b>: قيمة لكل خلية مساحتها 90×90 م، من 0 (أدنى) إلى 1 (أعلى).</li>
          <li><b>مؤشر الأخطار المتعددة</b>: يجمع المؤشرين بوزن 60% للزلازل و40% للفيضان.</li>
          <li><b>خريطة المخاطر — النواحي</b>: متوسط الخطر المركّب في الناحية مضروباً بقابلية التأثر (الكثافة السكانية وحالة المباني)، ومصنّف في خمس فئات.</li>
        </ul>
        <h3>المنهجية</h3>
        <p>
          بُنيت المؤشرات بطريقة التحليل الهرمي متعدد المعايير (AHP): يُعطى كل معيار وزناً وفق أهميته،
          ثم تُجمع المعايير الموزونة في مؤشر واحد. اعتمد الخطر الزلزالي على البعد عن الصدوع ومعايير طبوغرافية،
          واعتمدت قابلية الفيضان على الارتفاع والانحدار ومؤشر الرطوبة الطبوغرافي وتراكم الجريان
          والبعد عن الأنهار والمسطحات المائية والسدود.
        </p>
        <p className="mabout__note">
          المؤشرات تقديرية لأغراض التخطيط وترتيب الأولويات، ولا تغني عن الدراسات الميدانية والهندسية التفصيلية.
        </p>
      </div>
      <div className="mabout__col">
        <h2>مصادر البيانات</h2>
        <ul className="mabout__src">
          <li><b>الحدود الإدارية والأسماء:</b> مجموعة الحدود الإدارية المشتركة لسوريا (COD-AB)، الإصدار v02 بتاريخ 17/12/2020، مكتب الأمم المتحدة لتنسيق الشؤون الإنسانية (OCHA).</li>
          <li><b>السكان:</b> التعداد العام للسكان والمساكن 2004، المكتب المركزي للإحصاء.</li>
          <li><b>الارتفاعات والمعايير الطبوغرافية:</b> نموذج ارتفاع رقمي بدقة 90 م، ومنه اشتُقّ الانحدار ومؤشر الرطوبة وتراكم الجريان.</li>
          <li><b>الصدوع والأنهار والمسطحات المائية والسدود:</b> طبقات جغرافية معتمدة في مشروع التحليل.</li>
          <li><b>التحليل والإعداد:</b> مديرية التخطيط والإحصاء، وزارة الطوارئ وإدارة الكوارث، 2026.</li>
        </ul>
      </div>
    </section>
  );
}

function Card({ p, stats }) {
  const rank = stats.rank.get(p.pcode);
  const cls = Math.max(1, Math.min(5, p.risk_class || 1)) - 1;
  const lv = Object.fromEntries(Object.entries(BREAKS).map(([k, br]) => [k, levelOf(p[k], br)]));
  const main = p.seis_mean >= p.flood_mean
    ? `الخطر الزلزالي (${LEVELS[lv.seis_mean]})`
    : `قابلية الفيضان (${LEVELS[lv.flood_mean]})`;
  const pop = p.POP2004 > 0 ? p.POP2004 : null;
  const dens = p.pop_dens > 0 ? p.pop_dens : null;

  return (
    <article className="mcard">
      <header className="mcard__head">
        <div>
          <h3 className="mcard__name">ناحية {p.name}</h3>
          <span className="mcard__where">منطقة {p.district} · محافظة {p.gov}</span>
        </div>
        <span className="mcard__badge" style={{ background: RAMP[cls], color: cls >= 3 ? '#ebe8d7' : '#161616' }}>
          {LEVELS[cls]}
        </span>
      </header>

      <p className="mcard__lead">
        تقع الناحية ضمن فئة الخطر «{LEVELS[cls]}»، وترتيبها <b className="num">{rank}</b> من
        أصل <b className="num">{stats.total}</b> ناحية من حيث مؤشر الخطر النهائي
        (<span className="num">{p.risk_ahp.toFixed(2)}</span>). العامل الطبيعي الأبرز فيها {main}.
      </p>

      <div className="mcard__bars">
        {INDICATORS.map((it) => {
          const v = p[it.key];
          const br = BREAKS[it.key];
          const k = br ? lv[it.key] : null;
          const share = stats.pct[it.key](v);
          return (
            <div className="mbar" key={it.key}>
              <div className="mbar__top">
                <span className="mbar__name">{it.name}</span>
                <span className="mbar__val">
                  {k != null && <em style={{ background: RAMP[k] }} />}
                  {k != null ? LEVELS[k] : `أعلى من ${share}% من النواحي`}
                  <span className="num"> {v.toFixed(2)}</span>
                </span>
              </div>
              <div className="mbar__track"><span style={{ width: `${Math.min(100, v * 100)}%`, background: k != null ? RAMP[Math.max(k, 2)] : 'var(--mountain-teal)' }} /></div>
            </div>
          );
        })}
      </div>

      <dl className="mcard__facts">
        <div><dt>السكان (تعداد 2004)</dt><dd>{pop ? <span className="num">{fi(pop)}</span> : 'غير متوفر'}</dd></div>
        <div><dt>الكثافة السكانية</dt><dd><span className="num">{dens ? fi(dens) : '—'}</span> {dens ? 'نسمة/كم²' : ''}</dd></div>
        <div><dt>مبانٍ هشّة</dt><dd><span className="num">{pct(p.frag_pct)}</span></dd></div>
        <div><dt>مبانٍ قديمة</dt><dd><span className="num">{pct(p.old_pct)}</span></dd></div>
        <div><dt>مبانٍ غير نظامية</dt><dd><span className="num">{pct(p.nonstd_pct)}</span></dd></div>
        <div><dt>الرمز الإداري</dt><dd><span className="num">{p.pcode}</span></dd></div>
      </dl>
    </article>
  );
}

export default function MapsPage() {
  const box = useRef(null);
  const map = useRef(null);
  const tiles = useRef(null);
  const labels = useRef(null);
  const [active, setActive] = useState('risk');
  const [opacity, setOpacity] = useState(0.85);
  const [showLabels, setShowLabels] = useState(true);
  const [info, setInfo] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const m = L.map(box.current, {
      minZoom: 6, maxZoom: 13, zoomSnap: 0.25,
      maxBounds: PAN, maxBoundsViscosity: 1, attributionControl: false, zoomControl: false,
    });
    L.control.zoom({ position: 'topleft' }).addTo(m);
    m.fitBounds(BOUNDS);
    L.tileLayer(BASEMAP, { minZoom: 6, maxZoom: 13, maxNativeZoom: 11, zIndex: 0, errorTileUrl: BLANK }).addTo(m);
    m.createPane('names').style.zIndex = 450;
    m.getPane('names').style.pointerEvents = 'none';
    labels.current = L.layerGroup([], { pane: 'names' }).addTo(m);
    fetch('maps/labels.json').then((r) => r.json()).then((rows) => {
      const marks = rows.map(([lvl, name, lat, lon]) => ({
        lvl,
        m: L.marker([lat, lon], {
          pane: 'names', interactive: false, keyboard: false,
          icon: L.divIcon({ className: `mname mname--${lvl}`, html: `<span>${name}</span>`, iconSize: null }),
        }),
      }));
      /* مستوى واحد لكل تكبير + إخفاء المتداخل: لا يتكرر اسم ولا يتراكب */
      const place = () => {
        const z = m.getZoom();
        const lvl = z < 8 ? 1 : z < 10 ? 2 : 3;
        const g = labels.current;
        g.clearLayers();
        const view = m.getBounds().pad(0.1);
        const taken = [];
        marks.filter((x) => x.lvl === lvl && view.contains(x.m.getLatLng())).forEach((x) => {
          const pt = m.latLngToContainerPoint(x.m.getLatLng());
          const w = x.m.options.icon.options.html.length * (lvl === 1 ? 5.2 : 4.2) + 16;
          const h = lvl === 1 ? 22 : 18;
          const box = [pt.x - w / 2, pt.y - h / 2, pt.x + w / 2, pt.y + h / 2];
          if (taken.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) return;
          taken.push(box);
          g.addLayer(x.m);
        });
      };
      m.on('zoomend moveend', place);
      place();
    });
    map.current = m;

    let sel = null;
    fetch(`${BASE}/subdistricts.geojson`)
      .then((r) => r.json())
      .then((gj) => {
        const ps = gj.features.map((f) => f.properties);
        const order = [...ps].sort((a, b) => b.risk_ahp - a.risk_ahp);
        const pctFn = (k) => {
          const vals = ps.map((x) => x[k]).sort((a, b) => a - b);
          return (v) => Math.round((vals.filter((x) => x < v).length / vals.length) * 100);
        };
        setStats({
          total: ps.length,
          rank: new Map(order.map((x, i) => [x.pcode, i + 1])),
          pct: Object.fromEntries(INDICATORS.map((it) => [it.key, pctFn(it.key)])),
        });
        L.geoJSON(gj, {
          style: { color: 'transparent', weight: 2, fillColor: '#000', fillOpacity: 0 },
          onEachFeature: (f, layer) => {
            layer.bindTooltip(`ناحية ${f.properties.name}`, { direction: 'top', sticky: true, className: 'mtip' });
            layer.on('mouseover', () => { if (layer !== sel) layer.setStyle({ color: '#02443a', weight: 1.5 }); });
            layer.on('mouseout', () => { if (layer !== sel) layer.setStyle({ color: 'transparent' }); });
            layer.on('click', () => {
              if (sel) sel.setStyle({ color: 'transparent', weight: 2 });
              sel = layer;
              layer.setStyle({ color: '#02443a', weight: 3 });
              setInfo(f.properties);
            });
          },
        }).addTo(m);
      })
      .catch(() => {});

    /* أقل تكبير = ما يملأ الإطار بالخريطة الأساس كاملاً */
    const fill = () => {
      m.invalidateSize();
      const z = m.getBoundsZoom(PAN, true);
      m.setMinZoom(z);
      if (m.getZoom() < z) m.setZoom(z);
    };
    fill();
    m.fitBounds(BOUNDS);
    const ro = new ResizeObserver(fill);
    ro.observe(box.current);
    return () => { ro.disconnect(); m.remove(); };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (tiles.current) m.removeLayer(tiles.current);
    tiles.current = L.tileLayer(`${BASE}/${active}/{z}/{x}/{y}.webp`, {
      minZoom: 6, maxZoom: 13, maxNativeZoom: 11, errorTileUrl: BLANK, opacity, zIndex: 1,
    }).addTo(m);
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { tiles.current?.setOpacity(opacity); }, [opacity]);

  useEffect(() => {
    const m = map.current;
    if (!m || !labels.current) return;
    if (showLabels) labels.current.addTo(m); else m.removeLayer(labels.current);
  }, [showLabels]);

  const current = MAPS.find((x) => x.id === active);

  return (
    <div className="mapsview">
      <aside className="mapsview__panel">
        <div className="mapsview__group">
          <span className="mapsview__label">الطبقة</span>
          {MAPS.map((x) => (
            <label key={x.id} className={`mapsview__opt${x.id === active ? ' is-on' : ''}`}>
              <input type="radio" name="maplayer" checked={x.id === active} onChange={() => setActive(x.id)} />
              <span>{x.name}</span>
            </label>
          ))}
          <p className="mapsview__note">{current.note}</p>
        </div>

        <div className="mapsview__group">
          <span className="mapsview__label">مفتاح الخريطة</span>
          <ul className="mapsview__legend">
            {LEGEND.map(([c, t]) => <li key={c}><i style={{ background: c }} />{t}</li>)}
          </ul>
        </div>

        <div className="mapsview__group">
          <div className="mapsview__row">
            <span className="mapsview__label">العرض</span>
            <button type="button" className={`mapsview__toggle${showLabels ? ' is-on' : ''}`}
              aria-pressed={showLabels} onClick={() => setShowLabels((v) => !v)}>
              <span className="mapsview__switch" aria-hidden="true" />
              التسميات
            </button>
          </div>
          <div className="mapsview__row">
            <span className="mapsview__note">شفافية الطبقة</span>
            <span className="mapsview__note num">{Math.round(opacity * 100)}%</span>
          </div>
          <input className="mrange" type="range" min="0.2" max="1" step="0.05" value={opacity}
            style={{ '--fill': `${((opacity - 0.2) / 0.8) * 100}%` }}
            onChange={(e) => setOpacity(Number(e.target.value))} />
        </div>
      </aside>

      <div className="mapsview__main">
        <div className="mapsview__frame">
          <div className="mapsview__map" ref={box} />
          {!info && <p className="mapsview__hint">اضغط على أي ناحية لعرض بطاقتها</p>}
          {info && stats && (
            <div className="mapsview__card">
              <button type="button" className="mapsview__close" aria-label="إغلاق البطاقة" onClick={() => setInfo(null)}>×</button>
              <Card p={info} stats={stats} />
            </div>
          )}
        </div>
        <About />
      </div>
    </div>
  );
}

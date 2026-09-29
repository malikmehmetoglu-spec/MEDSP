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

const MAPS = [
  {
    id: 'risk',
    name: 'خريطة المخاطر — النواحي',
    note: 'خطر مركّب × قابلية التأثر، مصنّف على مستوى الناحية.',
    legend: [
      ['#ffffb2', 'منخفض جداً'], ['#fecc5c', 'منخفض'], ['#fd8d3c', 'متوسط'],
      ['#f03b20', 'مرتفع'], ['#bd0026', 'مرتفع جداً'],
    ],
  },
  {
    id: 'multihazard',
    name: 'مؤشر الأخطار المتعددة',
    note: 'زلازل 60% + فيضان 40%، بدقة 90 م.',
    legend: [
      ['#ffffcc', 'منخفض جداً'], ['#fed976', 'منخفض'], ['#fd8d3c', 'متوسط'],
      ['#e31a1c', 'مرتفع'], ['#800026', 'مرتفع جداً'],
    ],
  },
  {
    id: 'seismic',
    name: 'مؤشر الخطر الزلزالي',
    note: 'تحليل هرمي (AHP)، بدقة 90 م.',
    legend: [
      ['#f7f4f9', 'منخفض جداً'], ['#d4b9da', 'منخفض'], ['#df65b0', 'متوسط'],
      ['#980043', 'مرتفع'], ['#4d004b', 'مرتفع جداً'],
    ],
  },
  {
    id: 'flood',
    name: 'مؤشر قابلية الفيضان',
    note: 'تحليل هرمي (AHP)، بدقة 90 م.',
    legend: [
      ['#f7fbff', 'منخفض جداً'], ['#c6dbef', 'منخفض'], ['#fee08b', 'متوسط'],
      ['#fc8d59', 'مرتفع'], ['#b30000', 'مرتفع جداً'],
    ],
  },
];

const CLASS = ['', 'منخفض جداً', 'منخفض', 'متوسط', 'مرتفع', 'مرتفع جداً'];
const f2 = (v) => (v == null ? '—' : Number(v).toFixed(2));
const fi = (v) => (v == null ? '—' : Math.round(v).toLocaleString('en-US'));
const fp = (v) => (v == null ? '—' : `${Number(v).toFixed(1)}%`);

const BOUNDS = L.latLngBounds([32.25, 35.55], [37.38, 42.45]);

export default function MapsPage() {
  const box = useRef(null);
  const map = useRef(null);
  const tiles = useRef(null);
  const hit = useRef(null);
  const [active, setActive] = useState('risk');
  const [opacity, setOpacity] = useState(1);
  const [info, setInfo] = useState(null);

  /* إنشاء الخريطة مرة واحدة */
  useEffect(() => {
    const m = L.map(box.current, {
      minZoom: 6, maxZoom: 13, zoomSnap: 0.5,
      maxBounds: BOUNDS.pad(0.4), attributionControl: false, zoomControl: false,
    });
    L.control.zoom({ position: 'topleft' }).addTo(m);
    m.fitBounds(BOUNDS);
    map.current = m;

    let sel = null;
    fetch(`${BASE}/subdistricts.geojson`)
      .then((r) => r.json())
      .then((gj) => {
        hit.current = L.geoJSON(gj, {
          style: { color: 'transparent', weight: 2, fillColor: '#000', fillOpacity: 0 },
          onEachFeature: (f, layer) => {
            layer.on('mouseover', () => { if (layer !== sel) layer.setStyle({ color: '#ffffff', weight: 1.5 }); });
            layer.on('mouseout', () => { if (layer !== sel) layer.setStyle({ color: 'transparent' }); });
            layer.on('click', () => {
              if (sel) sel.setStyle({ color: 'transparent', weight: 2 });
              sel = layer;
              layer.setStyle({ color: '#161616', weight: 2.5 });
              setInfo(f.properties);
            });
          },
        }).addTo(m);
      })
      .catch(() => {});

    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(box.current);
    return () => { ro.disconnect(); m.remove(); };
  }, []);

  /* تبديل الطبقة */
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (tiles.current) m.removeLayer(tiles.current);
    tiles.current = L.tileLayer(`${BASE}/${active}/{z}/{x}/{y}.webp`, {
      minZoom: 6, maxZoom: 13, minNativeZoom: 6, maxNativeZoom: 11,
      bounds: BOUNDS, errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
      opacity,
    }).addTo(m);
    tiles.current.bringToBack();
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { tiles.current?.setOpacity(opacity); }, [opacity]);

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
            {current.legend.map(([c, t]) => (
              <li key={c}><i style={{ background: c }} />{t}</li>
            ))}
          </ul>
        </div>

        <div className="mapsview__group">
          <span className="mapsview__label">الشفافية</span>
          <input type="range" min="0.2" max="1" step="0.05" value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))} />
        </div>

        <div className="mapsview__group mapsview__info">
          <span className="mapsview__label">الناحية</span>
          {!info && <p className="mapsview__note">اضغط على أي ناحية لعرض مؤشراتها.</p>}
          {info && (
            <>
              <strong className="mapsview__place">{info.ADM3_NAME}</strong>
              <span className="mapsview__note">{info.ADM2_NAME} — {info.ADM1_NAME}</span>
              <dl>
                <dt>فئة الخطر</dt><dd>{CLASS[info.risk_class] || '—'}</dd>
                <dt>مؤشر الخطر (AHP)</dt><dd className="num">{f2(info.risk_ahp)}</dd>
                <dt>الأخطار المتعددة</dt><dd className="num">{f2(info.mh_mean)}</dd>
                <dt>الخطر الزلزالي</dt><dd className="num">{f2(info.seis_mean)}</dd>
                <dt>قابلية الفيضان</dt><dd className="num">{f2(info.flood_mean)}</dd>
                <dt>قابلية التأثر</dt><dd className="num">{f2(info.vuln_idx)}</dd>
                <dt>السكان (2004)</dt><dd className="num">{fi(info.POP2004)}</dd>
                <dt>الكثافة السكانية</dt><dd className="num">{fi(info.pop_dens)}</dd>
                <dt>مبانٍ هشّة</dt><dd className="num">{fp(info.frag_pct)}</dd>
                <dt>مبانٍ قديمة</dt><dd className="num">{fp(info.old_pct)}</dd>
                <dt>مبانٍ غير نظامية</dt><dd className="num">{fp(info.nonstd_pct)}</dd>
              </dl>
            </>
          )}
        </div>
      </aside>
      <div className="mapsview__map" ref={box} />
    </div>
  );
}

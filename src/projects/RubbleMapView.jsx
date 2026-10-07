import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Dropdown from '../components/Dropdown';

/*
  الخريطة الوطنية لإدارة الأنقاض — نسخة الويب من مشروع QGIS (MAPS/RubbleMap).
  البيانات: public/maps/rubble/rubble-map.json (مصدّرة من RubbleMap.gpkg).
  الطبقات تظهر بالتدريج حسب التكبير كما في QGIS:
    الوطني: نسبة الإنجاز لكل محافظة + دوائر المنفّذ لكل ناحية
    التكبير: المكبات، ثم مواقع العمل وخطوط الترحيل والآليات، ثم حدود النواحي
  الخطة معتمدة على مستوى المحافظة: المستويات الأدق تعرض المنفّذ فقط.
*/

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
const BOUNDS = L.latLngBounds([32.25, 35.55], [37.38, 42.45]);
const PAN = L.latLngBounds([31.2, 33.8], [38.4, 44.2]);
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';

/* فئات نسبة الإنجاز — نفس فئات QGIS */
const BINS = [
  { k: 'none', label: 'خارج خطة 2026', test: (p) => !p.planned_m3, fill: 'transparent' },
  { k: 'zero', label: 'مخطط — لم يبدأ التنفيذ', test: (p) => p.planned_m3 > 0 && !p.pct, fill: '#efe6cc', hatch: true },
  { k: 'lt50', label: 'أقل من ‎50%‎', test: (p) => p.pct > 0 && p.pct < 50, fill: '#c9ddd7' },
  { k: 'b50', label: '‎50% – 70%‎', test: (p) => p.pct >= 50 && p.pct < 70, fill: '#7fb0a6' },
  { k: 'b70', label: '‎70% – 90%‎', test: (p) => p.pct >= 70 && p.pct < 90, fill: '#428177' },
  { k: 'b90', label: '‎90%‎ فأكثر', test: (p) => p.pct >= 90, fill: '#02443a' },
];
const binOf = (p) => BINS.find((b) => b.test(p)) || BINS[0];

/* منحنى ترحيل: قوس تربيعي بين الموقع والمكب */
function arc(a, b) {
  const mx = (a[0] + b[0]) / 2 - (b[1] - a[1]) * 0.18;
  const my = (a[1] + b[1]) / 2 + (b[0] - a[0]) * 0.18;
  const pts = [];
  for (let t = 0; t <= 1.0001; t += 0.125) {
    const u = 1 - t;
    pts.push([u * u * a[0] + 2 * u * t * mx + t * t * b[0], u * u * a[1] + 2 * u * t * my + t * t * b[1]]);
  }
  return pts;
}

const row = (k, v) => (v === null || v === undefined || v === '' ? '' : `<tr><th>${k}</th><td>${v}</td></tr>`);
const card = (title, sub, rows) => `<div class="rmap-pop"><header><b>${title || ''}</b><small>${sub || ''}</small></header><table>${rows}</table></div>`;

export default function RubbleMapView() {
  const box = useRef(null);
  const map = useRef(null);
  const groups = useRef({});
  const svg = useRef(null);
  const [data, setData] = useState(null);
  const [sel, setSel] = useState({ gov: '', dis: '', sub: '' });
  const [zoom, setZoom] = useState(7);
  const [show, setShow] = useState({ sites: true, dumps: true, flows: true, machinery: true });

  useEffect(() => {
    fetch('maps/rubble/rubble-map.json').then((r) => r.json()).then(setData).catch(() => setData(false));
  }, []);

  /* إنشاء الخريطة مرة واحدة */
  useEffect(() => {
    if (!box.current || map.current) return undefined;
    const m = L.map(box.current, {
      minZoom: 6, maxZoom: 15, zoomSnap: 0.25,
      maxBounds: PAN, maxBoundsViscosity: 0.8, attributionControl: false, zoomControl: false,
    });
    L.control.zoom({ position: 'topleft' }).addTo(m);
    L.control.attribution({ position: 'bottomleft', prefix: false }).addAttribution('خريطة الأساس: Esri').addTo(m);
    m.fitBounds(BOUNDS);
    L.tileLayer(`${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, { maxNativeZoom: 16, zIndex: 1 }).addTo(m);
    m.createPane('relief').style.zIndex = 210;
    m.getPane('relief').classList.add('rmap-relief');
    L.tileLayer(`${ESRI}/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}`, { pane: 'relief', maxNativeZoom: 13, opacity: 0.55 }).addTo(m);
    for (const [name, z] of [['admin', 400], ['bubbles', 420], ['flows', 430], ['points', 440], ['labels', 460]]) {
      m.createPane(name).style.zIndex = z;
    }
    m.getPane('labels').style.pointerEvents = 'none';
    /* المحافظات بـ SVG حتى يعمل التظليل المائل لفئة «لم يبدأ التنفيذ» */
    svg.current = L.svg({ pane: 'admin' }).addTo(m);
    const root = svg.current._container;
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = '<pattern id="rmap-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#efe6cc"/><line x1="0" y1="0" x2="0" y2="7" stroke="#b9a779" stroke-width="1.6"/></pattern>';
    root.prepend(defs);
    m.on('zoomend', () => setZoom(m.getZoom()));
    setZoom(m.getZoom());
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, []);

  const pick = (f) => (!sel.gov || f.adm1_pcode === sel.gov) && (!sel.dis || f.adm2_pcode === sel.dis) && (!sel.sub || f.adm3_pcode === sel.sub);

  /* المؤشرات للمستوى المختار */
  const kpi = useMemo(() => {
    if (!data) return null;
    const sites = data.sites.features.map((f) => f.properties).filter(pick);
    const dumps = data.dumps.features.filter((f) => pick(f.properties)).length;
    const govs = data.governorates.features.map((f) => f.properties).filter((p) => p.planned_m3 && (!sel.gov || p.adm1_pcode === sel.gov));
    const planned = govs.reduce((a, p) => a + p.planned_m3, 0);
    const executed = govs.reduce((a, p) => a + p.executed_m3, 0);
    const fine = Boolean(sel.dis);
    return {
      planned: fine ? null : planned || null,
      executed: fine || !planned ? sites.reduce((a, s) => a + (s.volume_m3 || 0), 0) : executed,
      remaining: fine || !planned ? null : Math.max(planned - executed, 0),
      pct: fine || !planned ? null : (executed / planned) * 100,
      sites: sites.length, active: sites.filter((s) => s.active === 1).length, dumps,
      cos: new Set(sites.map((s) => s.contractor)).size,
      note: fine ? 'الخطة معتمدة على مستوى المحافظة، لذلك يُعرض المنفّذ فقط في المستويات الأدق.'
        : sel.gov && !planned ? 'هذه المحافظة خارج خطة 2026.' : '',
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, sel]);

  /* رسم الطبقات */
  useEffect(() => {
    const m = map.current;
    if (!m || !data) return;
    Object.values(groups.current).forEach((g) => g.remove());
    const G = {};
    const z = zoom;
    const scaleS = (v) => Math.min(2.5 + Math.sqrt(v || 0) / 6, 13);

    /* المحافظات: نسبة الإنجاز، وتخفت عند التكبير */
    G.gov = L.geoJSON(data.governorates, {
      pane: 'admin', renderer: svg.current,
      style: (f) => {
        const b = binOf(f.properties);
        const on = !sel.gov || f.properties.adm1_pcode === sel.gov;
        return {
          color: '#02443a', weight: on && sel.gov ? 2.2 : 1.2, fillColor: b.fill,
          fillOpacity: b.k === 'none' ? 0 : (z >= 8.5 ? 0.16 : on ? 0.62 : 0.2),
          className: b.hatch && z < 8.5 ? 'rmap-hatch' : '',
        };
      },
      onEachFeature: (f, l) => {
        const p = f.properties;
        l.bindPopup(card(p.adm1_name1, p.phases || 'خارج خطة 2026',
          row('المخطط لها', p.planned_m3 ? `${fmt(p.planned_m3)} م³` : '—')
          + row('المنفّذة', p.planned_m3 ? `${fmt(p.executed_m3)} م³` : `${fmt(p.executed_sites_m3)} م³`)
          + row('المتبقية', p.planned_m3 ? `${fmt(p.remaining_m3)} م³` : '—')
          + row('نسبة الإنجاز', p.planned_m3 ? `<span dir="ltr">${(p.pct || 0).toFixed(1)}%</span>` : '—')
          + row('مواقع العمل', `${fmt(p.sites)} (نشط: ${fmt(p.active_sites)})`) + row('المكبات', fmt(p.dumps))));
        l.on('click', () => setSel({ gov: p.adm1_pcode, dis: '', sub: '' }));
      },
    });

    if (z >= 8 || sel.gov) {
      G.dis = L.geoJSON({ ...data.districts, features: data.districts.features.filter((f) => !sel.gov || f.properties.adm1_pcode === sel.gov) }, {
        pane: 'admin', interactive: z >= 8,
        style: (f) => ({ color: '#428177', weight: f.properties.adm2_pcode === sel.dis ? 2.2 : 0.9, dashArray: '5 4', fill: true, fillOpacity: 0 }),
        onEachFeature: (f, l) => {
          const p = f.properties;
          l.bindPopup(card(`منطقة ${p.adm2_name1}`, '', row('المنفّذ', `${fmt(p.executed_sites_m3)} م³`) + row('مواقع العمل', fmt(p.sites)) + row('المكبات', fmt(p.dumps))));
        },
      });
    }
    if (z >= 9.5 || sel.dis) {
      G.sub = L.geoJSON({ ...data.subdistricts, features: data.subdistricts.features.filter((f) => (!sel.gov || f.properties.adm1_pcode === sel.gov) && (!sel.dis || f.properties.adm2_pcode === sel.dis)) }, {
        pane: 'admin',
        style: (f) => ({ color: '#958563', weight: f.properties.adm3_pcode === sel.sub ? 2 : 0.6, dashArray: '1 3', fill: true, fillOpacity: 0 }),
        onEachFeature: (f, l) => {
          const p = f.properties;
          l.bindPopup(card(`ناحية ${p.adm3_name1}`, '', row('المنفّذ', `${fmt(p.executed_sites_m3)} م³`) + row('آخر 30 يوماً', `${fmt(p.active_m3)} م³`) + row('مواقع العمل', fmt(p.sites))));
        },
      });
    }

    /* المشهد الوطني: دوائر المنفّذ لكل ناحية */
    if (z < 9) {
      G.bub = L.layerGroup(data.subdistricts.features.filter((f) => f.properties.executed_sites_m3 > 0 && pick(f.properties)).map((f) => {
        const p = f.properties;
        return L.circleMarker(p.c, { pane: 'bubbles', radius: 3 + Math.sqrt(p.executed_sites_m3) / 26, color: '#fbfaf4', weight: 1, fillColor: '#428177', fillOpacity: 0.68 })
          .bindPopup(card(`ناحية ${p.adm3_name1}`, '', row('المنفّذ', `${fmt(p.executed_sites_m3)} م³`) + row('آخر 30 يوماً', `${fmt(p.active_m3)} م³`) + row('مواقع العمل', fmt(p.sites))));
      }));
    }

    if (z >= 9) {
      if (show.flows) {
        const gName = sel.gov && data.governorates.features.find((f) => f.properties.adm1_pcode === sel.gov)?.properties.adm1_name1;
        const dName = sel.dis && data.districts.features.find((f) => f.properties.adm2_pcode === sel.dis)?.properties.adm2_name1;
        G.flows = L.layerGroup(data.flows.filter((r) => (!gName || r[6] === gName) && (!dName || r[7] === dName)).map((r) => L.polyline(arc([r[0], r[1]], [r[2], r[3]]), {
          pane: 'flows', color: '#958563', opacity: 0.5, weight: Math.min(0.6 + Math.sqrt(r[4] || 0) / 30, 3.5), interactive: false,
        })));
      }
      if (show.sites) {
        G.sites = L.layerGroup(data.sites.features.filter((f) => pick(f.properties)).sort((a, b) => a.properties.active - b.properties.active).map((f) => {
          const p = f.properties; const [lon, lat] = f.geometry.coordinates;
          const act = p.active === 1;
          return L.circleMarker([lat, lon], {
            pane: 'points', radius: scaleS(p.volume_m3), color: act ? '#6d222d' : '#ffffff', weight: act ? 2 : 0.8,
            fillColor: act ? '#6d222d' : '#428177', fillOpacity: act ? 0.85 : 0.72,
          }).bindPopup(card(p.address || 'موقع عمل', [p.village, p.adm3_name1, p.adm1_name1].filter(Boolean).join(' · '),
            row('الحالة', act ? '<em class="is-act">نشط</em>' : 'منجز') + row('الكمية', `${fmt(p.volume_m3)} م³`) + row('الجهة المنفذة', p.contractor)
            + row('طبيعة الموقع', p.nature) + row('المكب', [p.dump_name, p.distance].filter(Boolean).join(' · ')) + row('التاريخ', p.date) + row('المرحلة', p.phase)));
        }));
      }
    }
    if (show.dumps && (z >= 8 || sel.gov)) {
      G.dumps = L.layerGroup(data.dumps.features.filter((f) => pick(f.properties)).map((f) => {
        const p = f.properties; const [lon, lat] = f.geometry.coordinates;
        const ok = p.status === 'معتمد';
        const s = Math.round(Math.min((ok ? 9 : 7) + Math.sqrt(p.received_m3 || 0) / (ok ? 9 : 14), ok ? 26 : 16));
        return L.marker([lat, lon], {
          pane: 'points', icon: L.divIcon({ className: `rmap-dump${ok ? '' : ' is-prop'}`, html: '<i></i>', iconSize: [s, s] }),
        }).bindPopup(card(p.dump_name, `${p.status} · ${[p.adm3_name1, p.adm1_name1].filter(Boolean).join(' · ')}`,
          row('الكمية المستقبلة', `${fmt(p.received_m3)} م³`) + row('المواقع المرحّل منها', fmt(p.sites)) + row('المناطق المخدومة', p.areas)
          + row('الجهات', p.contractors) + row('آخر ترحيل', p.last_date)));
      }));
    }
    if (show.machinery && z >= 10) {
      G.mach = L.layerGroup(data.machinery.features.filter((f) => pick(f.properties)).map((f) => {
        const p = f.properties; const [lon, lat] = f.geometry.coordinates;
        return L.marker([lat, lon], { pane: 'points', icon: L.divIcon({ className: 'rmap-mach', html: '⚙', iconSize: [18, 18] }) })
          .bindPopup(card(p.contractor, [p.adm3_name1, p.adm1_name1].filter(Boolean).join(' · '),
            row('مواقع العمل', fmt(p.sites)) + row('أكبر عدد آليات', p.max_machines || '—') + row('أكبر سعة', p.max_capacity || '—')
            + row('ساعات العمل', p.total_hours ? fmt(p.total_hours) : '—') + row('الكمية', `${fmt(p.volume_m3)} م³`)));
      }));
    }

    /* أسماء المحافظات ونسبها في المشهد الوطني */
    if (z < 8.5) {
      G.labels = L.layerGroup(data.governorates.features.map((f) => {
        const p = f.properties;
        const pct = p.pct > 0 ? `<small dir="ltr">${p.pct.toFixed(1)}%</small>` : p.planned_m3 ? '<small>لم يبدأ التنفيذ</small>' : '';
        return L.marker(p.c, { pane: 'labels', interactive: false, icon: L.divIcon({ className: 'rmap-label', html: `<span>${p.adm1_name1}${pct}</span>`, iconSize: null }) });
      }));
    } else if (z >= 9.5) {
      G.labels = L.layerGroup(data.subdistricts.features.filter((f) => pick(f.properties) || !sel.gov).map((f) => L.marker(f.properties.c, {
        pane: 'labels', interactive: false, icon: L.divIcon({ className: 'rmap-label rmap-label--sub', html: `<span>${f.properties.adm3_name1}</span>`, iconSize: null }),
      })));
    } else {
      G.labels = L.layerGroup(data.districts.features.filter((f) => !sel.gov || f.properties.adm1_pcode === sel.gov).map((f) => L.marker(f.properties.c, {
        pane: 'labels', interactive: false, icon: L.divIcon({ className: 'rmap-label rmap-label--dis', html: `<span>${f.properties.adm2_name1}</span>`, iconSize: null }),
      })));
    }

    Object.values(G).forEach((g) => g.addTo(m));
    groups.current = G;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, zoom, sel, show]);

  /* التكبير على الاختيار */
  useEffect(() => {
    const m = map.current;
    if (!m || !data) return;
    const [layer, key, code] = sel.sub ? ['subdistricts', 'adm3_pcode', sel.sub] : sel.dis ? ['districts', 'adm2_pcode', sel.dis] : sel.gov ? ['governorates', 'adm1_pcode', sel.gov] : [];
    if (!layer) { m.flyToBounds(BOUNDS, { duration: 0.6 }); return; }
    const f = data[layer].features.find((x) => x.properties[key] === code);
    if (f) m.flyToBounds(L.geoJSON(f).getBounds(), { padding: [30, 30], duration: 0.6 });
  }, [sel, data]);

  const opts = (layer, nameKey, codeKey, filter) => (data ? data[layer].features.map((f) => f.properties).filter(filter)
    .map((p) => ({ value: p[codeKey], label: p[nameKey] })).sort((a, b) => a.label.localeCompare(b.label, 'ar')) : []);

  if (data === false) return <p className="hub-empty">تعذّر تحميل بيانات الخريطة.</p>;

  return (
    <section className="rmap">
      <header className="rmap-head">
        <div>
          <h3>الخريطة الوطنية لإدارة الأنقاض</h3>
          <p>مواقع العمل والمكبات وخطوط الترحيل والآليات، مع نسبة إنجاز خطة 2026 لكل محافظة.{data && <> آخر بيان: <span dir="ltr">{data.meta.dataLast}</span></>}</p>
        </div>
        <div className="rmap-filters">
          <Dropdown label="المحافظة" placeholder="كل المحافظات" value={sel.gov}
            onChange={(v) => setSel({ gov: v || '', dis: '', sub: '' })}
            options={opts('governorates', 'adm1_name1', 'adm1_pcode', () => true)} />
          <Dropdown label="المنطقة" placeholder="كل المناطق" value={sel.dis}
            onChange={(v) => setSel((s) => ({ ...s, dis: v || '', sub: '' }))}
            options={sel.gov ? opts('districts', 'adm2_name1', 'adm2_pcode', (p) => p.adm1_pcode === sel.gov) : []} />
          <Dropdown label="الناحية" placeholder="كل النواحي" value={sel.sub}
            onChange={(v) => setSel((s) => ({ ...s, sub: v || '' }))}
            options={sel.dis ? opts('subdistricts', 'adm3_name1', 'adm3_pcode', (p) => p.adm2_pcode === sel.dis) : []} />
          {(sel.gov || sel.dis || sel.sub) && <button type="button" className="rmap-reset" onClick={() => setSel({ gov: '', dis: '', sub: '' })}>سوريا كاملة</button>}
        </div>
      </header>

      <div className="rmap-body">
        <div className="rmap-canvas">
          <div ref={box} className="rmap-map" />
          {!data && <div className="rmap-loading">جارٍ تحميل الخريطة…</div>}
          <div className="rmap-toggles">
            {[['sites', 'مواقع العمل'], ['dumps', 'المكبات'], ['flows', 'خطوط الترحيل'], ['machinery', 'الآليات']].map(([k, l]) => (
              <label key={k}><input type="checkbox" checked={show[k]} onChange={() => setShow((s) => ({ ...s, [k]: !s[k] }))} />{l}</label>
            ))}
          </div>
          {zoom < 9 && <div className="rmap-hint">كبّر الخريطة أو اختر محافظة لعرض مواقع العمل والمكبات</div>}
        </div>

        <aside className="rmap-side">
          {kpi && (
            <div className="rmap-kpi">
              <h4>{sel.sub ? 'الناحية المختارة' : sel.dis ? 'المنطقة المختارة' : sel.gov ? 'المحافظة المختارة' : 'مؤشرات التنفيذ — خطة 2026'}</h4>
              <dl>
                <div><dt>الكمية المخطط لها</dt><dd>{kpi.planned ? <>{fmt(kpi.planned)} <small>م³</small></> : '—'}</dd></div>
                <div className="is-exe"><dt>الكمية المنفّذة</dt><dd>{fmt(kpi.executed)} <small>م³</small></dd></div>
                <div className="is-rem"><dt>الكمية المتبقية</dt><dd>{kpi.remaining != null ? <>{fmt(kpi.remaining)} <small>م³</small></> : '—'}</dd></div>
              </dl>
              {kpi.pct != null && (
                <div className="rmap-prog"><span><i style={{ width: `${Math.min(100, kpi.pct)}%` }} /></span><b dir="ltr">{kpi.pct.toFixed(1)}%</b></div>
              )}
              <ul className="rmap-counts">
                <li><b>{fmt(kpi.sites)}</b>موقع عمل</li>
                <li><b>{fmt(kpi.active)}</b>نشط</li>
                <li><b>{fmt(kpi.dumps)}</b>مكب</li>
                <li><b>{fmt(kpi.cos)}</b>جهة منفذة</li>
              </ul>
              {kpi.note && <p className="rmap-note">{kpi.note}</p>}
            </div>
          )}

          <div className="rmap-legend">
            <h4>مفتاح الخريطة</h4>
            <p>نسبة الإنجاز حسب المحافظة</p>
            <ul>
              {BINS.map((b) => (
                <li key={b.k}><i className={`sw${b.hatch ? ' sw--hatch' : ''}`} style={{ background: b.hatch ? undefined : b.fill }} />{b.label}</li>
              ))}
            </ul>
            <p>العناصر</p>
            <ul>
              <li><i className="dot" />الكمية المنفّذة حسب الناحية</li>
              <li><i className="dot dot--done" />موقع منجز</li>
              <li><i className="dot dot--act" />موقع عمل نشط (آخر 30 يوماً)</li>
              <li><i className="dia" />مكب معتمد</li>
              <li><i className="dia dia--prop" />مكب مقترح من الجهة المحلية</li>
              <li><i className="flow" />خط ترحيل إلى المكب</li>
              <li><i className="mach">⚙</i>الآليات والجهات المشغّلة</li>
            </ul>
            <small>حجم الرمز يتناسب مع الكمية. المصادر: استمارات الترحيل الميدانية، التقرير المرحلي <span dir="ltr">{data?.meta.planAsOf}</span>.</small>
          </div>
        </aside>
      </div>
    </section>
  );
}

/*
  تجهيز طبقات الخريطة للويب.

  يُنفَّذ مرة واحدة عند تحديث الحدود من QGIS:
    1. صدّر الطبقات من QGIS بصيغة GeoJSON ونظام EPSG:4326
    2. ضعها في مجلد data/geo/
    3. نفّذ: npm run geo

  ما يفعله: يبسّط الحدود، ويقلّم الحقول، ويستبعد المسطحات الصغيرة،
  فينخفض الحجم من نحو ١٠ ميغابايت إلى بضع مئات الكيلوبايت
  دون فرق يُلاحظ على الشاشة.
*/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const geoDir = path.join(root, '..', 'data', 'geo');
const outFile = path.join(root, '..', 'public', 'data', 'basemap.json');

/* درجة التبسيط بالدرجات الجغرافية — كلما كبرت قلّت التفاصيل */
const TOLERANCE = {
  country: 0.006,
  governorates: 0.005,
  subdistricts: 0.0035,
  water: 0.004,
};

/* أصغر مساحة مسطح مائي يُعرض (بالدرجات المربعة) */
const MIN_WATER_AREA = 0.0004;

const read = (name) =>
  JSON.parse(fs.readFileSync(path.join(geoDir, `${name}.geojson`), 'utf8'));

/* تبسيط خط مغلق بخوارزمية Douglas–Peucker */
function simplifyRing(ring, tolerance) {
  if (!Array.isArray(ring) || ring.length <= 4) return ring ?? [];

  const keep = new Array(ring.length).fill(false);
  keep[0] = true;
  keep[ring.length - 1] = true;

  const stack = [[0, ring.length - 1]];

  while (stack.length) {
    const [first, last] = stack.pop();
    let maxDist = 0;
    let index = 0;

    const [x1, y1] = ring[first];
    const [x2, y2] = ring[last];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;

    for (let i = first + 1; i < last; i += 1) {
      const [px, py] = ring[i];
      let dist;
      if (len2 === 0) {
        dist = Math.hypot(px - x1, py - y1);
      } else {
        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
        dist = Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
      }
      if (dist > maxDist) {
        maxDist = dist;
        index = i;
      }
    }

    if (maxDist > tolerance) {
      keep[index] = true;
      stack.push([first, index], [index, last]);
    }
  }

  const out = ring.filter((_, i) => keep[i]);
  /* المضلع يحتاج أربع نقاط على الأقل ليبقى مغلقاً */
  return out.length >= 4 ? out : ring;
}

const round = (ring) =>
  ring.map(([x, y]) => [Number(x.toFixed(4)), Number(y.toFixed(4))]);

function simplifyGeometry(geometry, tolerance) {
  if (!geometry) return null;

  const polygons =
    geometry.type === 'Polygon'
      ? [geometry.coordinates]
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates
        : null;

  if (!polygons) return null;

  const cleaned = [];

  for (const polygon of polygons) {
    /* الحلقة الخارجية فقط — الجزر الداخلية تُهمل لتخفيف الحجم */
    if (!Array.isArray(polygon) || !Array.isArray(polygon[0])) continue;
    const outer = round(simplifyRing(polygon[0], tolerance));
    if (outer.length >= 4) cleaned.push([outer]);
  }

  if (cleaned.length === 0) return null;
  return cleaned.length === 1
    ? { type: 'Polygon', coordinates: cleaned[0] }
    : { type: 'MultiPolygon', coordinates: cleaned };
}

/* مساحة تقريبية بالدرجات المربعة */
function areaOf(geometry) {
  const polygons =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;

  let total = 0;
  for (const polygon of polygons) {
    const ring = polygon[0];
    let sum = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      sum += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
    }
    total += Math.abs(sum / 2);
  }
  return total;
}

function build(name, pick) {
  const source = read(name);
  const tolerance = TOLERANCE[name];
  const features = [];

  for (const feature of source.features) {
    const geometry = simplifyGeometry(feature.geometry, tolerance);
    if (!geometry) continue;
    features.push({ ...pick(feature.properties), g: geometry });
  }

  return features;
}

function run() {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });

  const country = build('country', () => ({}));

  const governorates = build('governorates', (p) => ({
    code: p.adm1_pcode,
    name: p.adm1_name1 || p.adm1_name,
  }));

  const subdistricts = build('subdistricts', (p) => ({
    code: p.adm3_pcode,
    name: p.adm3_name1 || p.adm3_name,
    parent: p.adm1_pcode,
  }));

  const water = build('water', (p) => ({ name: p.name_ar || '' })).filter(
    (f) => areaOf(f.g) >= MIN_WATER_AREA
  );

  const payload = { country, governorates, subdistricts, water };
  fs.writeFileSync(outFile, JSON.stringify(payload));

  const kb = (fs.statSync(outFile).size / 1024).toFixed(0);
  console.log(`  خلفية الدولة: ${country.length}`);
  console.log(`  المحافظات: ${governorates.length}`);
  console.log(`  النواحي: ${subdistricts.length}`);
  console.log(`  مسطحات مائية: ${water.length} (بعد استبعاد الصغيرة)`);
  console.log(`  ✓ basemap.json (${kb} كيلوبايت)`);
}

run();

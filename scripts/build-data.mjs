/*
  معالجة ملف التصدير الشهري.

  الاستخدام:
    1. ضع ملف التصدير في المجلد data/ (مثال: data/August_2026.xlsx)
    2. نفّذ: npm run data
    3. يُنتج الملفات في public/data/ ويتحدث التقرير تلقائياً

  الملف المرجعي data/syr_admin_boundaries.xlsx يربط ترميز المنطقة بالإحداثيات.
*/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(root, '..', 'data');
const outDir = path.join(root, '..', 'public', 'data');

const REF_FILE = 'syr_admin_boundaries.xlsx';

const num = (v) => {
  const n = Number(String(v ?? '').trim());
  return Number.isFinite(n) ? n : 0;
};

const clean = (v) => String(v ?? '').trim();

/* ---------- الملف المرجعي: ترميز المنطقة ← إحداثيات ---------- */

function loadPlaces() {
  const wb = XLSX.readFile(path.join(dataDir, REF_FILE));
  const places = new Map();

  for (const row of XLSX.utils.sheet_to_json(wb.Sheets.syr_populatedplaces)) {
    const code = clean(row.pcode);
    if (!code) continue;
    places.set(code, {
      name: clean(row.featurename_ar) || clean(row.featurename_en),
      lat: Number(row.point_y),
      lon: Number(row.point_x),
      governorate: clean(row.adm1_ar),
      district: clean(row.adm2_ar),
    });
  }

  const governorates = XLSX.utils
    .sheet_to_json(wb.Sheets.syr_admin1)
    .map((row) => ({
      pcode: clean(row.adm1_pcode),
      name: clean(row.adm1_name1),
      lat: Number(row.center_lat),
      lon: Number(row.center_lon),
    }))
    .filter((g) => g.pcode);

  return { places, governorates };
}

/* ---------- ملف التصدير الشهري ---------- */

function findMonthlyFiles() {
  const files = fs
    .readdirSync(dataDir)
    .filter((f) => f.endsWith('.xlsx') && f !== REF_FILE && !f.startsWith('~$'))
    .sort();

  if (files.length === 0) {
    throw new Error(`لا يوجد ملف تصدير في ${dataDir}`);
  }
  return files;
}

const MONTHS = {
  january: 'كانون الثاني', february: 'شباط', march: 'آذار', april: 'نيسان',
  may: 'أيار', june: 'حزيران', july: 'تموز', august: 'آب',
  september: 'أيلول', october: 'تشرين الأول', november: 'تشرين الثاني',
  december: 'كانون الأول',
};

const MONTH_ORDER = Object.keys(MONTHS);

function describe(file) {
  const [rawMonth, rawYear] = file.replace(/\.xlsx$/i, '').split('_');
  const key = String(rawMonth).toLowerCase();
  return {
    label: `${MONTHS[key] ?? rawMonth} ${rawYear ?? ''}`.trim(),
    year: Number(rawYear) || 0,
    month: MONTH_ORDER.indexOf(key),
  };
}

const OPERATION_TYPES = [
  'عملية أطفاء',
  'إسعاف',
  'أعمال خدمية',
  'حادث سير',
  'انقاذ بارد',
  'انقاذ حيوان',
  'إنتشال غريق',
  'وسم أماكن خطرة',
  'هجمات',
  'إخلاء مدنيين',
];

function tally(rows, field) {
  const counts = new Map();
  for (const row of rows) {
    const key = clean(row[field]);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function sum(rows, field) {
  return rows.reduce((total, row) => total + num(row[field]), 0);
}

/* ---------- تقرير الإطفاء ---------- */

function buildFireReport(rows, places) {
  const fires = rows.filter((r) => clean(r['اسم العملية']) === 'عملية أطفاء');

  /* المساحة المحترقة — تُحتسب من السجلات التي سُجّلت مساحتها فقط */
  const withArea = fires.filter((r) => num(r['المساحة المحترقة (دنم)']) > 0);
  const burnedArea = sum(withArea, 'المساحة المحترقة (دنم)');

  const civilianInjuries =
    sum(fires, 'عدد المصابين الأطفال') +
    sum(fires, 'عدد المصابين الرجال') +
    sum(fires, 'عدد المصابين النساء');

  const civilianDeaths =
    sum(fires, 'عدد الشهداء الأطفال') +
    sum(fires, 'عدد الشهداء الرجال') +
    sum(fires, 'عدد الشهداء النساء');

  const staffInjuries = sum(fires, 'عدد المصابين من وزارة الطوارئ و إدارة الكوارث');
  const staffDeaths = sum(fires, 'عدد شهداء وزارة الطوارئ و إدارة الكوارث');

  const arrivalTimes = fires
    .map((r) => num(r['زمن الوصول للموقع بالدقائق']))
    .filter((v) => v > 0);
  const avgArrival = arrivalTimes.length
    ? arrivalTimes.reduce((a, b) => a + b, 0) / arrivalTimes.length
    : 0;

  /* الأسباب — "مجهول" يُفصل ولا يُدمج في الرسم */
  const allCauses = tally(fires, 'نوع العملية');
  const unknown = allCauses.find((c) => c.label === 'مجهول')?.value ?? 0;
  const causes = allCauses.filter((c) => c.label !== 'مجهول');

  /* المواقع — تجميع الحرائق على كل موقع مُرمّز */
  const byPlace = new Map();
  let unmatched = 0;

  for (const row of fires) {
    const code = clean(row['ترميز المنطقة']);
    const place = places.get(code);
    if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lon)) {
      unmatched += 1;
      continue;
    }
    const entry = byPlace.get(code) ?? {
      code,
      name: place.name,
      governorate: place.governorate,
      lat: place.lat,
      lon: place.lon,
      count: 0,
    };
    entry.count += 1;
    byPlace.set(code, entry);
  }

  const locations = [...byPlace.values()].sort((a, b) => b.count - a.count);

  return {
    total: fires.length,
    burnedArea: Math.round(burnedArea),
    burnedAreaRecords: withArea.length,
    civilianInjuries,
    civilianDeaths,
    staffInjuries,
    staffDeaths,
    avgArrival: Math.round(avgArrival),
    causes,
    causesUnknown: unknown,
    inhabited: tally(fires, 'نوع المكان'),
    placeTypes: tally(fires, 'نوع مكان الحريق'),
    placeTypesCoverage: fires.filter((r) => clean(r['نوع مكان الحريق'])).length,
    byGovernorate: tally(fires, 'المحافظة'),
    locations,
    locationsUnmatched: unmatched,
  };
}

/* ---------- التنفيذ ---------- */

function run() {
  fs.mkdirSync(outDir, { recursive: true });

  const { places, governorates } = loadPlaces();
  const files = findMonthlyFiles();

  /*
    تراكمي: تُقرأ كل الملفات الشهرية الموجودة وتُدمج.
    رقم التقرير فريد، فإعادة رفع ملف سبق تحميله لا تُضاعف أي رقم.
  */
  const seen = new Map();
  const periods = [];

  for (const file of files) {
    const wb = XLSX.readFile(path.join(dataDir, file));
    const sheet = wb.Sheets['التقارير'];
    if (!sheet) {
      console.warn(`  تخطّي ${file} — لا تحتوي على ورقة "التقارير"`);
      continue;
    }
    const batch = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    let added = 0;
    for (const row of batch) {
      const key = clean(row['رقم التقرير']);
      if (!key || seen.has(key)) continue;
      seen.set(key, row);
      added += 1;
    }
    periods.push(describe(file));
    console.log(`  ${file}: ${batch.length} سجلاً، جديد منها ${added}`);
  }

  const rows = [...seen.values()];
  periods.sort((a, b) => a.year - b.year || a.month - b.month);
  const period =
    periods.length === 1
      ? periods[0].label
      : `${periods[0].label} — ${periods[periods.length - 1].label}`;

  const overview = {
    period,
    generatedAt: new Date().toISOString().slice(0, 10),
    totalRecords: rows.length,
    byOperation: OPERATION_TYPES.map((name) => ({
      label: name,
      value: rows.filter((r) => clean(r['اسم العملية']) === name).length,
    })).filter((o) => o.value > 0),
  };

  /* خلفية الخريطة: المواقع المأهولة ترسم حدود البلاد بلا خرائط خارجية */
  const backdrop = [...places.values()]
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
    .map((p) => [Number(p.lon.toFixed(3)), Number(p.lat.toFixed(3))]);

  write('overview.json', overview);
  write('fire.json', buildFireReport(rows, places));
  write('geo.json', { backdrop, governorates });

  console.log(`\nالفترة: ${period} — ${rows.length} سجلاً بعد إزالة التكرار`);
}

function write(name, payload) {
  const file = path.join(outDir, name);
  fs.writeFileSync(file, JSON.stringify(payload));
  const kb = (fs.statSync(file).size / 1024).toFixed(0);
  console.log(`  ✓ ${name} (${kb} كيلوبايت)`);
}

run();

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

/*
  تُرسل السجلات نفسها للمتصفح بصيغة مضغوطة بدل المجاميع الجاهزة،
  ليُعاد الحساب عند تغيير الفترة الزمنية أو أي مرشّح آخر.
  القيم النصية تُستبدل بفهارس في قوائم مرجعية لتصغير الحجم.
*/

function indexer() {
  const list = [];
  const map = new Map();
  return {
    list,
    id(value) {
      const key = clean(value);
      if (!key) return -1;
      if (!map.has(key)) {
        map.set(key, list.length);
        list.push(key);
      }
      return map.get(key);
    },
  };
}

function buildFireReport(rows, places) {
  const fires = rows.filter((r) => clean(r['اسم العملية']) === 'عملية أطفاء');

  const govs = indexer();
  const causes = indexer();
  const placeTypes = indexer();
  const inhabited = indexer();
  const sites = indexer();
  const siteInfo = [];

  let unmatched = 0;
  const records = [];

  for (const row of fires) {
    const raw = row['التاريخ'];
    const date =
      raw instanceof Date ? raw : new Date(raw);
    const day = Number.isNaN(date.getTime())
      ? ''
      : date.toISOString().slice(0, 10);

    const code = clean(row['ترميز المنطقة']);
    const place = places.get(code);
    let siteIdx = -1;

    if (place && Number.isFinite(place.lat) && Number.isFinite(place.lon)) {
      siteIdx = sites.id(code);
      if (!siteInfo[siteIdx]) {
        siteInfo[siteIdx] = {
          code,
          name: place.name,
          governorate: place.governorate,
          lat: Number(place.lat.toFixed(4)),
          lon: Number(place.lon.toFixed(4)),
        };
      }
    } else {
      unmatched += 1;
    }

    records.push([
      day,
      govs.id(row['المحافظة']),
      causes.id(row['نوع العملية']),
      placeTypes.id(row['نوع مكان الحريق']),
      inhabited.id(row['نوع المكان']),
      Math.round(num(row['المساحة المحترقة (دنم)'])),
      num(row['عدد المصابين الأطفال']) +
        num(row['عدد المصابين الرجال']) +
        num(row['عدد المصابين النساء']),
      num(row['عدد الشهداء الأطفال']) +
        num(row['عدد الشهداء الرجال']) +
        num(row['عدد الشهداء النساء']),
      num(row['عدد المصابين من وزارة الطوارئ و إدارة الكوارث']),
      num(row['عدد شهداء وزارة الطوارئ و إدارة الكوارث']),
      Math.round(num(row['زمن الوصول للموقع بالدقائق'])),
      siteIdx,
    ]);
  }

  const days = records.map((r) => r[0]).filter(Boolean).sort();

  return {
    total: fires.length,
    unmatched,
    from: days[0] ?? null,
    to: days[days.length - 1] ?? null,
    dict: {
      govs: govs.list,
      causes: causes.list,
      placeTypes: placeTypes.list,
      inhabited: inhabited.list,
      sites: siteInfo,
    },
    records,
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
    const wb = XLSX.readFile(path.join(dataDir, file), { cellDates: true });
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

  write('overview.json', overview);
  write('fire.json', buildFireReport(rows, places));

  console.log(`\nالفترة: ${period} — ${rows.length} سجلاً بعد إزالة التكرار`);
}

function write(name, payload) {
  const file = path.join(outDir, name);
  fs.writeFileSync(file, JSON.stringify(payload));
  const kb = (fs.statSync(file).size / 1024).toFixed(0);
  console.log(`  ✓ ${name} (${kb} كيلوبايت)`);
}

run();

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
import * as XLSX from 'xlsx';

/*
  xlsx 0.20 (من مصدر SheetJS الرسمي) لا يحمّل نظام الملفات تلقائياً في
  وضع ESM، فنمرّره صراحةً. الترقية من 0.18.5 تُصلح ثغرتين معروفتين في
  قراءة ملفات Excel تحديداً (CVE-2023-30533، CVE-2024-22363).
*/
XLSX.set_fs(fs);

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

/* ---------- بناء التقارير ---------- */

/*
  باني تقارير عام: يُعطى اسم العملية، وقائمة الأبعاد (الحقول التي تُعدّ)،
  وقائمة المقاييس (الحقول التي تُجمع)، فيُخرج سجلات مضغوطة.

  تُرسل السجلات نفسها للمتصفح بدل المجاميع الجاهزة ليُعاد الحساب
  عند تغيير أي مرشّح. القيم النصية تُستبدل بفهارس لتصغير الحجم.

  ترتيب أعمدة السجل:
  [اليوم, المحافظة, المديرية, المركز, الموقع, ...الأبعاد, ...المقاييس]
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

function buildReport(rows, places, { operation, dims, metrics }) {
  const subset = operation
    ? rows.filter((r) => clean(r['اسم العملية']) === operation)
    : rows;

  const govs = indexer();
  const directorates = indexer();
  const centers = indexer();
  const sites = indexer();
  const siteInfo = [];
  const dimIndex = dims.map(() => indexer());

  let unmatched = 0;
  const anomalies = metrics.map(() => 0);
  const records = [];

  for (const row of subset) {
    const raw = row['التاريخ'];
    const date = raw instanceof Date ? raw : new Date(raw);
    const day = Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);

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

    const record = [
      day,
      govs.id(row['المحافظة']),
      directorates.id(row['المديرية']),
      centers.id(row['المركز']),
      siteIdx,
    ];

    dims.forEach((dim, i) => record.push(dimIndex[i].id(row[dim.column])));
    metrics.forEach((metric, i) => {
      /* مقياس بشرط: يُحتسب فقط للسجلات التي تحقق when */
      if (metric.when && !metric.when(row)) { record.push(0); return; }
      const value = metric.constant ?? metric.columns.reduce((sum, col) => sum + num(row[col]), 0);
      /*
        قيم مستحيلة تدخل أحياناً بالخطأ (مثل مئات الملايين من الكوادر).
        تُستبعد بدل أن تُجمع، ويُحصى عددها لإظهاره في التقرير.
      */
      if (metric.cap && value > metric.cap) {
        anomalies[i] += 1;
        record.push(0);
      } else {
        const k = 10 ** (metric.decimals || 0);
        record.push(Math.round(value * k) / k);
      }
    });

    records.push(record);
  }

  const days = records.map((r) => r[0]).filter(Boolean).sort();

  return {
    total: subset.length,
    unmatched,
    from: days[0] ?? null,
    to: days[days.length - 1] ?? null,
    dims: dims.map((dim, i) => ({
      key: dim.key,
      title: dim.title,
      note: dim.note ?? null,
      exclude: dim.exclude ?? null,
      values: dimIndex[i].list,
    })),
    metrics: metrics.map((m, i) => ({ key: m.key, title: m.title, anomalies: anomalies[i] })),
    dict: {
      govs: govs.list,
      directorates: directorates.list,
      centers: centers.list,
      sites: siteInfo,
    },
    records,
  };
}

/* ---------- تعريف التقارير ---------- */

const FIRE = {
  operation: 'عملية أطفاء',
  dims: [
    { key: 'cause', title: 'أسباب الحرائق', column: 'نوع العملية', exclude: 'مجهول' },
    { key: 'placeType', title: 'نوع مكان الحريق', column: 'نوع مكان الحريق' },
    { key: 'inhabited', title: 'طبيعة الموقع', column: 'نوع المكان' },
  ],
  metrics: [
    { key: 'area', title: 'المساحة المحترقة', columns: ['المساحة المحترقة (دنم)'] },
    {
      key: 'civInjured',
      title: 'إصابات المدنيين',
      columns: ['عدد المصابين الأطفال', 'عدد المصابين الرجال', 'عدد المصابين النساء'],
    },
    {
      key: 'civDead',
      title: 'وفيات المدنيين',
      columns: ['عدد الشهداء الأطفال', 'عدد الشهداء الرجال', 'عدد الشهداء النساء'],
    },
    {
      key: 'staffInjured',
      title: 'إصابات كوادر الوزارة',
      columns: ['عدد المصابين من وزارة الطوارئ و إدارة الكوارث'],
    },
    {
      key: 'staffDead',
      title: 'وفيات كوادر الوزارة',
      columns: ['عدد شهداء وزارة الطوارئ و إدارة الكوارث'],
    },
    { key: 'eta', title: 'زمن الوصول للموقع', columns: ['زمن الوصول للموقع بالدقائق'], cap: 1440 },
  ],
};

const AMBULANCE = {
  operation: 'إسعاف',
  dims: [
    { key: 'reason', title: 'سبب طلب الإسعاف', column: 'نوع العملية' },
    { key: 'condition', title: 'حالة المصاب', column: 'حالة الاسعاف', note: 'مسجّلة في جزء من البلاغات' },
    { key: 'destination', title: 'جهة النقل', column: 'نوع مكان الاسعاف الى' },
    { key: 'referral', title: 'الإحالة', column: 'احالة' },
  ],
  metrics: [
    { key: 'eta', title: 'زمن الوصول للموقع', columns: ['زمن الوصول للموقع بالدقائق'], cap: 1440 },
    { key: 'toHospital', title: 'زمن النقل للمشفى', columns: ['زمن الوصول للمشفى بالدقائق'], cap: 1440 },
    { key: 'crew', title: 'الكادر المشارك', columns: ['عدد الكادر المشارك'], cap: 500 },
  ],
};

/*
  الأنقاض المرحّلة بالأعمال الاعتيادية (خارج مشاريع الترحيل):
  عمليات «ازالة أنقاض» و«إعادة تدوير الأنقاض» — والكمية بالمتر المكعب فقط.
  بعض عمليات التدوير مسجّلة بالمتر المربع أو الطولي؛ جمعها مع المكعب
  يعطي رقماً بلا معنى، فتُستبعد وتُحصى لتُذكر تحت الرقم.
*/
const normAr = (v) => clean(v).replace(/[إأآ]/g, 'ا');
const RUBBLE_OPS = new Set(['ازالة انقاض', 'اعادة تدوير الانقاض']);
const isRubble = (row) => RUBBLE_OPS.has(normAr(row['نوع العملية']));
const isCubic = (row) => clean(row['الواحدة']) === 'متر مكعب';

const SERVICES = {
  operation: 'أعمال خدمية',
  dims: [
    { key: 'sector', title: 'قطاع الخدمة', column: 'اسم القطاع(خدمات)' },
    { key: 'kind', title: 'نوع العمل المنفَّذ', column: 'نوع العملية' },
    { key: 'target', title: 'المكان المستهدف', column: 'المكان المستهدف' },
    { key: 'status', title: 'حالة النشاط', column: 'حالة النشاط' },
  ],
  metrics: [
    { key: 'rubble', title: 'الأنقاض المرحّلة', columns: ['الكمية'], when: (r) => isRubble(r) && isCubic(r), decimals: 1 },
    { key: 'rubbleOps', title: 'عمليات الأنقاض', constant: 1, when: (r) => isRubble(r) && isCubic(r) },
    { key: 'rubbleOther', title: 'أنقاض بوحدات أخرى', constant: 1, when: (r) => isRubble(r) && !isCubic(r) },
  ],
};

const TRAFFIC = {
  operation: 'حادث سير',
  dims: [
    { key: 'crashType', title: 'نوع حادث السير', column: 'نوع حادث السير' },
    { key: 'cause', title: 'سبب الحادث', column: 'سبب الحادث' },
    { key: 'vehicle', title: 'نوع المركبة', column: 'نوع السيارة' },
    { key: 'road', title: 'حالة الطريق وقت الحادث', column: 'حالة الطريق وقت الحادث' },
    { key: 'light', title: 'الإضاءة في موقع الحادث', column: 'الإضاءة في موقع الحادث' },
    { key: 'signs', title: 'وجود إشارات مرورية', column: 'هل توجد إشارات مرورية وتنظيم مروري بالموقع' },
    { key: 'destination', title: 'جهة نقل المصابين', column: 'نوع مكان الاسعاف الى', note: 'مسجّلة في جزء من الحوادث' },
  ],
  metrics: [
    {
      key: 'injured',
      title: 'المصابون',
      columns: ['عدد المصابين الأطفال', 'عدد المصابين الرجال', 'عدد المصابين النساء'],
    },
    {
      key: 'dead',
      title: 'الوفيات',
      columns: ['عدد الشهداء الأطفال', 'عدد الشهداء الرجال', 'عدد الشهداء النساء'],
    },
    { key: 'eta', title: 'زمن الوصول للموقع', columns: ['زمن الوصول للموقع بالدقائق'], cap: 1440 },
  ],
};

const DROWNING = {
  operation: 'إنتشال غريق',
  dims: [
    { key: 'cause', title: 'سبب الغرق', column: 'سبب الغرق' },
    { key: 'state', title: 'حالة الغريق', column: 'حالة الغريق' },
    { key: 'mission', title: 'بحث أم انتشال', column: 'بحث/انتشال' },
    { key: 'warnings', title: 'وجود لوحات تحذيرية', column: 'هل يوجود تحذيرات أو لوحات إرشادية في مكان الحادث' },
    { key: 'firstAid', title: 'الإسعافات الأولية المقدمة', column: 'الإسعافات الأولية المقدمة' },
  ],
  metrics: [
    { key: 'eta', title: 'زمن الوصول للموقع', columns: ['زمن الوصول للموقع بالدقائق'], cap: 1440 },
    { key: 'crew', title: 'الكادر المشارك', columns: ['عدد الكادر المشارك'], cap: 500 },
  ],
};

const COLD_RESCUE = {
  operation: 'انقاذ بارد',
  dims: [
    { key: 'kind', title: 'نوع عملية الإنقاذ', column: 'نوع العملية' },
    { key: 'inhabited', title: 'طبيعة الموقع', column: 'نوع المكان' },
  ],
  metrics: [
    { key: 'eta', title: 'زمن الوصول للموقع', columns: ['زمن الوصول للموقع بالدقائق'], cap: 1440 },
    { key: 'duration', title: 'الوقت المستغرق', columns: ['الوقت المستغرق'], cap: 10080 },
    { key: 'crew', title: 'الكادر المشارك', columns: ['عدد الكادر المشارك'], cap: 500 },
  ],
};

const ANIMAL_RESCUE = {
  operation: 'انقاذ حيوان',
  dims: [{ key: 'inhabited', title: 'طبيعة الموقع', column: 'نوع المكان' }],
  metrics: [
    { key: 'eta', title: 'زمن الوصول للموقع', columns: ['زمن الوصول للموقع بالدقائق'], cap: 1440 },
    { key: 'duration', title: 'الوقت المستغرق', columns: ['الوقت المستغرق'], cap: 10080 },
    { key: 'crew', title: 'الكادر المشارك', columns: ['عدد الكادر المشارك'], cap: 500 },
  ],
};

const HAZARD = {
  operation: 'وسم أماكن خطرة',
  dims: [{ key: 'inhabited', title: 'طبيعة الموقع', column: 'نوع المكان' }],
  metrics: [
    { key: 'eta', title: 'زمن الوصول للموقع', columns: ['زمن الوصول للموقع بالدقائق'], cap: 1440 },
    { key: 'duration', title: 'الوقت المستغرق', columns: ['الوقت المستغرق'], cap: 10080 },
    { key: 'crew', title: 'الكادر المشارك', columns: ['عدد الكادر المشارك'], cap: 500 },
  ],
};

const ATTACKS = {
  operation: 'هجمات',
  dims: [
    { key: 'kind', title: 'نوع الهجوم', column: 'نوع العملية' },
    { key: 'actor', title: 'الجهة التي يُعتقد أنها نفّذت الهجوم', column: 'الجهه التي يعتقد أنها قامت بتنفيذ الهجوم' },
    { key: 'inhabited', title: 'طبيعة الموقع', column: 'نوع المكان' },
  ],
  metrics: [
    {
      key: 'injured',
      title: 'المصابون',
      columns: ['عدد المصابين الأطفال', 'عدد المصابين الرجال', 'عدد المصابين النساء'],
    },
    {
      key: 'dead',
      title: 'الشهداء',
      columns: ['عدد الشهداء الأطفال', 'عدد الشهداء الرجال', 'عدد الشهداء النساء'],
    },
    { key: 'affected', title: 'المتضررون', columns: ['عدد المتضررين'] },
    { key: 'raids', title: 'عدد الغارات', columns: ['عدد الغارات'] },
    { key: 'munitions', title: 'الذخائر المستخدمة', columns: ['عدد الذخائر المستخدمة أثناء الهجوم'] },
    { key: 'eta', title: 'زمن الوصول للموقع', columns: ['زمن الوصول للموقع بالدقائق'], cap: 1440 },
  ],
};

const EVACUATION = {
  operation: 'إخلاء مدنيين',
  dims: [
    { key: 'kind', title: 'نوع العملية', column: 'نوع العملية' },
    { key: 'inhabited', title: 'طبيعة الموقع', column: 'نوع المكان' },
  ],
  metrics: [
    { key: 'evacuated', title: 'الذين تم إخلاؤهم', columns: ['عدد الذين تم اخلائهم'] },
    { key: 'eta', title: 'زمن الوصول للموقع', columns: ['زمن الوصول للموقع بالدقائق'], cap: 1440 },
    { key: 'crew', title: 'الكادر المشارك', columns: ['عدد الكادر المشارك'], cap: 500 },
  ],
};

/* نظرة عامة: كل العمليات في مجموعة واحدة لتغذية الصفحة الرئيسية */
const OVERVIEW = {
  operation: null,
  dims: [
    { key: 'operation', title: 'عدد العمليات حسب النوع', column: 'اسم العملية' },
  ],
  metrics: [
    {
      key: 'injured',
      title: 'الإصابات',
      columns: [
        'عدد المصابين الأطفال', 'عدد المصابين الرجال', 'عدد المصابين النساء',
        'عدد المصابين من وزارة الطوارئ و إدارة الكوارث',
      ],
    },
    {
      key: 'dead',
      title: 'الوفيات',
      columns: [
        'عدد الشهداء الأطفال', 'عدد الشهداء الرجال', 'عدد الشهداء النساء',
        'عدد شهداء وزارة الطوارئ و إدارة الكوارث',
      ],
    },
    {
      key: 'beneficiaries',
      title: 'المستفيدون',
      columns: [
        'عدد المستفيدين المباشر', 'عدد المستفيدين غير المباشر',
        'عدد المستفيدين الرجال', 'عدد المستفيدين النساء',
        'عدد المستفيدين الأطفال الذكور', 'عدد المستفيدين الأطفال الاناث',
      ],
    },
    { key: 'crew', title: 'الكادر المشارك', columns: ['عدد الكادر المشارك'], cap: 500 },
  ],
};

const REPORTS = {
  overview: OVERVIEW,
  fire: FIRE,
  ambulance: AMBULANCE,
  services: SERVICES,
  traffic: TRAFFIC,
  drowning: DROWNING,
  'cold-rescue': COLD_RESCUE,
  'animal-rescue': ANIMAL_RESCUE,
  'hazard-marking': HAZARD,
  attacks: ATTACKS,
  evacuation: EVACUATION,
};

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

  write('summary.json', overview);
  for (const [id, config] of Object.entries(REPORTS)) {
    write(`${id}.json`, buildReport(rows, places, config));
  }

  console.log(`\nالفترة: ${period} — ${rows.length} سجلاً بعد إزالة التكرار`);
}

function write(name, payload) {
  const file = path.join(outDir, name);
  fs.writeFileSync(file, JSON.stringify(payload));
  const kb = (fs.statSync(file).size / 1024).toFixed(0);
  console.log(`  ✓ ${name} (${kb} كيلوبايت)`);
}

run();

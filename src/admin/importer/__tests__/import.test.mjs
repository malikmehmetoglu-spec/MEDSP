/*
  اختبار الاستيراد والمقارنة بملف مُولَّد يحاكي الملفات الحقيقية:
  عنوان وتاريخ فوق الجدول، خلايا مدمجة، صف إجمالي، «ادلب» بلا همزة.
  التشغيل: node src/admin/importer/__tests__/import.test.mjs
*/
import * as XLSX from 'xlsx';
import fs from 'fs';
import { sheetToGrid, detectHeader, extractTable, inferType, governorateIndex } from '../parse.js';
import { computeDiff, autoMap, suggestKeys } from '../diff.js';

const basemap = JSON.parse(fs.readFileSync(new URL('../../../../public/data/basemap.json', import.meta.url)));
const gi = governorateIndex(basemap);
const names = new Map(basemap.governorates.map((g) => [g.code, g.name]));

function book(rows) {
  const aoa = [
    ['تقرير مرحلي', null, null, null], [null, null, null, null],
    ['المرحلة', 'المحافظة', 'الكمية المخططة (m3)', 'الكمية المنفذة (m3)'],
    ...rows,
    [null, 'الكمية الاجمالية', rows.reduce((s, r) => s + r[2], 0), rows.reduce((s, r) => s + r[3], 0)],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  /* المرحلة مدمجة: مكتوبة في أول صف من كل مرحلة فقط */
  const merges = [];
  let start = 3;
  for (let i = 1; i <= rows.length; i += 1) {
    if (i === rows.length || rows[i][0]) { if (i + 2 > start) merges.push({ s: { r: start, c: 0 }, e: { r: i + 2, c: 0 } }); start = i + 3; }
  }
  ws['!merges'] = merges;
  return XLSX.read(XLSX.write({ SheetNames: ['s'], Sheets: { s: ws } }, { type: 'buffer', bookType: 'xlsx' }));
}

const survey = { pages: [{ name: 'p', children: [
  { name: 'phase', type: 'select_one', label: 'المرحلة', choices: [{ label: 'الأولى', value: 'الأولى' }, { label: 'الثانية', value: 'الثانية' }] },
  { name: 'gov', type: 'admin_area', label: 'المحافظة' },
  { name: 'planned', type: 'decimal', label: 'الكمية المخططة' },
  { name: 'executed', type: 'decimal', label: 'الكمية المنفذة' },
  { name: 'progress', type: 'calculate', label: 'النسبة', calculation: 'percent(${executed}, ${planned})' },
  { name: 'status', type: 'select_one', label: 'الحالة', choices: [{ label: 'منجز', value: 'منجز' }, { label: 'قيد التنفيذ', value: 'قيد التنفيذ' }, { label: 'قيد التحضير', value: 'قيد التحضير' }],
    derive: "if(${planned} > 0 and ${executed} >= ${planned}, 'منجز', if(${executed} > 0, 'قيد التنفيذ', 'قيد التحضير'))" },
] }] };
const nodes = survey.pages[0].children;

const run = (rows, existing) => {
  const grid = sheetToGrid(XLSX, book(rows).Sheets.s);
  const header = detectHeader(grid);
  const table = extractTable(grid, header);
  const mapping = autoMap(table.columns, nodes);
  const keys = suggestKeys(table, mapping, nodes, gi);
  return { header, table, mapping, keys, ...computeDiff({ survey, table, mapping, keys, existing, govIdx: gi, govName: (c) => names.get(c) }) };
};

const base = [['الأولى', 'ادلب', 1000, 1000], [null, 'حلب', 500, 100], ['الثانية', 'ادلب', 800, 0], [null, 'حماة', 0, 0]];
const existing = run(base, []).inserts.map((i, n) => ({ id: `r${n}`, answers: i.answers }));

let pass = 0; const bad = [];
const check = (name, ok) => (ok ? pass++ : bad.push(name));

const first = run(base, []);
check('صف العناوين هو الثالث', first.header === 2);
check('صف الإجمالي مستبعد', first.table.skipped.length === 1 && first.table.rows.length === 4);
check('الدمج مُلئ', first.table.rows.map((r) => r.values[0]).join() === 'الأولى,الأولى,الثانية,الثانية');
check('المفتاح المقترح: المرحلة + المحافظة', first.keys.join() === 'phase,gov');
check('«ادلب» بلا همزة ← SY07', existing[0].answers.gov.governorate === 'SY07');
check('الحالة مشتقة: منجز', existing[0].answers.status === 'منجز');
check('الحالة مشتقة: قيد التحضير', existing[2].answers.status === 'قيد التحضير');
check('نسبة بمقام صفري غير معرّفة', existing[3].answers.progress === '');
check('نوع العمود: رقم', inferType('الكمية', [1, 2.5, 3], gi).type === 'number');
check('نوع العمود: محافظة', inferType('المحافظة', ['ادلب', 'حلب', 'Aleppo'], gi).type === 'gov');

const same = run(base, existing);
check('الملف نفسه: صفر تغييرات', same.updates.length === 0 && same.inserts.length === 0 && same.missing.length === 0 && same.unchanged.length === 4);

const next = run([['الأولى', 'ادلب', 1000, 1000], [null, 'حلب', 500, 500], ['الثانية', 'ادلب', 800, 0], [null, 'درعا', 300, 30]], existing);
check('تغيير واحد: حلب', next.updates.length === 1 && next.updates[0].label === 'الأولى — حلب');
check('التغيير يشمل الحالة المشتقة', next.updates[0]?.changes.some((c) => c.field === 'status' && c.after === 'منجز'));
check('جديد: درعا', next.inserts.length === 1 && next.inserts[0].label === 'الثانية — درعا');
check('مختفٍ: حماة (لا يُحذف تلقائياً)', next.missing.length === 1 && next.missing[0].label === 'الثانية — حماة');

const dup = run([['الأولى', 'ادلب', 1, 1], [null, 'ادلب', 2, 2]], existing);
check('مفتاح مكرر يمنع التطبيق', dup.blocking === true);

console.log(`نجح ${pass} / ${pass + bad.length}`);
if (bad.length) { bad.forEach((b) => console.error('  ✗ ' + b)); process.exit(1); }

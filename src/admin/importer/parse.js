/*
  قراءة ملفات Excel الحقيقية — كما تأتي من الجهات، لا كما نتمنى.

  ما تتعامل معه:
    - عنوان وتاريخ فوق الجدول          ← كشف صف العناوين تلقائياً
    - خلايا مدمجة (المرحلة لعدة صفوف) ← تُنسخ قيمتها لكل الصفوف
    - صف «الكمية الإجمالية» في النهاية ← يُكشف ويُستبعد ويُبلَّغ عنه
    - «ادلب» بلا همزة، «ريف دمشق»      ← مطابقة المحافظات بالحدود الرسمية
    - نوع كل عمود                       ← اقتراح يمكن تصحيحه

  دوال خالصة: تستقبل مكتبة XLSX معاملاً، فتُختبر في Node وتعمل في المتصفح.
*/

/* ---------------- تطبيع النصوص ---------------- */

export function normalize(s) {
  return String(s ?? '')
    .replace(/[\u064B-\u0652\u0640]/g, '')      /* تشكيل وتطويل */
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[()[\]{}.,،:؛"'«»]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/* ---------------- الجدول ---------------- */

/*
  يحوّل الورقة إلى مصفوفة ثنائية، وينسخ قيمة كل خلية مدمجة إلى كل
  خلايا الدمج — فصف «ادلب، المرحلة الثانية» يحمل «المرحلة الثانية»
  رغم أنها مكتوبة مرة واحدة في خلية مدمجة.
*/
export function sheetToGrid(XLSX, ws) {
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
  for (const m of ws['!merges'] || []) {
    const v = grid[m.s.r]?.[m.s.c] ?? null;
    for (let r = m.s.r; r <= m.e.r; r += 1) {
      grid[r] = grid[r] || [];
      for (let c = m.s.c; c <= m.e.c; c += 1) grid[r][c] = v;
    }
  }
  const width = Math.max(0, ...grid.map((r) => r.length));
  return grid.map((r) => Array.from({ length: width }, (_, i) => (r[i] === undefined ? null : r[i])));
}

const isBlank = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isText = (v) => typeof v === 'string' && v.trim() !== '' && !/^[\d\s.,%-]+$/.test(v);

/*
  صف العناوين: أكثر الصفوف نصوصاً بين الأولى، على أن يليه صف فيه رقم.
  عنوان التقرير في الأعلى خلية واحدة (مدمجة غالباً) فلا يفوز.
*/
export function detectHeader(grid) {
  let best = 0;
  let bestScore = -1;
  const limit = Math.min(grid.length - 1, 20);
  for (let i = 0; i < limit; i += 1) {
    const row = grid[i];
    const texts = new Set(row.filter(isText).map((v) => normalize(v)));
    const next = grid.slice(i + 1, i + 4);
    const hasNumBelow = next.some((r) => r.some(isNum));
    const score = texts.size * (hasNumBelow ? 2 : 1);
    if (texts.size >= 2 && score > bestScore) { best = i; bestScore = score; }
  }
  return best;
}

/* صف إجمالي: «الكمية الاجمالية»، «المجموع»، «الإجمالي»، «Total»… */
const TOTAL = /(^|\s)(ال)?(اجمالي|اجماليه|مجموع|المجموع الكلي|الكلي)(\s|$)|^total\b|^sum\b/;
export function isTotalRow(row) {
  return row.some((v) => typeof v === 'string' && TOTAL.test(normalize(v)));
}

/*
  يستخرج الأعمدة والصفوف من صف العناوين. يُرجع أيضاً ما استُبعد ولماذا،
  لتعرضه الواجهة — لا شيء يُحذف بصمت.
*/
export function extractTable(grid, headerIdx) {
  const header = grid[headerIdx] || [];
  const used = new Map();
  const columns = header.map((h, i) => {
    let name = isBlank(h) ? `عمود ${i + 1}` : String(h).replace(/\s+/g, ' ').trim();
    const n = used.get(name) || 0;
    used.set(name, n + 1);
    if (n) name = `${name} (${n + 1})`;
    return { index: i, name };
  });

  const rows = [];
  const skipped = [];
  for (let r = headerIdx + 1; r < grid.length; r += 1) {
    const row = grid[r];
    if (row.every(isBlank)) continue;
    if (isTotalRow(row)) { skipped.push({ row: r + 1, reason: 'صف إجمالي', values: row }); continue; }
    rows.push({ row: r + 1, values: row });
  }

  /* أعمدة فارغة كلياً لا تُعرض */
  const keep = columns.filter((c) => rows.some((r) => !isBlank(r.values[c.index])) || !c.name.startsWith('عمود '));
  return { columns: keep, rows, skipped };
}

/* ---------------- المحافظات ---------------- */

const GOV_ALIASES = {
  'حسكه': 'الحسكه', 'رقه': 'الرقه', 'ديرالزور': 'دير الزور', 'دير زور': 'دير الزور',
  'لاذقيه': 'اللاذقيه', 'سويداء': 'السويداء', 'قنيطره': 'القنيطره', 'شام': 'دمشق',
  'ريف الشام': 'ريف دمشق', 'damascus': 'دمشق', 'rural damascus': 'ريف دمشق', 'aleppo': 'حلب',
  'homs': 'حمص', 'hama': 'حماه', 'idlib': 'ادلب', 'lattakia': 'اللاذقيه', 'latakia': 'اللاذقيه',
  'tartous': 'طرطوس', 'tartus': 'طرطوس', 'daraa': 'درعا', 'dar\'a': 'درعا', 'as-sweida': 'السويداء',
  'sweida': 'السويداء', 'quneitra': 'القنيطره', 'deir ez-zor': 'دير الزور', 'deir-ez-zor': 'دير الزور',
  'raqqa': 'الرقه', 'ar-raqqa': 'الرقه', 'al-hasakeh': 'الحسكه', 'hasakeh': 'الحسكه',
};

export function governorateIndex(basemap) {
  const idx = new Map();
  for (const g of basemap?.governorates || []) {
    const n = normalize(g.name);
    idx.set(n, g);
    idx.set(n.replace(/^ال/, ''), g);
  }
  for (const [alias, target] of Object.entries(GOV_ALIASES)) {
    const g = idx.get(normalize(target));
    if (g) idx.set(normalize(alias), g);
  }
  return idx;
}

export function matchGovernorate(value, idx) {
  if (isBlank(value)) return null;
  const n = normalize(value);
  return idx.get(n) || idx.get(n.replace(/^ال/, '')) || idx.get(n.replace(/^محافظه\s+/, '')) || null;
}

/* ---------------- اقتراح النوع ---------------- */

/*
  أنواع الاستيراد:
    number   رقم (عدد صحيح أو عشري)
    ratio    نسبة بين 0 و 1.5 — تُقترح للتجاهل إن كانت تُحسب من أعمدة أخرى
    gov      محافظة
    choice   فئات محدودة متكررة
    text     نص حر
    date     تاريخ
*/
export function inferType(name, values, govIdx) {
  const vals = values.filter((v) => !isBlank(v));
  if (vals.length === 0) return { type: 'text', confidence: 0 };
  const share = (fn) => vals.filter(fn).length / vals.length;
  const n = normalize(name);

  if (share((v) => v instanceof Date) >= 0.8) return { type: 'date', confidence: share((v) => v instanceof Date) };

  const nums = share(isNum);
  if (nums >= 0.8) {
    const within = share((v) => isNum(v) && v >= 0 && v <= 1.5);
    if (within === 1 && /نسب|معدل|%|٪|percent|ratio/.test(n)) return { type: 'ratio', confidence: 0.9 };
    return { type: 'number', integer: vals.every((v) => !isNum(v) || Number.isInteger(v)), confidence: nums };
  }

  const gov = share((v) => Boolean(matchGovernorate(v, govIdx)));
  if (gov >= 0.8 || (gov >= 0.5 && /محافظ|governorate/.test(n))) return { type: 'gov', confidence: gov };

  const distinct = new Set(vals.map((v) => normalize(v)));
  if (distinct.size <= Math.max(3, Math.min(15, vals.length * 0.6)) && distinct.size < vals.length) {
    return { type: 'choice', confidence: 1 - distinct.size / vals.length };
  }
  return { type: 'text', confidence: 0.5 };
}

/* ---------------- تحويل القيم ---------------- */

export function toNumber(v) {
  if (isNum(v)) return v;
  if (typeof v !== 'string') return null;
  const s = v.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[,\s٬]/g, '').replace('٫', '.');
  const x = Number(s.replace(/%$/, ''));
  return Number.isFinite(x) ? x : null;
}

export function toDateString(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return null;
}

export const cleanText = (v) => (isBlank(v) ? '' : String(v).replace(/\s+/g, ' ').trim());

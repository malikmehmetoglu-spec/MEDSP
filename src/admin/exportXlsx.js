/*
  تصدير Excel كامل.

    «الاستمارات»   صف لكل استمارة: الحالة والبيانات الوصفية وكل الإجابات
    ورقة لكل مجموعة متكررة: صف لكل مدخل، مربوط بالاستمارة الأم بمعرّفها
    «القاموس»      كل سؤال: معرّفه ونصه ونوعه وخياراته برموزها

  المكتبة تُحمَّل عند الضغط على التصدير فقط، فلا تثقل تحميل الصفحة.
*/

import { RESPONSE_STATUS } from '../projects/store';
import { QUESTION_TYPES } from '../survey/schema';
import { durationInfo } from './durations';

const choiceLabel = (node, v) => node.choices?.find((c) => String(c.value) === String(v))?.label ?? v;

/* أعمدة سؤال واحد: بعض الأنواع تتفرّع لأكثر من عمود لتكون قابلة للتحليل */
function columnsFor(node, areas) {
  const L = node.label || node.name;
  switch (node.type) {
    case 'admin_area':
      return [
        { head: `${L} — المحافظة`, get: (v) => (v?.governorate ? areas?.gov?.get(v.governorate)?.name || v.governorate : '') },
        { head: `${L} — الناحية`, get: (v) => (v?.subdistrict ? areas?.sub?.get(v.subdistrict)?.name || v.subdistrict : '') },
        { head: `${L} — رمز الناحية`, get: (v) => v?.subdistrict || '' },
      ];
    case 'geopoint':
      return [
        { head: `${L} — خط العرض`, get: (v) => (v?.lat ?? '') },
        { head: `${L} — خط الطول`, get: (v) => (v?.lng ?? '') },
        { head: `${L} — الدقة (م)`, get: (v) => (v?.accuracy ?? '') },
      ];
    case 'select_multiple':
    case 'rank':
      return [{ head: L, get: (v) => (Array.isArray(v) ? v.map((x) => choiceLabel(node, x)).join('، ') : '') }];
    case 'select_one':
      return [{ head: L, get: (v) => (v === undefined || v === '' ? '' : choiceLabel(node, v)) }];
    case 'integer':
    case 'decimal':
    case 'range':
    case 'calculate':
      return [{ head: L, get: (v) => (v === '' || v === undefined || v === null || Number.isNaN(Number(v)) ? '' : Number(v)) }];
    case 'image':
      return [{ head: L, get: (v) => (v?.dataUrl ? 'مرفقة' : '') }];
    case 'repeat':
      return [{ head: `${L} — العدد`, get: (v) => (Array.isArray(v) ? v.length : 0) }];
    default:
      return [{ head: L, get: (v) => (v ?? '') }];
  }
}

/* أسماء الأوراق: 31 حرفاً كحد أقصى، بلا رموز ممنوعة، وفريدة */
function sheetName(name, used) {
  let base = String(name || 'ورقة').replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 28) || 'ورقة';
  let n = base; let i = 2;
  while (used.has(n)) { n = `${base.slice(0, 26)} ${i}`; i += 1; }
  used.add(n);
  return n;
}

export async function exportXlsx({ survey, responses, areas, filename }) {
  const XLSX = await import('xlsx');
  const top = survey.pages.flatMap((p) => p.children).filter((n) => n.type !== 'note' && n.type !== 'group');
  const repeats = top.filter((n) => n.type === 'repeat');
  const topCols = top.flatMap((n) => columnsFor(n, areas).map((c) => ({ ...c, node: n })));

  const used = new Set();
  const wb = XLSX.utils.book_new();

  /* --- الاستمارات --- */
  const head = ['المعرّف', 'الحالة', 'تاريخ الإرسال', 'بدء التعبئة', 'انتهاء التعبئة',
    'المدة (ثانية)', 'مدة مريبة', 'الجهاز', 'أُرسلت بعد انقطاع', 'عُدّلت بعد الإرسال',
    ...topCols.map((c) => c.head)];
  const rows = responses.map((r) => {
    const d = durationInfo(r, survey);
    const m = r.meta || {};
    return [
      r.id,
      RESPONSE_STATUS[r.status],
      r.submittedAt ? new Date(r.submittedAt) : '',
      m.startedAt ? new Date(m.startedAt) : '',
      m.endedAt ? new Date(m.endedAt) : '',
      m.durationSec ?? '',
      d.suspicious ? 'نعم' : '',
      m.device || '',
      m.offline ? 'نعم' : '',
      r.edited ? 'نعم' : '',
      ...topCols.map((c) => c.get(r.answers?.[c.node.name])),
    ];
  });
  const ws = XLSX.utils.aoa_to_sheet([head, ...rows], { cellDates: true, dateNF: 'yyyy-mm-dd hh:mm' });
  ws['!cols'] = head.map((h, i) => ({ wch: i === 0 ? 38 : Math.min(Math.max(String(h).length + 2, 12), 40) }));
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: head.length - 1 } }) };
  XLSX.utils.book_append_sheet(wb, ws, sheetName('الاستمارات', used));

  /* --- ورقة لكل مجموعة متكررة --- */
  for (const rep of repeats) {
    const kids = (rep.children || []).filter((c) => c.type !== 'note');
    const cols = kids.flatMap((n) => columnsFor(n, areas).map((c) => ({ ...c, node: n })));
    const h = ['معرّف الاستمارة', 'حالة الاستمارة', 'الترتيب', ...cols.map((c) => c.head)];
    const data = [];
    for (const r of responses) {
      (Array.isArray(r.answers?.[rep.name]) ? r.answers[rep.name] : []).forEach((row, i) => {
        data.push([r.id, RESPONSE_STATUS[r.status], i + 1, ...cols.map((c) => c.get(row?.[c.node.name]))]);
      });
    }
    const s = XLSX.utils.aoa_to_sheet([h, ...data]);
    s['!cols'] = h.map((x, i) => ({ wch: i === 0 ? 38 : Math.min(Math.max(String(x).length + 2, 10), 40) }));
    XLSX.utils.book_append_sheet(wb, s, sheetName(rep.label || rep.name, used));
  }

  /* --- القاموس --- */
  const dict = [['المعرّف', 'السؤال', 'النوع', 'ضمن مجموعة', 'الخيارات (الرمز = النص)']];
  const walk = (list, parent) => list.forEach((n) => {
    if (n.type === 'note') return;
    dict.push([
      n.name, n.label || '', QUESTION_TYPES[n.type]?.label || n.type, parent || '',
      (n.choices || []).map((c) => `${c.value} = ${c.label}`).join(' ؛ '),
    ]);
    if (n.children) walk(n.children, n.label || n.name);
  });
  walk(top, '');
  const ds = XLSX.utils.aoa_to_sheet(dict);
  ds['!cols'] = [{ wch: 22 }, { wch: 40 }, { wch: 16 }, { wch: 20 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, ds, sheetName('القاموس', used));

  /* اتجاه الأوراق من اليمين لليسار */
  wb.Workbook = { Views: [{ RTL: true }] };

  XLSX.writeFile(wb, filename, { compression: true });
}

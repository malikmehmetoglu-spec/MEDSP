/*
  الحقول المحسوبة المرئية.

  المستخدم يختار عملية ثم الحقول من قوائم، ويُخزَّن:
    calc = { op, fields: [...], repeat, key, value }
  ثم يُحوَّل إلى تعبير calculation يفهمه المحرك.
*/

const NUM = ['integer', 'decimal', 'range', 'calculate'];

export const CALC_OPS = {
  sum: { label: 'مجموع حقول', hint: 'أ + ب + ج', inputs: 'many', types: NUM, min: 2 },
  diff: { label: 'الفرق بين حقلين', hint: 'أ − ب', inputs: 'two', types: NUM },
  product: { label: 'حاصل ضرب حقلين', hint: 'أ × ب', inputs: 'two', types: NUM },
  percent: { label: 'نسبة مئوية', hint: '(أ ÷ ب) × 100', inputs: 'two', types: NUM },
  avg: { label: 'متوسط حقول', hint: '(أ + ب) ÷ عددها', inputs: 'many', types: NUM, min: 2 },
  repeat_count: { label: 'عدد مدخلات مجموعة متكررة', hint: 'عدد أفراد الأسرة مثلاً', inputs: 'repeat' },
  repeat_sum: { label: 'مجموع حقل داخل مجموعة متكررة', hint: 'مجموع أعمار الأفراد مثلاً', inputs: 'repeat-key', keyTypes: NUM },
  repeat_count_where: { label: 'عدد المدخلات التي تحقق شرطاً', hint: 'عدد الإناث بين الأفراد مثلاً', inputs: 'repeat-where' },
  count_selected: { label: 'عدد الخيارات المختارة', hint: 'في سؤال اختيار متعدد', inputs: 'one', types: ['select_multiple', 'rank'] },
  age: { label: 'العمر بالسنوات', hint: 'من تاريخ الميلاد حتى اليوم', inputs: 'one', types: ['date'] },
  days: { label: 'عدد الأيام بين تاريخين', hint: 'من أ إلى ب', inputs: 'two', types: ['date', 'datetime'] },
};

const f = (name) => `\${${name}}`;
const clean = (v) => String(v ?? '').replace(/['"]/g, '');

export function isCalcComplete(calc) {
  const def = CALC_OPS[calc?.op];
  if (!def) return false;
  const fields = (calc.fields || []).filter(Boolean);
  switch (def.inputs) {
    case 'many': return fields.length >= (def.min || 2);
    case 'two': return fields.length >= 2 && Boolean(fields[0] && fields[1]);
    case 'one': return fields.length >= 1;
    case 'repeat': return Boolean(calc.repeat);
    case 'repeat-key': return Boolean(calc.repeat && calc.key);
    case 'repeat-where': return Boolean(calc.repeat && calc.key && calc.value !== undefined && calc.value !== '');
    default: return false;
  }
}

export function compileCalc(calc) {
  if (!isCalcComplete(calc)) return '';
  const fs = (calc.fields || []).filter(Boolean);
  switch (calc.op) {
    case 'sum': return fs.map(f).join(' + ');
    case 'diff': return `${f(fs[0])} - ${f(fs[1])}`;
    case 'product': return `${f(fs[0])} * ${f(fs[1])}`;
    case 'percent': return `percent(${f(fs[0])}, ${f(fs[1])})`;
    case 'avg': return `round((${fs.map(f).join(' + ')}) div ${fs.length} * 10) div 10`;
    case 'repeat_count': return `count(${f(calc.repeat)})`;
    case 'repeat_sum': return `repeat_sum(${f(calc.repeat)}, '${clean(calc.key)}')`;
    case 'repeat_count_where':
      return `repeat_count(${f(calc.repeat)}, '${clean(calc.key)}', '${clean(calc.value)}')`;
    case 'count_selected': return `count(${f(fs[0])})`;
    case 'age': return `age(${f(fs[0])})`;
    case 'days': return `days_between(${f(fs[0])}, ${f(fs[1])})`;
    default: return '';
  }
}

export function describeCalc(calc, nodeOf) {
  if (!isCalcComplete(calc)) return '';
  const n = (name) => `«${nodeOf(name)?.label || name}»`;
  const fs = (calc.fields || []).filter(Boolean);
  const rep = calc.repeat && nodeOf(calc.repeat);
  const key = rep?.children?.find((c) => c.name === calc.key);
  switch (calc.op) {
    case 'sum': return `مجموع ${fs.map(n).join(' و')}`;
    case 'diff': return `${n(fs[0])} ناقص ${n(fs[1])}`;
    case 'product': return `${n(fs[0])} مضروباً في ${n(fs[1])}`;
    case 'percent': return `نسبة ${n(fs[0])} من ${n(fs[1])}`;
    case 'avg': return `متوسط ${fs.map(n).join(' و')}`;
    case 'repeat_count': return `عدد مدخلات ${n(calc.repeat)}`;
    case 'repeat_sum': return `مجموع «${key?.label || calc.key}» في ${n(calc.repeat)}`;
    case 'repeat_count_where': {
      const shown = key?.choices?.find((c) => String(c.value) === String(calc.value))?.label ?? calc.value;
      return `عدد مدخلات ${n(calc.repeat)} التي فيها «${key?.label || calc.key}» = ${shown}`;
    }
    case 'count_selected': return `عدد ما اختير في ${n(fs[0])}`;
    case 'age': return `العمر من ${n(fs[0])}`;
    case 'days': return `الأيام من ${n(fs[0])} إلى ${n(fs[1])}`;
    default: return '';
  }
}

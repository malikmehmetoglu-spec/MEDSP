/*
  الشروط المرئية.

  المستخدم يبني الشرط من قوائم: [سؤال] [عامل] [قيمة]، ويُخزَّن كبنية:
    logic = { mode: 'all' | 'any', rules: [{ field, op, value }] }

  ثم يُحوَّل إلى تعبير relevant يفهمه المحرك، فلا يتغير المحرك ولا
  أي استبيان قديم. والوصف العربي يُولَّد من نفس البنية.
*/

export const OPS = {
  eq: { label: 'يساوي', needsValue: true },
  ne: { label: 'لا يساوي', needsValue: true },
  has: { label: 'يتضمن', needsValue: true },
  lacks: { label: 'لا يتضمن', needsValue: true },
  gt: { label: 'أكبر من', needsValue: true },
  gte: { label: 'أكبر من أو يساوي', needsValue: true },
  lt: { label: 'أصغر من', needsValue: true },
  lte: { label: 'أصغر من أو يساوي', needsValue: true },
  answered: { label: 'تمت الإجابة عليه', needsValue: false },
  empty: { label: 'لم يُجب عليه', needsValue: false },
};

const BY_TYPE = {
  select_one: ['eq', 'ne', 'answered', 'empty'],
  select_multiple: ['has', 'lacks', 'answered', 'empty'],
  integer: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'answered', 'empty'],
  decimal: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'answered', 'empty'],
  range: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'answered'],
  calculate: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte'],
  date: ['eq', 'gt', 'lt', 'answered', 'empty'],
  text: ['eq', 'ne', 'answered', 'empty'],
  textarea: ['answered', 'empty'],
};

/* الأنواع التي يمكن أن يُبنى عليها شرط */
export const LOGIC_SOURCE_TYPES = new Set(Object.keys(BY_TYPE)
  .concat(['time', 'datetime', 'admin_area', 'geopoint', 'image', 'rank']));

export function opsFor(type) {
  return BY_TYPE[type] || ['answered', 'empty'];
}

const NUMERIC = new Set(['integer', 'decimal', 'range', 'calculate']);

/* المحرك لا يدعم الهروب داخل النص، فنزيل علامات الاقتباس من القيم */
const clean = (v) => String(v ?? '').replace(/['"]/g, '');

function literal(value, type) {
  if (NUMERIC.has(type) && value !== '' && Number.isFinite(Number(value))) return String(Number(value));
  return `'${clean(value)}'`;
}

export function isRuleComplete(rule) {
  if (!rule?.field || !rule?.op || !OPS[rule.op]) return false;
  if (OPS[rule.op].needsValue) return rule.value !== undefined && String(rule.value).trim() !== '';
  return true;
}

export function compileRule(rule, type) {
  const f = `\${${rule.field}}`;
  const v = () => literal(rule.value, type);
  switch (rule.op) {
    case 'eq': return `${f} = ${v()}`;
    case 'ne': return `${f} != ${v()}`;
    case 'has': return `selected(${f}, ${v()})`;
    case 'lacks': return `not(selected(${f}, ${v()}))`;
    case 'gt': return `${f} > ${v()}`;
    case 'gte': return `${f} >= ${v()}`;
    case 'lt': return `${f} < ${v()}`;
    case 'lte': return `${f} <= ${v()}`;
    case 'answered': return `answered(${f})`;
    case 'empty': return `empty(${f})`;
    default: return '';
  }
}

/* typeOf: اسم الحقل ← نوعه، لتقرير إن كانت القيمة رقماً أم نصاً */
export function compileLogic(logic, typeOf = () => 'text') {
  const rules = (logic?.rules || []).filter(isRuleComplete);
  if (rules.length === 0) return '';
  const parts = rules.map((r) => compileRule(r, typeOf(r.field)));
  if (parts.length === 1) return parts[0];
  const joiner = logic.mode === 'any' ? ' or ' : ' and ';
  return parts.map((p) => `(${p})`).join(joiner);
}

/* الوصف العربي: «نوع المنشأة يساوي مدرسة، و عدد الطوابق أكبر من 2» */
export function describeLogic(logic, nodeOf) {
  const rules = (logic?.rules || []).filter(isRuleComplete);
  if (rules.length === 0) return '';
  const parts = rules.map((r) => {
    const node = nodeOf(r.field);
    const name = node?.label || r.field;
    const op = OPS[r.op].label;
    if (!OPS[r.op].needsValue) return `«${name}» ${op}`;
    const shown = node?.choices?.find((c) => String(c.value) === String(r.value))?.label ?? r.value;
    return `«${name}» ${op} ${shown}`;
  });
  return parts.join(logic.mode === 'any' ? ' أو ' : ' و');
}

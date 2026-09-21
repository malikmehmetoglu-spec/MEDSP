/*
  اختبار الشروط المرئية: كل قاعدة تُحوَّل لتعبير ثم يقيّمه المحرك الفعلي.
  التشغيل: node src/survey/__tests__/logic.test.mjs
*/
import { compileLogic, describeLogic } from '../logic.js';
import { evaluateExpression, isTruthy, checkExpression } from '../expression.js';

const types = { kind: 'select_one', parts: 'select_multiple', n: 'integer', name: 'text', note: 'textarea' };
const ctx = { kind: 'school', parts: ['roof', 'walls'], n: 5, name: "O'Brien", note: '' };
const run = (logic) => {
  const expr = compileLogic(logic, (f) => types[f]);
  const ok = checkExpression(expr).valid;
  return { expr, ok, val: ok ? isTruthy(evaluateExpression(expr, ctx)) : null };
};
const one = (field, op, value) => ({ mode: 'all', rules: [{ field, op, value }] });

const cases = [
  [one('kind', 'eq', 'school'), true],
  [one('kind', 'eq', 'health'), false],
  [one('kind', 'ne', 'health'), true],
  [one('parts', 'has', 'roof'), true],
  [one('parts', 'has', 'water'), false],
  [one('parts', 'lacks', 'water'), true],
  [one('n', 'gt', '4'), true],
  [one('n', 'gt', '5'), false],
  [one('n', 'gte', '5'), true],
  [one('n', 'lt', '10'), true],
  [one('n', 'lte', '4'), false],
  [one('n', 'eq', '5'), true],
  [one('note', 'empty'), true],
  [one('note', 'answered'), false],
  [one('kind', 'answered'), true],
  /* اقتباس داخل القيمة لا يكسر التعبير */
  [one('name', 'eq', "O'Brien"), false],
  [{ mode: 'all', rules: [{ field: 'kind', op: 'eq', value: 'school' }, { field: 'n', op: 'gt', value: '3' }] }, true],
  [{ mode: 'all', rules: [{ field: 'kind', op: 'eq', value: 'school' }, { field: 'n', op: 'gt', value: '9' }] }, false],
  [{ mode: 'any', rules: [{ field: 'kind', op: 'eq', value: 'health' }, { field: 'n', op: 'gt', value: '3' }] }, true],
  [{ mode: 'any', rules: [{ field: 'kind', op: 'eq', value: 'health' }, { field: 'n', op: 'gt', value: '9' }] }, false],
];

let pass = 0;
const bad = [];
for (const [logic, want] of cases) {
  const r = run(logic);
  if (r.ok && r.val === want) pass += 1;
  else bad.push(`${JSON.stringify(logic.rules)} → ${r.expr} = ${r.val} (المتوقع ${want})`);
}

/* قاعدة ناقصة لا تُنتج شرطاً */
if (compileLogic(one('kind', 'eq', ''), () => 'select_one') === '') pass += 1;
else bad.push('قاعدة بلا قيمة أنتجت شرطاً');

const nodes = { kind: { label: 'نوع المنشأة', choices: [{ label: 'مدرسة', value: 'school' }] }, n: { label: 'عدد الطوابق' } };
const d = describeLogic({ mode: 'all', rules: [{ field: 'kind', op: 'eq', value: 'school' }, { field: 'n', op: 'gt', value: '2' }] }, (f) => nodes[f]);
if (d === '«نوع المنشأة» يساوي مدرسة و«عدد الطوابق» أكبر من 2') pass += 1;
else bad.push(`الوصف: ${d}`);

console.log(`نجح ${pass} / ${cases.length + 2}`);
if (bad.length) { bad.forEach((b) => console.error('  ' + b)); process.exit(1); }

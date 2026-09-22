/* الحقول المحسوبة: كل عملية تُحوَّل لتعبير ويقيّمه المحرك الفعلي */
import { compileCalc, describeCalc } from '../calc.js';
import { evaluateExpression, checkExpression } from '../expression.js';

const ctx = {
  a: 10, b: 4, c: 6, multi: ['x', 'y', 'z'],
  dob: `${new Date().getFullYear() - 30}-01-01`, d1: '2026-01-01', d2: '2026-01-11',
  fam: [{ age: 40, sex: 'f' }, { age: 12, sex: 'm' }, { age: 8, sex: 'f' }],
};
const cases = [
  [{ op: 'sum', fields: ['a', 'b', 'c'] }, 20],
  [{ op: 'diff', fields: ['a', 'b'] }, 6],
  [{ op: 'product', fields: ['a', 'b'] }, 40],
  [{ op: 'percent', fields: ['b', 'a'] }, 40],
  [{ op: 'avg', fields: ['a', 'b'] }, 7],
  [{ op: 'avg', fields: ['a', 'b', 'c'] }, 6.7],
  [{ op: 'repeat_count', repeat: 'fam' }, 3],
  [{ op: 'repeat_sum', repeat: 'fam', key: 'age' }, 60],
  [{ op: 'repeat_count_where', repeat: 'fam', key: 'sex', value: 'f' }, 2],
  [{ op: 'count_selected', fields: ['multi'] }, 3],
  [{ op: 'age', fields: ['dob'] }, 30],
  [{ op: 'days', fields: ['d1', 'd2'] }, 10],
  /* قيم فارغة لا تكسر الحساب */
  [{ op: 'sum', fields: ['a', 'missing'] }, 10],
  /* مقام صفري: غير معرّفة لا صفر */
  [{ op: 'percent', fields: ['a', 'missing'] }, ''],
];
let pass = 0; const bad = [];
for (const [calc, want] of cases) {
  const expr = compileCalc(calc);
  const ok = checkExpression(expr).valid;
  const got = ok ? evaluateExpression(expr, ctx, 'ERR') : 'INVALID';
  if (got === want) pass += 1; else bad.push(`${calc.op}: ${expr} = ${got} (المتوقع ${want})`);
}
if (compileCalc({ op: 'sum', fields: ['a'] }) === '') pass += 1; else bad.push('مجموع بحقل واحد أنتج تعبيراً');
const nodes = { fam: { label: 'الأفراد', children: [{ name: 'sex', label: 'الجنس', choices: [{ value: 'f', label: 'أنثى' }] }] } };
const d = describeCalc({ op: 'repeat_count_where', repeat: 'fam', key: 'sex', value: 'f' }, (n) => nodes[n]);
if (d === 'عدد مدخلات «الأفراد» التي فيها «الجنس» = أنثى') pass += 1; else bad.push(`وصف: ${d}`);
console.log(`نجح ${pass} / ${cases.length + 2}`);
if (bad.length) { bad.forEach((b) => console.error('  ' + b)); process.exit(1); }

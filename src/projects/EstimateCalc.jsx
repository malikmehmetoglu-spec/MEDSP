import { useState } from 'react';
import { REF, CU_RANGE, BF_RANGE, engineering } from './rubbleMethod';

/*
  حاسبة تقدير الأنقاض الموحّدة — الطريقة الهندسية من الدليل المعتمد.
  نفس المعادلة والمعاملات لكل الجهات، والمعاملات تُختار من المجالات المسموحة فقط.
*/

const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

function Field({ label, unit, hint, children }) {
  return (
    <label className="calc-f">
      <span className="calc-f__l">{label}{unit && <em>{unit}</em>}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export default function EstimateCalc() {
  const [v, setV] = useState({ n: '', area: '', floors: '', height: '', cu: '', bf: '' });
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const r = engineering(v);

  return (
    <section className="calc">
      <header className="calc__head">
        <div>
          <span className="rt-kicker">المنهجية المعتمدة · الطريقة الهندسية</span>
          <h3>حاسبة تقدير كميات الأنقاض</h3>
          <p>وفق «الدليل المختصر عن الآلية المعتمدة لتقدير كميات ترحيل الأنقاض — 2026». المعادلة والمعاملات موحّدة لكل الجهات العاملة.</p>
        </div>
        <div className="calc__formula" dir="ltr">V = n × A × N × Cu × Bf</div>
      </header>

      <div className="calc__body">
        <div className="calc__inputs">
          <Field label="عدد المباني المدمرة" unit="n · مبنى">
            <input className="q-input" type="number" min="0" inputMode="numeric" value={v.n} onChange={set('n')} placeholder="مثال: 12" />
          </Field>
          <Field label="مساحة المسقط الطابقي" unit="A · م²" hint="متوسط مساحة المبنى">
            <input className="q-input" type="number" min="0" inputMode="decimal" value={v.area} onChange={set('area')} placeholder="مثال: 150" />
          </Field>
          <Field label="عدد الطوابق" unit="N · طابق">
            <input className="q-input" type="number" min="0" inputMode="numeric" value={v.floors} onChange={set('floors')} placeholder="مثال: 4" />
          </Field>
          <Field label="ارتفاع الطابق (اختياري)" unit="م" hint={`فارغ = ${REF.floorHeight} م المعياري`}>
            <input className="q-input" type="number" min="0" inputMode="decimal" value={v.height} onChange={set('height')} placeholder={String(REF.floorHeight)} />
          </Field>
          <Field label="معامل الركام الإنشائي" unit="Cu · م³/م²" hint={`المجال ${CU_RANGE[0]}–${CU_RANGE[CU_RANGE.length - 1]}`}>
            <select className="q-input" value={v.cu} onChange={set('cu')}>
              <option value="">الافتراضي ({REF.cu})</option>
              {CU_RANGE.map((x) => <option key={x} value={x}>{x.toFixed(2)}</option>)}
            </select>
          </Field>
          <Field label="عامل الانتفاخ" unit="Bf" hint={`المجال ${BF_RANGE[0]}–${BF_RANGE[BF_RANGE.length - 1]}`}>
            <select className="q-input" value={v.bf} onChange={set('bf')}>
              <option value="">الافتراضي ({REF.bf})</option>
              {BF_RANGE.map((x) => <option key={x} value={x}>{x.toFixed(2)}</option>)}
            </select>
          </Field>
        </div>

        <div className={`calc__out${r ? '' : ' is-empty'}`}>
          {r ? (
            <>
              <span>حجم الأنقاض المقدّر</span>
              <b>{fmt(r.volume)}<em>م³</em></b>
              <p className="calc__sub" dir="ltr">
                {fmt(r.used.n)} × {fmt(r.used.A, 0)} × {fmt(r.used.N)} × {r.used.Cu} × {r.used.Bf}
              </p>
              <dl>
                <div><dt>لكل مبنى</dt><dd>{fmt(r.perBuilding, 1)} م³</dd></div>
                <div><dt>الوزن التقريبي (P = {REF.p} طن/م³)</dt><dd>{fmt(r.weight)} طن</dd></div>
                <div><dt>الحجم الإنشائي للمبنى (A × N × ارتفاع)</dt><dd>{fmt(r.structural, 0)} م³</dd></div>
              </dl>
            </>
          ) : (
            <p>أدخل عدد المباني المدمرة ومساحة المسقط وعدد الطوابق لتظهر النتيجة.</p>
          )}
        </div>
      </div>

      <p className="calc__note">إشعار: هذه الأداة داعمة للتقدير الفني، ومسؤولية القرار النهائي تقع على فريق الخبراء المختص بإصدار التقارير الفنية النهائية.</p>
    </section>
  );
}

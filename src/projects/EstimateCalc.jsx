import { useState } from 'react';
import { REF, CU_RANGE, BF_RANGE, DAMAGE, engineering, damageMethod } from './rubbleMethod';

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
  const [v, setV] = useState({ n: '', area: '', floors: '', height: '', cu: '', bf: '', destroyed: '', severe: '', moderate: '', light: '' });
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  /* المنهجية الثانية: n = المدمر كلياً + الشديد إن لم يُدخل n مباشرة */
  const r = engineering(v);
  const r1 = damageMethod(v);

  return (
    <section className="calc">
      <header className="calc__head">
        <div>
          <span className="rt-kicker">الدليل المعتمد · المنهجيتان الأولى والثانية</span>
          <h3>حاسبة تقدير كميات الأنقاض</h3>
          <p>وفق «الدليل المختصر عن الآلية المعتمدة لتقدير كميات ترحيل الأنقاض — 2026». المعادلة والمعاملات موحّدة لكل الجهات العاملة.</p>
        </div>
        <div className="calc__formula" dir="ltr">A × N × 3 × k &nbsp;|&nbsp; n × A × N × Cu × Bf</div>
      </header>

      <div className="calc__body">
        <div className="calc__inputs">
          {DAMAGE.map((d) => (
            <Field key={d.key} label={`عدد المباني: ${d.label}`} unit={`× ${d.share}`} hint={d.key === 'destroyed' ? 'المنهجية الأولى' : undefined}>
              <input className="q-input" type="number" min="0" inputMode="numeric" value={v[d.key]} onChange={set(d.key)} placeholder="0" />
            </Field>
          ))}
          <Field label="عدد المباني المدمرة" unit="n · مبنى" hint="المنهجية الثانية">
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

        <div className="calc__outs">
        <div className={`calc__out${r1 ? '' : ' is-empty'}`}>
          {r1 ? (
            <>
              <span>المنهجية الأولى · حصر الأضرار</span>
              <b>{fmt(r1.volume)}<em>م³</em></b>
              <p className="calc__sub">الحجم الإنشائي للمبنى {fmt(r1.structural)} م³ × معامل التحويل</p>
              <dl>
                {DAMAGE.filter((d) => r1.by[d.key] > 0).map((d) => <div key={d.key}><dt>{d.label} (× {d.share})</dt><dd>{fmt(r1.by[d.key])} م³</dd></div>)}
                <div><dt>الوزن التقريبي</dt><dd>{fmt(r1.weight)} طن</dd></div>
              </dl>
            </>
          ) : <p>المنهجية الأولى: أدخل أعداد المباني حسب درجة الضرر مع المساحة وعدد الطوابق.</p>}
        </div>
        <div className={`calc__out${r ? '' : ' is-empty'}`}>
          {r ? (
            <>
              <span>المنهجية الثانية · الهندسية</span>
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
            <p>المنهجية الثانية: أدخل عدد المباني المدمرة ومساحة المسقط وعدد الطوابق.</p>
          )}
        </div>
        </div>
      </div>

      <p className="calc__note">إشعار: هذه الأداة داعمة للتقدير الفني، ومسؤولية القرار النهائي تقع على فريق الخبراء المختص بإصدار التقارير الفنية النهائية.</p>
    </section>
  );
}

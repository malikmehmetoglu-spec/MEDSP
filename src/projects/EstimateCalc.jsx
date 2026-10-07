import { useState } from 'react';
import { REF, DAMAGE, damageMethod } from './rubbleMethod';

/*
  حاسبة تقدير كميات الأنقاض — المنهجية المعتمدة (حصر الأضرار) من الدليل 2026:
    الحجم الإنشائي = المساحة × عدد الطوابق × ارتفاع الطابق
    كمية الأنقاض = Σ عدد المباني في كل درجة ضرر × الحجم الإنشائي × معامل التحويل
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
  const [v, setV] = useState({ area: '', floors: '', height: '', destroyed: '', severe: '', moderate: '', light: '' });
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const r = damageMethod(v);

  return (
    <section className="calc">
      <header className="calc__head">
        <div>
          <span className="rt-kicker">المنهجية المعتمدة · حصر الأضرار</span>
          <h3>حاسبة تقدير كميات الأنقاض</h3>
          <p>وفق «الآلية المعتمدة لتقدير كميات ترحيل الأنقاض — 2026». المعادلة والمعاملات موحّدة لكل الجهات العاملة.</p>
        </div>
        <div className="calc__formula">الأنقاض = المساحة × الطوابق × {REF.floorHeight} م × معامل الضرر</div>
      </header>

      <div className="calc__body">
        <div className="calc__inputs">
          {DAMAGE.map((d) => (
            <Field key={d.key} label={`عدد المباني: ${d.label}`} unit={`معامل ${d.share}`}>
              <input className="q-input" type="number" min="0" inputMode="numeric" value={v[d.key]} onChange={set(d.key)} placeholder="0" />
            </Field>
          ))}
          <Field label="متوسط مساحة المبنى" unit="م²">
            <input className="q-input" type="number" min="0" inputMode="decimal" value={v.area} onChange={set('area')} placeholder="مثال: 150" />
          </Field>
          <Field label="متوسط عدد الطوابق" unit="طابق">
            <input className="q-input" type="number" min="0" inputMode="numeric" value={v.floors} onChange={set('floors')} placeholder="مثال: 4" />
          </Field>
          <Field label="ارتفاع الطابق (اختياري)" unit="م" hint={`فارغ = ${REF.floorHeight} م المعياري`}>
            <input className="q-input" type="number" min="0" inputMode="decimal" value={v.height} onChange={set('height')} placeholder={String(REF.floorHeight)} />
          </Field>
        </div>

        <div className={`calc__out${r ? '' : ' is-empty'}`}>
          {r ? (
            <>
              <span>حجم الأنقاض المقدّر</span>
              <b>{fmt(r.volume)}<em>م³</em></b>
              <p className="calc__sub">الحجم الإنشائي للمبنى الواحد {fmt(r.structural)} م³ × معامل الضرر</p>
              <dl>
                {DAMAGE.filter((d) => r.by[d.key] > 0).map((d) => <div key={d.key}><dt>{d.label} (× {d.share})</dt><dd>{fmt(r.by[d.key])} م³</dd></div>)}
                <div><dt>الوزن التقريبي ({REF.p} طن/م³)</dt><dd>{fmt(r.weight)} طن</dd></div>
              </dl>
            </>
          ) : <p>أدخل أعداد المباني حسب درجة الضرر، مع متوسط مساحة المبنى وعدد الطوابق.</p>}
        </div>
      </div>

      <p className="calc__note">إشعار: هذه الأداة داعمة للتقدير الفني، ومسؤولية القرار النهائي تقع على فريق الخبراء المختص بإصدار التقارير الفنية النهائية.</p>
    </section>
  );
}

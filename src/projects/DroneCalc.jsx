import { useState } from 'react';
import { REF } from './rubbleMethod';

/*
  حساب حجم الأنقاض بالطائرات المسيّرة والاستشعار عن بُعد (الدليل المعتمد، البندان 6.1-د و7):
   - المساحة × متوسط الارتفاع (من نموذج الارتفاعات DSM للمسيّرة أو الصور الفضائية)
   - مجموع المقاطع الطبوغرافية: V = Σ ((Sᵢ + Sᵢ₊₁) / 2) × المسافة بين المقاطع
*/
const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d });

export default function DroneCalc() {
  const [mode, setMode] = useState('area');
  const [area, setArea] = useState('');
  const [h, setH] = useState('');
  const [step, setStep] = useState('');
  const [secs, setSecs] = useState('');

  const list = secs.split(/[\s,،]+/).map(Number).filter((x) => x > 0);
  const vol = mode === 'area'
    ? (Number(area) > 0 && Number(h) > 0 ? Number(area) * Number(h) : null)
    : (list.length > 1 && Number(step) > 0 ? list.slice(1).reduce((a, s, i) => a + ((s + list[i]) / 2) * Number(step), 0) : null);

  return (
    <section className="calc drone">
      <header className="calc__head">
        <div>
          <span className="rt-kicker">الدليل المعتمد · البند 7</span>
          <h3>قياس الأنقاض بالطائرات المسيّرة والاستشعار عن بُعد</h3>
          <p>تحدّد الصور الفضائية (قبل/بعد) نطاق الدمار، ثم تمسح المسيّرة الموقع بالتصوير المساحي (Photogrammetry) لتنتج سحابة نقاط ونموذج ارتفاعات،
            ومنه تُقاس الكمية الفعلية — وتُستخدم لمعايرة التقديرات النظرية ومتابعة المكبات.</p>
        </div>
      </header>
      <div className="hub-chips">
        <button type="button" className={mode === 'area' ? 'is-on' : ''} onClick={() => setMode('area')}>المساحة × متوسط الارتفاع</button>
        <button type="button" className={mode === 'sec' ? 'is-on' : ''} onClick={() => setMode('sec')}>مجموع المقاطع الطبوغرافية</button>
      </div>
      <div className="calc__body">
        <div className="calc__inputs">
          {mode === 'area' ? (
            <>
              <label className="calc-f"><span className="calc-f__l">مساحة كتلة الأنقاض<em>م²</em></span>
                <input className="q-input" type="number" min="0" value={area} onChange={(e) => setArea(e.target.value)} placeholder="من مخطط المسيّرة" /></label>
              <label className="calc-f"><span className="calc-f__l">متوسط الارتفاع<em>م</em></span>
                <input className="q-input" type="number" min="0" value={h} onChange={(e) => setH(e.target.value)} placeholder="من نموذج الارتفاعات" /></label>
            </>
          ) : (
            <>
              <label className="calc-f"><span className="calc-f__l">مساحات المقاطع بالترتيب<em>م²</em></span>
                <input className="q-input" value={secs} onChange={(e) => setSecs(e.target.value)} placeholder="مثال: 40, 65, 72, 50" /></label>
              <label className="calc-f"><span className="calc-f__l">المسافة بين المقاطع<em>م</em></span>
                <input className="q-input" type="number" min="0" value={step} onChange={(e) => setStep(e.target.value)} placeholder="مثال: 5" /></label>
            </>
          )}
        </div>
        <div className={`calc__out${vol ? '' : ' is-empty'}`}>
          {vol ? (
            <>
              <span>الحجم المقاس</span>
              <b>{fmt(vol)}<em>م³</em></b>
              <dl><div><dt>الوزن التقريبي (P = {REF.p})</dt><dd>{fmt(vol * REF.p)} طن</dd></div>
                <div><dt>شاحنات 20 م³ تقريباً</dt><dd>{fmt(Math.ceil(vol / 20))}</dd></div></dl>
            </>
          ) : <p>أدخل القياسات المستخرجة من معالجة صور المسيّرة.</p>}
        </div>
      </div>
    </section>
  );
}

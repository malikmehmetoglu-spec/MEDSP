import { useState } from 'react';
import Icon from '../components/Icon';

/*
  مشاركة رابط الاستبيان مع الباحثين.

  الرابط من شكل:  <الموقع>/#/s/<معرّف الاستبيان>
  يفتح صفحة تعبئة مستقلة، بلا وصول إلى أي شيء إداري.
*/

export default function SharePanel({ survey, onUpdate }) {
  const [copied, setCopied] = useState(false);
  const [pw, setPw] = useState(survey.password || '');
  const [showPw, setShowPw] = useState(false);

  const url = `${window.location.origin}${window.location.pathname}#/s/${survey.id}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* بعض المتصفحات تمنع الحافظة بلا تفاعل مباشر — نختار النص بدلاً منها */
      const el = document.getElementById('share-url');
      if (el) { el.select(); document.execCommand('copy'); }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const toggleOpen = () => onUpdate({ open: !survey.open, password: pw, closesAt: survey.closesAt || '' });
  const savePw = () => onUpdate({ open: survey.open, password: pw, closesAt: survey.closesAt || '' });
  const setClose = (closesAt) => onUpdate({ open: survey.open, password: pw, closesAt });

  const expired = survey.closesAt && new Date(survey.closesAt) < new Date();

  return (
    <div className="share">
      <div className={`share__state${survey.open ? ' is-open' : ''}`}>
        <div className="share__statetext">
          <strong>{survey.open ? 'الاستبيان مفتوح للتعبئة' : 'الاستبيان مغلق'}</strong>
          <span>
            {survey.open
              ? 'من يملك الرابط يستطيع التعبئة الآن.'
              : 'الرابط لا يعمل حتى تفتحه.'}
          </span>
        </div>
        <button
          type="button"
          className={`share__switch${survey.open ? ' is-on' : ''}`}
          onClick={toggleOpen}
          role="switch"
          aria-checked={survey.open}
        >
          <span className="share__knob" />
        </button>
      </div>

      {expired && survey.open && (
        <p className="share__warn">
          انتهى تاريخ الإغلاق، فالرابط لا يقبل إجابات جديدة. غيّر التاريخ أو امسحه لإعادة فتحه.
        </p>
      )}

      <div className="share__link">
        <span className="bf__label">
          <Icon name="link" className="share__labelicon" />
          رابط التعبئة
        </span>
        <div className="share__row">
          <input id="share-url" className="q-input share__url" value={url} readOnly dir="ltr"
            onFocus={(e) => e.target.select()} />
          <button type="button" className={`share__copy${copied ? ' is-done' : ''}`} onClick={copy}>
            <Icon name={copied ? 'check' : 'copy'} />
            {copied ? 'نُسخ' : 'نسخ'}
          </button>
        </div>
        <span className="bf__hint">
          أرسل هذا الرابط للباحثين. يفتح صفحة التعبئة وحدها، بلا وصول لأي بيانات أخرى.
        </span>
      </div>

      <div className="share__grid">
        <div className="bf">
          <span className="bf__label">
            <Icon name="lock" className="share__labelicon" />
            كلمة مرور
          </span>
          <div className="share__row">
            <input
              className="q-input bf__input"
              type={showPw ? 'text' : 'password'}
              value={pw}
              placeholder="اتركها فارغة ليفتح بلا كلمة مرور"
              onChange={(e) => setPw(e.target.value)}
            />
            <button type="button" className="q-btn q-btn--sm" onClick={() => setShowPw(!showPw)}>
              {showPw ? 'إخفاء' : 'إظهار'}
            </button>
            <button type="button" className="q-btn q-btn--sm" onClick={savePw}
              disabled={pw === (survey.password || '')}>
              حفظ
            </button>
          </div>
          <span className="bf__hint">
            تُطلب قبل عرض الأسئلة. حاجز تنظيمي يمنع التعبئة العرضية، لا حماية تشفيرية.
          </span>
        </div>

        <label className="bf">
          <span className="bf__label">إغلاق تلقائي</span>
          <input
            className="q-input bf__input"
            type="date"
            value={survey.closesAt || ''}
            onChange={(e) => setClose(e.target.value)}
          />
          <span className="bf__hint">اختياري — يتوقف الرابط عن قبول الإجابات بعد هذا اليوم.</span>
        </label>
      </div>
    </div>
  );
}

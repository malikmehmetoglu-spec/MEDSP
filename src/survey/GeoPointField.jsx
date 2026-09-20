import { useState } from 'react';
import Icon from '../components/Icon';

/*
  التقاط إحداثيات عبر GPS الجهاز.

  ملاحظة سيادة البيانات: لا نستخدم أي خدمة تحديد مواقع خارجية ولا
  خرائط طرف ثالث — نقرأ من مستشعر الجهاز مباشرة عبر واجهة المتصفح
  القياسية، ونعرض النتيجة رقمياً. هذا يتسق مع قرار المنصة بعدم
  الاعتماد على خدمات خرائط خارجية.
*/

const fmt = (n) => Number(n).toFixed(5);

export default function GeoPointField({ node, value, onChange }) {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const capture = () => {
    if (!navigator.geolocation) {
      setError('هذا الجهاز لا يدعم تحديد الموقع');
      setStatus('error');
      return;
    }
    setStatus('busy');
    setError('');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy, altitude } = pos.coords;
        onChange({
          lat: Number(latitude.toFixed(6)),
          lng: Number(longitude.toFixed(6)),
          accuracy: accuracy ? Math.round(accuracy) : null,
          altitude: altitude != null ? Math.round(altitude) : null,
          at: new Date().toISOString(),
        });
        setStatus('ready');
      },
      (err) => {
        const messages = {
          1: 'رُفض إذن الوصول للموقع. فعّله من إعدادات المتصفح.',
          2: 'تعذّر تحديد الموقع. تأكد من تفعيل GPS.',
          3: 'انتهت المهلة قبل تحديد الموقع. حاول في مكان مكشوف.',
        };
        setError(messages[err.code] || 'تعذّر تحديد الموقع');
        setStatus('error');
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  };

  /* دقة أسوأ من الحد المطلوب تُعرض كتحذير، لا كخطأ يمنع المتابعة */
  const poor = value?.accuracy && node.minAccuracy && value.accuracy > node.minAccuracy;

  return (
    <div className="q-geo">
      {value ? (
        <div className="q-geo__result">
          <div className="q-geo__coords">
            <div>
              <span className="q-geo__key">خط العرض</span>
              <span className="q-geo__val">{fmt(value.lat)}</span>
            </div>
            <div>
              <span className="q-geo__key">خط الطول</span>
              <span className="q-geo__val">{fmt(value.lng)}</span>
            </div>
            {value.accuracy != null && (
              <div>
                <span className="q-geo__key">الدقة</span>
                <span className={`q-geo__val${poor ? ' is-poor' : ''}`}>±{value.accuracy} م</span>
              </div>
            )}
          </div>
          {poor && (
            <p className="q-warn">
              الدقة أقل من المطلوب (±{node.minAccuracy} م). حاول في مكان مكشوف لنتيجة أدق.
            </p>
          )}
          <div className="q-geo__actions">
            <button type="button" className="q-btn q-btn--ghost" onClick={capture} disabled={status === 'busy'}>
              {status === 'busy' ? 'جارٍ التحديد…' : 'إعادة التحديد'}
            </button>
            <button type="button" className="q-btn q-btn--danger" onClick={() => { onChange(null); setStatus('idle'); }}>
              مسح
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="q-geo__capture" onClick={capture} disabled={status === 'busy'}>
          <Icon name="pin" className="q-geo__icon" />
          <span>{status === 'busy' ? 'جارٍ تحديد الموقع…' : 'تحديد الموقع الحالي'}</span>
        </button>
      )}
      {error && <p className="q-error">{error}</p>}
    </div>
  );
}

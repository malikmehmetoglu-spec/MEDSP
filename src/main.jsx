import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/app.css';
import './styles/survey.css';
import './styles/admin.css';
import './styles/builder.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

/*
  عامل الخدمة للعمل بلا إنترنت — في النسخة المنشورة فقط.
  بعد تفعيله نرسل له قائمة ما حمّلته الصفحة قبل أن يتولى التحكم
  (السكربتات والخطوط في الزيارة الأولى)، فيحفظها كلها.
*/
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready).then((reg) => {
      const urls = [
        window.location.href.split('#')[0],
        ...performance.getEntriesByType('resource').map((e) => e.name),
      ];
      reg.active?.postMessage({ type: 'cache-urls', urls });
    }).catch(() => { /* المتصفح لا يدعمه أو في وضع خاص — تعمل المنصة كالمعتاد */ });
  });
}

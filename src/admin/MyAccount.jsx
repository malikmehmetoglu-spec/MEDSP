import { useState } from 'react';
import * as store from '../projects/store';

const ROLE = { super_admin: 'مدير المنصة', admin: 'مشرف' };

export default function MyAccount({ me }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setMsg(null);
    if (pw !== pw2) { setMsg({ bad: true, text: 'كلمتا المرور غير متطابقتين' }); return; }
    setBusy(true);
    try {
      await store.changeOwnPassword(pw);
      setPw(''); setPw2('');
      setMsg({ bad: false, text: 'تغيّرت كلمة المرور. استخدمها في دخولك القادم.' });
    } catch (err) {
      setMsg({ bad: true, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="accounts">
      <h2>حسابي</h2>
      <dl className="cred__pair me__pair">
        <dt>الاسم</dt><dd>{me.displayName}</dd>
        <dt>اسم المستخدم</dt><dd dir="ltr">{me.username}</dd>
        <dt>الدور</dt><dd>{ROLE[me.role]}</dd>
      </dl>

      <div className="accounts__form">
        <h3 className="me__h">تغيير كلمة المرور</h3>
        <div className="bf__row">
          <label className="bf">
            <span className="bf__label">كلمة المرور الجديدة</span>
            <input className="q-input bf__input" type="password" dir="ltr" value={pw}
              autoComplete="new-password" onChange={(e) => setPw(e.target.value)} />
          </label>
          <label className="bf">
            <span className="bf__label">أعد كتابتها</span>
            <input className="q-input bf__input" type="password" dir="ltr" value={pw2}
              autoComplete="new-password" onChange={(e) => setPw2(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()} />
          </label>
        </div>
        <span className="bf__hint">8 أحرف على الأقل.</span>
        {msg && <p className={msg.bad ? 'auth__err' : 'auth__info'}>{msg.text}</p>}
        <div className="pedit__save">
          <button type="button" className="survey__navbtn survey__navbtn--primary"
            onClick={save} disabled={busy || pw.length < 8}>
            {busy ? 'لحظة…' : 'تغيير كلمة المرور'}
          </button>
        </div>
      </div>
    </div>
  );
}

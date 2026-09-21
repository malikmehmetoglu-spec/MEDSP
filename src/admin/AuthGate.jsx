import { useEffect, useState } from 'react';
import * as store from '../projects/store';
import Icon from '../components/Icon';

/*
  بوابة الدخول لمساحة العمل.

  ثلاث حالات:
    - غير مسجّل          → نموذج دخول / إنشاء حساب
    - مسجّل لكن ليس مشرفاً → رسالة توضّح أن الحساب ينتظر التفعيل
    - مشرف               → مساحة العمل

  الحماية الحقيقية في قاعدة البيانات (RLS): حتى لو تجاوز أحدهم هذه
  الشاشة، لن يقرأ أو يكتب أي صف ما لم يكن في جدول المشرفين.
*/

function LoginForm() {
  const [mode, setMode] = useState('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    setInfo('');
    if (!email || !password) { setError('أدخل البريد وكلمة المرور'); return; }
    setBusy(true);
    try {
      if (mode === 'in') {
        await store.signIn(email.trim(), password);
      } else {
        if (password.length < 8) throw new Error('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
        const res = await store.signUp(email.trim(), password);
        if (!res.session) {
          setInfo('أُنشئ الحساب. افتح رسالة التأكيد في بريدك، ثم عد لتسجيل الدخول.');
          setMode('in');
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth__card">
        <Icon name="lock" className="auth__icon" />
        <h1>{mode === 'in' ? 'الدخول إلى مساحة العمل' : 'إنشاء حساب'}</h1>
        <p className="auth__lede">
          {mode === 'in'
            ? 'لإدارة المشاريع والاستبيانات ومراجعة الإجابات.'
            : 'بعد الإنشاء يحتاج الحساب تفعيلاً من مسؤول المنصة قبل أن يصل إلى المشاريع.'}
        </p>

        <label className="bf">
          <span className="bf__label">البريد الإلكتروني</span>
          <input className="q-input bf__input" type="email" dir="ltr" value={email}
            autoComplete="email" autoFocus
            onChange={(e) => setEmail(e.target.value)} />
        </label>

        <label className="bf">
          <span className="bf__label">كلمة المرور</span>
          <input className="q-input bf__input" type="password" dir="ltr" value={password}
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </label>

        {error && <p className="auth__err">{error}</p>}
        {info && <p className="auth__info">{info}</p>}

        <button type="button" className="survey__navbtn survey__navbtn--primary auth__submit"
          onClick={submit} disabled={busy}>
          {busy ? 'لحظة…' : mode === 'in' ? 'دخول' : 'إنشاء الحساب'}
        </button>

        <button type="button" className="auth__switch"
          onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setError(''); setInfo(''); }}>
          {mode === 'in' ? 'ليس لديك حساب؟ أنشئ واحداً' : 'لديك حساب؟ سجّل الدخول'}
        </button>
      </div>
    </div>
  );
}

export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined);
  const [admin, setAdmin] = useState(null);

  useEffect(() => {
    store.getSession().then(setSession);
    return store.onAuthChange(setSession);
  }, []);

  useEffect(() => {
    if (!session) { setAdmin(null); return; }
    store.checkAdmin().then(setAdmin);
  }, [session]);

  if (session === undefined || (session && admin === null)) {
    return <div className="auth"><p className="auth__lede">جارٍ التحقق…</p></div>;
  }

  if (!session) return <LoginForm />;

  if (!admin) {
    return (
      <div className="auth">
        <div className="auth__card">
          <Icon name="lock" className="auth__icon" />
          <h1>الحساب بانتظار التفعيل</h1>
          <p className="auth__lede">
            سجّلت الدخول بـ <strong dir="ltr">{session.user.email}</strong>، لكن هذا الحساب
            لم يُمنح صلاحية إدارة المشاريع بعد. اطلب من مسؤول المنصة تفعيله.
          </p>
          <button type="button" className="q-btn" onClick={store.signOut}>تسجيل الخروج</button>
        </div>
      </div>
    );
  }

  return children({ user: session.user, signOut: store.signOut });
}

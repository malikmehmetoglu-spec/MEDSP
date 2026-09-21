import { useCallback, useEffect, useState } from 'react';
import * as store from '../projects/store';

/*
  إدارة الحسابات — تظهر للسوبر أدمن فقط.
  وحتى لو ظهرت لغيره، الدوال على الخادم ترفض أي طلب من غير السوبر أدمن.
*/

const ROLE = { super_admin: 'مدير المنصة', admin: 'مشرف' };

/* كلمة مرور مؤقتة مقروءة: بلا أحرف متشابهة (0/O، 1/l/I) */
function generatePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  const raw = Array.from(bytes, (b) => chars[b % chars.length]).join('');
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB') : '—');

function Credential({ username, password, onDone }) {
  const [copied, setCopied] = useState(false);
  const text = `اسم المستخدم: ${username}\nكلمة المرور: ${password}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); } catch { /* يُنسخ يدوياً */ }
  };
  return (
    <div className="cred">
      <strong className="cred__title">احفظ بيانات الدخول الآن</strong>
      <p className="cred__lede">
        كلمة المرور تُخزَّن مشفّرة ولن تظهر مرة أخرى. أرسلها للمشرف بطريقة آمنة.
      </p>
      <dl className="cred__pair">
        <dt>اسم المستخدم</dt><dd dir="ltr">{username}</dd>
        <dt>كلمة المرور</dt><dd dir="ltr">{password}</dd>
      </dl>
      <div className="cred__actions">
        <button type="button" className="q-btn" onClick={copy}>{copied ? 'نُسخت' : 'نسخ البيانات'}</button>
        <button type="button" className="survey__navbtn survey__navbtn--primary" onClick={onDone}>
          حفظتها
        </button>
      </div>
    </div>
  );
}

export default function AccountsPanel({ me }) {
  const [accounts, setAccounts] = useState(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ username: '', displayName: '', password: '' });
  const [issued, setIssued] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setAccounts(await store.listAccounts()); setError(''); }
    catch (err) { setError(err.message); setAccounts([]); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openForm = () => {
    setForm({ username: '', displayName: '', password: generatePassword() });
    setAdding(true);
    setError('');
  };

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      await store.createAccount(form);
      setIssued({ username: form.username.trim().toLowerCase(), password: form.password });
      setAdding(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const reset = async (acc) => {
    const pw = generatePassword();
    if (!window.confirm(`إعادة تعيين كلمة مرور ${acc.displayName}؟ ستتوقف كلمته الحالية فوراً.`)) return;
    try {
      await store.resetAccountPassword(acc.id, pw);
      setIssued({ username: acc.username, password: pw });
    } catch (err) { setError(err.message); }
  };

  const remove = async (acc) => {
    if (!window.confirm(`حذف حساب ${acc.displayName} نهائياً؟ لن يستطيع الدخول بعدها. البيانات التي أنشأها تبقى.`)) return;
    try { await store.deleteAccount(acc.id); await load(); } catch (err) { setError(err.message); }
  };

  return (
    <div className="accounts">
      <div className="plist__head">
        <div>
          <h2>الحسابات</h2>
          <p className="accounts__lede">المشرفون يديرون المشاريع والاستبيانات والإجابات. أنت وحدك تنشئ حساباتهم.</p>
        </div>
        {!adding && !issued && (
          <button type="button" className="survey__navbtn survey__navbtn--primary" onClick={openForm}>
            + حساب مشرف
          </button>
        )}
      </div>

      {error && <p className="share__warn">{error}</p>}

      {issued && <Credential {...issued} onDone={() => setIssued(null)} />}

      {adding && (
        <div className="accounts__form">
          <div className="bf__row">
            <label className="bf">
              <span className="bf__label">الاسم الظاهر</span>
              <input className="q-input bf__input" value={form.displayName} autoFocus
                placeholder="مثال: أحمد العلي"
                onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
            </label>
            <label className="bf">
              <span className="bf__label">اسم المستخدم</span>
              <input className="q-input bf__input" dir="ltr" value={form.username}
                placeholder="ahmad.ali" autoCapitalize="none" spellCheck={false}
                onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s/g, '') })} />
              <span className="bf__hint">أحرف إنجليزية صغيرة وأرقام و . _ -</span>
            </label>
          </div>
          <label className="bf">
            <span className="bf__label">كلمة المرور</span>
            <div className="share__row">
              <input className="q-input bf__input" dir="ltr" value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })} />
              <button type="button" className="q-btn q-btn--sm"
                onClick={() => setForm({ ...form, password: generatePassword() })}>توليد</button>
            </div>
            <span className="bf__hint">مولّدة عشوائياً. يستطيع المشرف تغييرها بعد دخوله.</span>
          </label>
          <div className="pedit__save">
            <button type="button" className="survey__navbtn survey__navbtn--primary"
              onClick={create} disabled={busy || !form.username || form.password.length < 8}>
              {busy ? 'جارٍ الإنشاء…' : 'إنشاء الحساب'}
            </button>
            <button type="button" className="q-btn" onClick={() => setAdding(false)}>إلغاء</button>
          </div>
        </div>
      )}

      {accounts === null ? (
        <p className="results__empty">جارٍ التحميل…</p>
      ) : (
        <div className="results__scroll">
          <table className="results__table">
            <thead>
              <tr>
                <th>الاسم</th><th>اسم المستخدم</th><th>الدور</th>
                <th>أُنشئ</th><th>آخر دخول</th><th />
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => {
                const self = acc.username === me.username;
                const isSuper = acc.role === 'super_admin';
                return (
                  <tr key={acc.id}>
                    <td>{acc.displayName}{self && <span className="accounts__you">أنت</span>}</td>
                    <td dir="ltr" className="results__date">{acc.username}</td>
                    <td><span className={`tag${isSuper ? ' tag--pending' : ''}`}>{ROLE[acc.role]}</span></td>
                    <td className="results__date">{fmtDate(acc.createdAt)}</td>
                    <td className="results__date">{acc.lastSignIn ? fmtDate(acc.lastSignIn) : 'لم يدخل بعد'}</td>
                    <td>
                      {!isSuper && (
                        <span className="accounts__acts">
                          <button type="button" className="q-btn q-btn--sm" onClick={() => reset(acc)}>
                            كلمة مرور جديدة
                          </button>
                          <button type="button" className="q-btn q-btn--sm q-btn--danger" onClick={() => remove(acc)}>
                            حذف
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { getPublicSurvey, unlockSurvey, createResponse } from './store';
import SurveyPage from '../survey/SurveyPage';
import Icon from '../components/Icon';

/*
  صفحة التعبئة العامة — ما يفتحه الباحث عبر الرابط المشترك.
  لا تعرض أي شيء إداري: لا نتائج، ولا مشاريع أخرى، ولا أزرار نشر.
*/

function Shell({ children }) {
  return <section className="shell fillpage">{children}</section>;
}

function Message({ icon, title, body }) {
  return (
    <Shell>
      <div className="fillpage__msg">
        {icon && <Icon name={icon} className="fillpage__icon" />}
        <h1>{title}</h1>
        <p>{body}</p>
      </div>
    </Shell>
  );
}

export default function FillPage({ surveyId }) {
  const [state, setState] = useState({ status: 'loading' });
  const [definition, setDefinition] = useState(null);
  const [attempt, setAttempt] = useState('');
  const [password, setPassword] = useState(null);
  const [wrong, setWrong] = useState(false);
  const [checking, setChecking] = useState(false);
  const [done, setDone] = useState(false);
  const [sendError, setSendError] = useState('');

  useEffect(() => {
    let alive = true;
    getPublicSurvey(surveyId).then((res) => {
      if (!alive) return;
      setState(res);
      /* غير المحمي يأتي بتعريفه مباشرة؛ المحمي لا يُكشف قبل كلمة المرور */
      if (res.status === 'ok' && !res.needsPassword) setDefinition(res.survey);
    });
    return () => { alive = false; };
  }, [surveyId]);

  if (state.status === 'loading') {
    return <Message title="جارٍ التحميل" body="لحظة من فضلك." />;
  }

  if (state.status === 'missing') {
    return (
      <Message
        title="الرابط غير صحيح"
        body="لا يوجد استبيان بهذا الرابط. تأكد من نسخه كاملاً، أو اطلب رابطاً جديداً ممن أرسله لك."
      />
    );
  }

  if (state.status === 'closed') {
    return (
      <Message
        icon="lock"
        title="الاستبيان مغلق"
        body="هذا الاستبيان لا يستقبل إجابات حالياً. تواصل مع مديرية التخطيط والإحصاء إن كنت تظن أن هذا خطأ."
      />
    );
  }

  if (state.status === 'expired') {
    return (
      <Message
        title="انتهت مدة التعبئة"
        body="أُغلق هذا الاستبيان في موعده المحدد ولم يعد يستقبل إجابات."
      />
    );
  }

  if (state.needsPassword && !definition) {
    /* التحقق على الخادم — المتصفح لا يرى الأسئلة قبل كلمة مرور صحيحة */
    const submit = async () => {
      if (!attempt) return;
      setChecking(true);
      const def = await unlockSurvey(surveyId, attempt);
      setChecking(false);
      if (def) { setDefinition(def); setPassword(attempt); setWrong(false); }
      else { setWrong(true); }
    };

    return (
      <Shell>
        <div className="gate">
          <Icon name="lock" className="gate__icon" />
          <h1>{state.survey.title}</h1>
          <p className="gate__lede">هذا الاستبيان محمي. أدخل كلمة المرور التي وصلتك للمتابعة.</p>
          <div className="gate__row">
            <input
              className={`q-input gate__input${wrong ? ' is-bad' : ''}`}
              type="password"
              value={attempt}
              autoFocus
              placeholder="كلمة المرور"
              onChange={(e) => { setAttempt(e.target.value); setWrong(false); }}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
            <button type="button" className="survey__navbtn survey__navbtn--primary"
              onClick={submit} disabled={checking}>
              {checking ? 'جارٍ التحقق…' : 'دخول'}
            </button>
          </div>
          {wrong && <p className="gate__err">كلمة المرور غير صحيحة. تحقق منها وحاول مجدداً.</p>}
        </div>
      </Shell>
    );
  }

  if (!definition) {
    return <Message title="جارٍ التحميل" body="لحظة من فضلك." />;
  }

  if (done) {
    return (
      <Shell>
        <div className="fillpage__msg">
          <Icon name="check" className="fillpage__icon fillpage__icon--ok" />
          <h1>وصلت إجابتك</h1>
          <p>شكراً لك. ستُراجع البيانات قبل اعتمادها.</p>
          <button
            type="button"
            className="survey__navbtn survey__navbtn--primary"
            onClick={() => { setDone(false); window.scrollTo(0, 0); }}
          >
            تعبئة استمارة أخرى
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <div className="fillpage">
      {state.projectName && (
        <div className="fillpage__crumb">
          <div className="shell">{state.projectName}</div>
        </div>
      )}
      {sendError && (
        <div className="shell"><p className="share__warn">{sendError}</p></div>
      )}
      <SurveyPage
        definition={definition}
        submitLabel="إرسال الإجابة"
        onSubmit={async (answers) => {
          setSendError('');
          try {
            await createResponse(surveyId, answers, { source: 'link', password });
            setDone(true);
            window.scrollTo(0, 0);
          } catch (err) {
            setSendError(`${err.message}. إجاباتك ما زالت هنا — حاول الإرسال مجدداً.`);
            window.scrollTo(0, 0);
            throw err;
          }
        }}
        hideReview
      />
    </div>
  );
}

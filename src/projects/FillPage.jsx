import { useEffect, useState } from 'react';
import { getPublicSurvey, verifySurveyPassword, createResponse } from './store';
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
  const [unlocked, setUnlocked] = useState(false);
  const [attempt, setAttempt] = useState('');
  const [wrong, setWrong] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    getPublicSurvey(surveyId).then((res) => { if (alive) setState(res); });
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

  if (state.needsPassword && !unlocked) {
    const submit = async () => {
      const ok = await verifySurveyPassword(surveyId, attempt);
      if (ok) { setUnlocked(true); setWrong(false); }
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
            <button type="button" className="survey__navbtn survey__navbtn--primary" onClick={submit}>
              دخول
            </button>
          </div>
          {wrong && <p className="gate__err">كلمة المرور غير صحيحة. تحقق منها وحاول مجدداً.</p>}
        </div>
      </Shell>
    );
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
      <SurveyPage
        definition={state.survey}
        submitLabel="إرسال الإجابة"
        onSubmit={async (answers) => {
          await createResponse(surveyId, answers, { source: 'link' });
          setDone(true);
          window.scrollTo(0, 0);
        }}
        hideReview
      />
    </div>
  );
}

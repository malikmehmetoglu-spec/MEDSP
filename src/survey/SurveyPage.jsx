import { useState } from 'react';
import useSurvey from './runtime';
import SurveyForm from './SurveyForm';

/*
  صفحة تعبئة استبيان.

  حالياً تعرض الناتج بدل إرساله — طبقة التخزين (Supabase / الخادم الداخلي)
  تُوصَل لاحقاً عند نقطة submit فقط، فبقية النظام لا يتأثر بمكان التخزين.
*/

function ReviewPanel({ data, onBack }) {
  return (
    <div className="survey__page">
      <h3 className="survey__pagetitle">تمت التعبئة</h3>
      <p className="survey__intro">
        هذه الإجابات المجمّعة. الأسئلة التي لم تظهر بسبب الشروط مستبعدة تلقائياً.
      </p>
      <pre className="survey__json">{JSON.stringify(data, null, 2)}</pre>
      <div className="survey__nav">
        <button type="button" className="survey__navbtn" onClick={onBack}>
          رجوع للتعديل
        </button>
      </div>
    </div>
  );
}

export default function SurveyPage({ definition }) {
  const survey = useSurvey(definition);
  const [submitted, setSubmitted] = useState(null);

  const isLast = survey.page === survey.pages.length - 1;

  const submit = () => {
    const errors = survey.validateAll();
    if (Object.keys(errors).length > 0) {
      survey.showAllErrors();
      /* انتقل لأول صفحة فيها خطأ */
      const firstBad = survey.pages.findIndex((p) =>
        p.children.some((c) => errors[c.name]));
      if (firstBad !== -1 && firstBad !== survey.page) survey.goTo(firstBad);
      return;
    }
    setSubmitted(survey.collect());
  };

  if (submitted) {
    return (
      <section className="shell report">
        <header className="report__head">
          <h1>{definition.title}</h1>
        </header>
        <ReviewPanel data={submitted} onBack={() => setSubmitted(null)} />
      </section>
    );
  }

  return (
    <section className="shell report">
      <header className="report__head">
        <h1>{definition.title}</h1>
        {definition.description && <p className="report__lede">{definition.description}</p>}
      </header>

      <SurveyForm survey={survey} definition={definition} />

      <div className="survey__nav">
        <button
          type="button"
          className="survey__navbtn"
          onClick={survey.back}
          disabled={survey.page === 0}
        >
          السابق
        </button>

        {isLast ? (
          <button type="button" className="survey__navbtn survey__navbtn--primary" onClick={submit}>
            إنهاء ومراجعة
          </button>
        ) : (
          <button
            type="button"
            className="survey__navbtn survey__navbtn--primary"
            onClick={survey.next}
          >
            التالي
          </button>
        )}
      </div>

      {survey.expressionErrors.length > 0 && (
        <div className="survey__alert">
          <strong>تحذير للمشرف:</strong> تعابير معطوبة في تعريف الاستبيان:
          <ul>
            {survey.expressionErrors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}

import { useCallback, useMemo, useReducer } from 'react';
import { evaluateExpression, isTruthy } from './expression';
import { QUESTION_TYPES, MULTI_VALUE_TYPES, NON_ANSWER_TYPES, emptyValue, isBlank } from './schema';

/*
  محرّك تشغيل الاستبيان.

  مسؤولياته:
    - حفظ الإجابات
    - حساب أي الأسئلة ظاهرة الآن (relevant)
    - التحقق من القيود (constraint) والحقول المطلوبة
    - إدارة المجموعات المتكررة
    - التنقل بين الأقسام

  قرار تصميمي مهم — الإجابات المخفية:
  عندما يجيب المستخدم على سؤال ثم يغيّر إجابة سابقة فيختفي ذلك السؤال،
  نحتفظ بالإجابة في الحالة لكن نستبعدها من الناتج النهائي ومن التحقق.
  السبب: لو تراجع المستخدم وأعاد الشرط، تعود إجابته بدل أن يكتبها من جديد.
  لكن تصديرها للتقرير سيكون خاطئاً — لأنها إجابة على سؤال لا ينطبق عليه.
  لذلك: نحفظها للتجربة، ونحذفها عند التسليم.
*/

/* ---------------- بناء سياق التقييم ---------------- */

/*
  التعابير تشير إلى الحقول بالاسم فقط (${age})، فنحتاج خريطة مسطحة.
  داخل مجموعة متكررة، السؤال يرى إخوته في نفس التكرار أولاً ثم الجذر،
  تماماً كما في XLSForm.
*/
function buildContext(answers, scope) {
  if (!scope) return answers;
  return { ...answers, ...scope };
}

/* ---------------- المشي على الشجرة ---------------- */

/*
  يُرجع قائمة مسطحة بالعُقد الظاهرة حالياً، مع حساب relevant لكل عقدة.
  المجموعة غير الظاهرة تُخفي كل ما بداخلها.
*/
export function resolveVisible(nodes, answers, scope = null, onError) {
  const out = [];

  for (const node of nodes || []) {
    const ctx = buildContext(answers, scope);
    const relevant = node.relevant
      ? isTruthy(evaluateExpression(node.relevant, ctx, true, onError))
      : true;

    if (!relevant) continue;

    if (node.type === 'group') {
      out.push({ node, kind: 'group-start', scope });
      out.push(...resolveVisible(node.children, answers, scope, onError));
      out.push({ node, kind: 'group-end', scope });
    } else if (node.type === 'repeat') {
      out.push({ node, kind: 'repeat', scope });
    } else {
      out.push({ node, kind: 'question', scope });
    }
  }

  return out;
}

/* ---------------- التحقق ---------------- */

function checkRequired(node, value, ctx, onError) {
  const req = node.required;
  if (!req) return null;
  const isRequired = typeof req === 'string'
    ? isTruthy(evaluateExpression(req, ctx, false, onError))
    : Boolean(req);
  if (!isRequired) return null;
  return isBlank(value) ? 'هذا السؤال مطلوب' : null;
}

function checkConstraint(node, value, ctx, onError) {
  if (!node.constraint) return null;
  if (isBlank(value)) return null; /* القيد لا يُطبَّق على الفراغ — ذلك دور required */
  const ok = isTruthy(evaluateExpression(node.constraint, ctx, true, onError));
  return ok ? null : (node.constraintMessage || 'القيمة غير مقبولة');
}

/* تحققات خاصة بالنوع */
function checkType(node, value) {
  if (isBlank(value)) return null;

  if (node.type === 'integer') {
    if (!/^-?\d+$/.test(String(value))) return 'يجب إدخال عدد صحيح';
  }
  if (node.type === 'decimal') {
    if (!Number.isFinite(Number(value))) return 'يجب إدخال رقم';
  }
  if (node.type === 'integer' || node.type === 'decimal' || node.type === 'range') {
    const n = Number(value);
    if (node.min !== undefined && n < node.min) return `أقل قيمة مسموحة ${node.min}`;
    if (node.max !== undefined && n > node.max) return `أكبر قيمة مسموحة ${node.max}`;
  }
  if (node.type === 'text' || node.type === 'textarea') {
    if (node.maxLength && String(value).length > node.maxLength) {
      return `الحد الأقصى ${node.maxLength} حرفاً`;
    }
  }
  if (node.type === 'select_multiple') {
    const n = (value || []).length;
    if (node.minSelect && n < node.minSelect) return `اختر ${node.minSelect} على الأقل`;
    if (node.maxSelect && n > node.maxSelect) return `اختر ${node.maxSelect} كحد أقصى`;
  }
  if (node.type === 'admin_area') {
    if (value?.governorate && !value?.subdistrict) return 'اختر الناحية أيضاً';
  }
  return null;
}

export function validateNode(node, value, answers, scope, onError) {
  const ctx = buildContext(answers, scope);
  return checkRequired(node, value, ctx, onError)
    || checkType(node, value)
    || checkConstraint(node, value, ctx, onError);
}

/* ---------------- المُختزِل ---------------- */

function initialAnswers(nodes, seed = {}) {
  const answers = { ...seed };
  const walk = (list) => {
    for (const node of list || []) {
      if (NON_ANSWER_TYPES.has(node.type)) {
        if (node.type === 'group') walk(node.children);
        continue;
      }
      if (node.type === 'repeat') {
        if (answers[node.name] === undefined) answers[node.name] = [];
        continue;
      }
      if (answers[node.name] === undefined) {
        answers[node.name] = node.default ?? emptyValue(node.type);
      }
    }
  };
  walk(nodes);
  return answers;
}

function reducer(state, action) {
  switch (action.type) {
    case 'set':
      return {
        ...state,
        answers: { ...state.answers, [action.name]: action.value },
        touched: { ...state.touched, [action.name]: true },
      };

    case 'touch':
      return { ...state, touched: { ...state.touched, [action.name]: true } };

    case 'repeat:add': {
      const list = state.answers[action.name] || [];
      return {
        ...state,
        answers: {
          ...state.answers,
          [action.name]: [...list, initialAnswers(action.children)],
        },
      };
    }

    case 'repeat:remove': {
      const list = state.answers[action.name] || [];
      return {
        ...state,
        answers: {
          ...state.answers,
          [action.name]: list.filter((_, i) => i !== action.index),
        },
      };
    }

    case 'repeat:set': {
      const list = [...(state.answers[action.name] || [])];
      list[action.index] = { ...list[action.index], [action.field]: action.value };
      return {
        ...state,
        answers: { ...state.answers, [action.name]: list },
        touched: { ...state.touched, [`${action.name}.${action.index}.${action.field}`]: true },
      };
    }

    case 'page':
      return { ...state, page: action.page, showErrors: false };

    case 'showErrors':
      return { ...state, showErrors: true };

    case 'reset':
      return action.state;

    default:
      return state;
  }
}

/* ---------------- الواجهة العامة ---------------- */

export default function useSurvey(definition, options = {}) {
  const pages = useMemo(() => {
    if (definition.pages?.length) return definition.pages;
    return [{ name: 'main', title: definition.title, children: definition.children || [] }];
  }, [definition]);

  const allNodes = useMemo(() => pages.flatMap((p) => p.children), [pages]);

  const [state, dispatch] = useReducer(
    reducer,
    null,
    () => ({
      answers: initialAnswers(allNodes, options.initialAnswers),
      touched: {},
      page: 0,
      showErrors: false,
    }),
  );

  const exprErrors = useMemo(() => [], []);
  const onExprError = useCallback((err, src) => {
    /* تعابير معطوبة تُجمَع للمشرف بدل أن تُعطّل الاستبيان */
    const msg = `${src} — ${err.message}`;
    if (!exprErrors.includes(msg)) exprErrors.push(msg);
  }, [exprErrors]);

  /* العقد الظاهرة في الصفحة الحالية */
  const visible = useMemo(
    () => resolveVisible(pages[state.page]?.children, state.answers, null, onExprError),
    [pages, state.page, state.answers, onExprError],
  );

  /* كل العقد الظاهرة في الاستبيان كله — للتحقق النهائي وللتقدّم */
  const visibleAll = useMemo(
    () => pages.flatMap((p) => resolveVisible(p.children, state.answers, null, onExprError)),
    [pages, state.answers, onExprError],
  );

  /* أخطاء الصفحة الحالية */
  const errors = useMemo(() => {
    const map = {};
    for (const item of visible) {
      if (item.kind === 'question') {
        const err = validateNode(item.node, state.answers[item.node.name], state.answers, null, onExprError);
        if (err) map[item.node.name] = err;
      }
      if (item.kind === 'repeat') {
        const rows = state.answers[item.node.name] || [];
        if (item.node.minCount && rows.length < item.node.minCount) {
          map[item.node.name] = `أضف ${item.node.minCount} على الأقل`;
        }
        rows.forEach((row, i) => {
          for (const child of item.node.children) {
            if (NON_ANSWER_TYPES.has(child.type)) continue;
            const err = validateNode(child, row[child.name], state.answers, row, onExprError);
            if (err) map[`${item.node.name}.${i}.${child.name}`] = err;
          }
        });
      }
    }
    return map;
  }, [visible, state.answers, onExprError]);

  const pageValid = Object.keys(errors).length === 0;

  /* نسبة الإنجاز — تُحسب على الأسئلة الظاهرة فقط، فتتغير مع الشروط */
  const progress = useMemo(() => {
    const questions = visibleAll.filter((i) => i.kind === 'question');
    if (questions.length === 0) return 0;
    const done = questions.filter((i) => !isBlank(state.answers[i.node.name])).length;
    return Math.round((done / questions.length) * 100);
  }, [visibleAll, state.answers]);

  /*
    الناتج النهائي: الإجابات الظاهرة فقط.
    إجابات الأسئلة التي اختفت بسبب الشروط تُستبعَد — لأنها إجابات
    على أسئلة لا تنطبق على هذا المستجيب.
  */
  const collect = useCallback(() => {
    const visibleNames = new Set(
      visibleAll.filter((i) => i.kind === 'question' || i.kind === 'repeat')
        .map((i) => i.node.name),
    );
    const out = {};
    for (const [key, value] of Object.entries(state.answers)) {
      if (!visibleNames.has(key)) continue;
      if (isBlank(value)) continue;
      out[key] = value;
    }
    return out;
  }, [state.answers, visibleAll]);

  /* التحقق من الاستبيان كله قبل الإرسال */
  const validateAll = useCallback(() => {
    const map = {};
    for (const item of visibleAll) {
      if (item.kind === 'question') {
        const err = validateNode(item.node, state.answers[item.node.name], state.answers, null, onExprError);
        if (err) map[item.node.name] = err;
      }
    }
    return map;
  }, [visibleAll, state.answers, onExprError]);

  return {
    /* الحالة */
    answers: state.answers,
    page: state.page,
    pages,
    visible,
    errors,
    showErrors: state.showErrors,
    touched: state.touched,
    progress,
    pageValid,
    expressionErrors: exprErrors,

    /* الأفعال */
    setAnswer: (name, value) => dispatch({ type: 'set', name, value }),
    touch: (name) => dispatch({ type: 'touch', name }),
    addRow: (name, children) => dispatch({ type: 'repeat:add', name, children }),
    removeRow: (name, index) => dispatch({ type: 'repeat:remove', name, index }),
    setRowAnswer: (name, index, field, value) =>
      dispatch({ type: 'repeat:set', name, index, field, value }),
    goTo: (page) => dispatch({ type: 'page', page }),
    next: () => {
      if (!pageValid) { dispatch({ type: 'showErrors' }); return false; }
      if (state.page < pages.length - 1) dispatch({ type: 'page', page: state.page + 1 });
      return true;
    },
    back: () => {
      if (state.page > 0) dispatch({ type: 'page', page: state.page - 1 });
    },
    showAllErrors: () => dispatch({ type: 'showErrors' }),

    /* الناتج */
    collect,
    validateAll,
  };
}

export { QUESTION_TYPES, MULTI_VALUE_TYPES, emptyValue, isBlank };

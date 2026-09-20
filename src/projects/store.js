/*
  طبقة الوصول للبيانات.

  كل قراءة وكتابة في النظام تمر من هنا. التخزين الحالي محلي في
  المتصفح (localStorage) لمرحلة التجربة.

  عند الانتقال إلى Supabase أو الخادم الداخلي: تُستبدل الدوال في هذا
  الملف وحده بنداءات شبكة، وبقية النظام لا يتغير. لذلك كل الدوال
  غير متزامنة (async) من الآن، رغم أن التخزين المحلي متزامن —
  حتى لا تحتاج الواجهة لأي تعديل لاحقاً.

  تنبيه: التخزين المحلي يعني أن البيانات على جهاز واحد فقط،
  ولا تُشارك بين المستخدمين، وتُفقد بمسح بيانات المتصفح.
  هذا مقبول للتجربة فقط.
*/

const KEY = 'medsp-projects-v1';

/* ---------- أدوات ---------- */

export const uid = (prefix = 'id') =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const now = () => new Date().toISOString();

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { projects: [], surveys: [], responses: [] };
    const data = JSON.parse(raw);
    return {
      projects: data.projects || [],
      surveys: data.surveys || [],
      responses: data.responses || [],
    };
  } catch {
    return { projects: [], surveys: [], responses: [] };
  }
}

function write(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    /* الحصة ممتلئة — غالباً بسبب الصور المخزّنة كـ dataURL */
    console.error('تعذّر الحفظ المحلي:', err);
    return false;
  }
}

/* محاكاة تأخّر الشبكة بسيطة حتى تظهر حالات التحميل في الواجهة */
const settle = (value) => Promise.resolve(value);

/* ---------- المشاريع ---------- */

export const PROJECT_STATUS = {
  draft: 'مسودة',
  collecting: 'قيد جمع البيانات',
  published: 'منشور',
  closed: 'مغلق',
};

export async function listProjects() {
  return settle(read().projects.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}

export async function getProject(id) {
  return settle(read().projects.find((p) => p.id === id) || null);
}

export async function createProject(input) {
  const data = read();
  const project = {
    id: uid('prj'),
    name: input.name?.trim() || 'مشروع بلا اسم',
    description: input.description?.trim() || '',
    owner: input.owner?.trim() || '',
    status: 'draft',
    published: false,
    createdAt: now(),
    updatedAt: now(),
  };
  data.projects.push(project);
  write(data);
  return settle(project);
}

export async function updateProject(id, patch) {
  const data = read();
  const i = data.projects.findIndex((p) => p.id === id);
  if (i === -1) throw new Error('المشروع غير موجود');
  data.projects[i] = { ...data.projects[i], ...patch, updatedAt: now() };
  write(data);
  return settle(data.projects[i]);
}

export async function deleteProject(id) {
  const data = read();
  const surveyIds = data.surveys.filter((s) => s.projectId === id).map((s) => s.id);
  data.projects = data.projects.filter((p) => p.id !== id);
  data.surveys = data.surveys.filter((s) => s.projectId !== id);
  data.responses = data.responses.filter((r) => !surveyIds.includes(r.surveyId));
  write(data);
  return settle(true);
}

/* النشر يتطلب وجود بيانات معتمدة — لا يُنشر مشروع فارغ */
export async function publishProject(id, publish) {
  if (publish) {
    const data = read();
    const surveyIds = data.surveys.filter((s) => s.projectId === id).map((s) => s.id);
    const approved = data.responses.filter(
      (r) => surveyIds.includes(r.surveyId) && r.status === 'approved',
    );
    if (approved.length === 0) {
      throw new Error('لا يمكن نشر مشروع بلا أي إجابة معتمدة');
    }
  }
  return updateProject(id, { published: Boolean(publish), status: publish ? 'published' : 'collecting' });
}

/* ---------- الاستبيانات ---------- */

export async function listSurveys(projectId) {
  const all = read().surveys;
  return settle(projectId ? all.filter((s) => s.projectId === projectId) : all);
}

export async function getSurvey(id) {
  return settle(read().surveys.find((s) => s.id === id) || null);
}

export async function createSurvey(projectId, input = {}) {
  const data = read();
  const survey = {
    id: uid('svy'),
    projectId,
    title: input.title?.trim() || 'استبيان جديد',
    description: input.description?.trim() || '',
    open: false,
    pages: input.pages || [
      { name: 'main', title: 'القسم الأول', children: [] },
    ],
    createdAt: now(),
    updatedAt: now(),
  };
  data.surveys.push(survey);
  write(data);
  return settle(survey);
}

export async function updateSurvey(id, patch) {
  const data = read();
  const i = data.surveys.findIndex((s) => s.id === id);
  if (i === -1) throw new Error('الاستبيان غير موجود');
  data.surveys[i] = { ...data.surveys[i], ...patch, updatedAt: now() };
  write(data);
  return settle(data.surveys[i]);
}

export async function deleteSurvey(id) {
  const data = read();
  data.surveys = data.surveys.filter((s) => s.id !== id);
  data.responses = data.responses.filter((r) => r.surveyId !== id);
  write(data);
  return settle(true);
}

/* ---------- الإجابات ---------- */

export const RESPONSE_STATUS = {
  pending: 'بانتظار المراجعة',
  approved: 'معتمد',
  rejected: 'مرفوض',
};

export async function listResponses({ surveyId, projectId, status } = {}) {
  const data = read();
  let rows = data.responses;

  if (surveyId) rows = rows.filter((r) => r.surveyId === surveyId);
  if (projectId) {
    const ids = data.surveys.filter((s) => s.projectId === projectId).map((s) => s.id);
    rows = rows.filter((r) => ids.includes(r.surveyId));
  }
  if (status) rows = rows.filter((r) => r.status === status);

  return settle(rows.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)));
}

export async function createResponse(surveyId, answers, meta = {}) {
  const data = read();
  const response = {
    id: uid('rsp'),
    surveyId,
    answers,
    status: 'pending',
    submittedAt: now(),
    source: meta.source || 'public',
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: '',
    edited: false,
    history: [{ at: now(), action: 'submitted', by: meta.by || 'مجهول' }],
  };
  data.responses.push(response);
  const ok = write(data);
  if (!ok) throw new Error('تعذّر الحفظ — مساحة التخزين المحلي ممتلئة');
  return settle(response);
}

/*
  تغيير حالة إجابة. كل تغيير يُسجَّل في history — مطلب أساسي
  لمؤسسة رسمية: من اعتمد ماذا ومتى.
*/
export async function reviewResponse(id, status, { by = 'المشرف', note = '' } = {}) {
  const data = read();
  const i = data.responses.findIndex((r) => r.id === id);
  if (i === -1) throw new Error('الإجابة غير موجودة');
  data.responses[i] = {
    ...data.responses[i],
    status,
    reviewedBy: by,
    reviewedAt: now(),
    reviewNote: note,
    history: [...data.responses[i].history, { at: now(), action: status, by, note }],
  };
  write(data);
  return settle(data.responses[i]);
}

/* تعديل قيمة في إجابة — يُعلَّم أنها عُدّلت ويُسجَّل التغيير */
export async function editResponseAnswer(id, field, value, by = 'المشرف') {
  const data = read();
  const i = data.responses.findIndex((r) => r.id === id);
  if (i === -1) throw new Error('الإجابة غير موجودة');
  const before = data.responses[i].answers[field];
  data.responses[i] = {
    ...data.responses[i],
    answers: { ...data.responses[i].answers, [field]: value },
    edited: true,
    history: [
      ...data.responses[i].history,
      { at: now(), action: 'edited', by, field, before, after: value },
    ],
  };
  write(data);
  return settle(data.responses[i]);
}

export async function deleteResponse(id) {
  const data = read();
  data.responses = data.responses.filter((r) => r.id !== id);
  write(data);
  return settle(true);
}

export async function bulkReview(ids, status, by = 'المشرف') {
  const data = read();
  for (const id of ids) {
    const i = data.responses.findIndex((r) => r.id === id);
    if (i === -1) continue;
    data.responses[i] = {
      ...data.responses[i],
      status,
      reviewedBy: by,
      reviewedAt: now(),
      history: [...data.responses[i].history, { at: now(), action: status, by }],
    };
  }
  write(data);
  return settle(true);
}

/* ---------- العرض العام ---------- */

/* المشاريع المنشورة فقط، مع إجاباتها المعتمدة فقط */
export async function listPublishedProjects() {
  const data = read();
  const projects = data.projects.filter((p) => p.published);
  return settle(projects.map((p) => {
    const surveys = data.surveys.filter((s) => s.projectId === p.id);
    const ids = surveys.map((s) => s.id);
    const responses = data.responses.filter(
      (r) => ids.includes(r.surveyId) && r.status === 'approved',
    );
    return { ...p, surveys, responses };
  }));
}

/* ---------- أدوات إدارية ---------- */

export async function exportAll() {
  return settle(read());
}

export async function importAll(payload) {
  write({
    projects: payload.projects || [],
    surveys: payload.surveys || [],
    responses: payload.responses || [],
  });
  return settle(true);
}

export async function clearAll() {
  write({ projects: [], surveys: [], responses: [] });
  return settle(true);
}

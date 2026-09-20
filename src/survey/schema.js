/*
  مخطط تعريف الاستبيان — مستوحى من معمارية XLSForm/KoBo.

  الاستبيان شجرة من العُقد. كل عقدة إما سؤال أو مجموعة.
  المبدأ الأساسي: تعريف السؤال مرة واحدة يحدد ثلاثة أشياء معاً —
  حقل الإدخال، وطريقة التخزين، وشكل العرض في التقرير.

  الحقول المشتركة لكل عقدة:
    name        معرّف فريد (إنجليزي، بلا مسافات) — مفتاح التخزين
    type        نوع السؤال (انظر QUESTION_TYPES)
    label       نص السؤال بالعربية
    hint        تلميح اختياري تحت السؤال
    required    مطلوب (منطقي، أو تعبير شرطي نصّي)
    relevant    تعبير: يظهر السؤال فقط إذا تحقق (الأسئلة الشرطية)
    constraint  تعبير: الإجابة مقبولة فقط إذا تحقق
    constraintMessage  رسالة الخطأ عند فشل constraint
    default     قيمة ابتدائية
    readOnly    للعرض فقط
    appearance  تلميح عرض (مثلاً 'columns' لاختيار متعدد بأعمدة)
    reportAs    كيف يظهر في التقرير (انظر تعريف التقرير)
*/

export const QUESTION_TYPES = {
  /* ---------- نصوص ---------- */
  text: { label: 'نص قصير', valueType: 'string' },
  note: { label: 'ملاحظة (عرض فقط)', valueType: 'none' },
  textarea: { label: 'نص طويل', valueType: 'string' },

  /* ---------- أرقام ---------- */
  integer: { label: 'عدد صحيح', valueType: 'number' },
  decimal: { label: 'رقم عشري', valueType: 'number' },
  range: { label: 'مقياس متدرّج', valueType: 'number' },

  /* ---------- اختيارات ---------- */
  select_one: { label: 'اختيار واحد', valueType: 'string', hasChoices: true },
  select_multiple: { label: 'اختيار متعدد', valueType: 'array', hasChoices: true },
  rank: { label: 'ترتيب أفضليات', valueType: 'array', hasChoices: true },

  /* ---------- زمن ---------- */
  date: { label: 'تاريخ', valueType: 'string' },
  time: { label: 'وقت', valueType: 'string' },
  datetime: { label: 'تاريخ ووقت', valueType: 'string' },

  /* ---------- جغرافيا ---------- */
  admin_area: { label: 'محافظة وناحية', valueType: 'object' },
  geopoint: { label: 'نقطة إحداثية', valueType: 'object' },

  /* ---------- مرفقات ---------- */
  image: { label: 'صورة', valueType: 'file' },
  file: { label: 'ملف', valueType: 'file' },
  signature: { label: 'توقيع', valueType: 'file' },

  /* ---------- بنيوية ---------- */
  group: { label: 'مجموعة أسئلة', valueType: 'none', isContainer: true },
  repeat: { label: 'مجموعة متكررة', valueType: 'array', isContainer: true },
};

/* أنواع تُخزَّن كمصفوفة */
export const MULTI_VALUE_TYPES = new Set(['select_multiple', 'rank', 'repeat']);

/* أنواع لا تحمل إجابة */
export const NON_ANSWER_TYPES = new Set(['note', 'group']);

/* القيمة الابتدائية الفارغة حسب النوع */
export function emptyValue(type) {
  if (MULTI_VALUE_TYPES.has(type)) return [];
  if (type === 'admin_area') return { governorate: '', subdistrict: '' };
  if (type === 'geopoint') return null;
  return '';
}

/* هل الإجابة تُعتبر فارغة؟ */
export function isBlank(value) {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'string') return value.trim() === '';
  if (typeof value === 'object') {
    return Object.values(value).every((v) => v === '' || v === null || v === undefined);
  }
  return false;
}

/*
  تسطيح شجرة الاستبيان إلى قائمة أسئلة (بلا المجموعات المتكررة،
  لأن محتواها يتكرر ديناميكياً حسب عدد التكرارات).
*/
export function flattenQuestions(nodes, prefix = []) {
  const out = [];
  for (const node of nodes || []) {
    const path = [...prefix, node.name];
    if (node.type === 'group') {
      out.push(...flattenQuestions(node.children, prefix));
    } else if (node.type === 'repeat') {
      out.push({ ...node, path });
    } else {
      out.push({ ...node, path });
    }
  }
  return out;
}

/* التحقق من سلامة تعريف الاستبيان قبل عرضه */
export function validateDefinition(def) {
  const errors = [];
  const seen = new Set();

  const walk = (nodes, trail) => {
    for (const node of nodes || []) {
      const where = [...trail, node.name || '(بلا اسم)'].join(' ← ');

      if (!node.name) errors.push(`عقدة بلا حقل name في: ${where}`);
      else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(node.name)) {
        errors.push(`اسم غير صالح "${node.name}" — يجب أن يبدأ بحرف إنجليزي ويحوي حروفاً وأرقاماً وشرطة سفلية فقط`);
      } else if (seen.has(node.name)) {
        errors.push(`اسم مكرر "${node.name}" — الأسماء يجب أن تكون فريدة`);
      } else seen.add(node.name);

      if (!QUESTION_TYPES[node.type]) {
        errors.push(`نوع غير معروف "${node.type}" في: ${where}`);
      }

      if (QUESTION_TYPES[node.type]?.hasChoices) {
        const list = node.choices;
        if (!Array.isArray(list) || list.length === 0) {
          errors.push(`السؤال "${node.name}" من نوع اختيار لكن بلا قائمة choices`);
        } else {
          const vals = new Set();
          for (const c of list) {
            if (c.value === undefined || c.value === '') {
              errors.push(`خيار بلا value في السؤال "${node.name}"`);
            } else if (vals.has(c.value)) {
              errors.push(`قيمة خيار مكررة "${c.value}" في السؤال "${node.name}"`);
            } else vals.add(c.value);
          }
        }
      }

      if (QUESTION_TYPES[node.type]?.isContainer) {
        if (!Array.isArray(node.children) || node.children.length === 0) {
          errors.push(`المجموعة "${node.name}" فارغة`);
        }
        walk(node.children, [...trail, node.name]);
      }
    }
  };

  walk(def.pages ? def.pages.flatMap((p) => p.children) : def.children, []);
  return errors;
}

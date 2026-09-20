/*
  استبيان تجريبي — تقييم أضرار المنشآت بعد حادث.

  الغرض منه إظهار إمكانيات المحرك عملياً:
  الأسئلة الشرطية، القيود، المجموعات المتكررة، الموقع الجغرافي،
  الصور، والأنواع المختلفة.

  يُستبدل لاحقاً بتعريفات تأتي من قاعدة البيانات.
*/

export const damageSurvey = {
  id: 'damage-assessment',
  title: 'تقييم أضرار المنشآت',
  description: 'استمارة ميدانية لتوثيق الأضرار وتقدير الاحتياجات.',
  mode: 'by-section',

  pages: [
    {
      name: 'identification',
      title: 'التعريف',
      intro: 'بيانات الزيارة والموقع.',
      children: [
        {
          name: 'visit_date',
          type: 'date',
          label: 'تاريخ الزيارة',
          required: true,
          max: new Date().toISOString().slice(0, 10),
          constraint: '${visit_date} <= today()',
          constraintMessage: 'لا يمكن أن يكون التاريخ في المستقبل',
        },
        {
          name: 'assessor',
          type: 'text',
          label: 'اسم الباحث',
          required: true,
          placeholder: 'الاسم الثلاثي',
        },
        {
          name: 'area',
          type: 'admin_area',
          label: 'موقع المنشأة',
          hint: 'اختر المحافظة ثم الناحية — تظهر النتائج على الخريطة تلقائياً.',
          required: true,
        },
        {
          name: 'coords',
          type: 'geopoint',
          label: 'الإحداثيات',
          hint: 'اختياري — يزيد دقة التوطين على الخريطة.',
          minAccuracy: 50,
        },
      ],
    },

    {
      name: 'facility',
      title: 'المنشأة',
      children: [
        {
          name: 'facility_type',
          type: 'select_one',
          label: 'نوع المنشأة',
          required: true,
          appearance: 'columns',
          choices: [
            { value: 'residential', label: 'سكنية' },
            { value: 'school', label: 'مدرسة' },
            { value: 'health', label: 'مركز صحي' },
            { value: 'water', label: 'منشأة مياه' },
            { value: 'power', label: 'منشأة كهرباء' },
            { value: 'other', label: 'أخرى' },
          ],
        },
        {
          name: 'facility_other',
          type: 'text',
          label: 'حدد نوع المنشأة',
          required: "${facility_type} = 'other'",
          relevant: "${facility_type} = 'other'",
        },
        {
          name: 'floors',
          type: 'integer',
          label: 'عدد الطوابق',
          unit: 'طابق',
          min: 1,
          max: 60,
          relevant: "one_of(${facility_type}, 'residential', 'school', 'health')",
        },
        {
          name: 'occupied',
          type: 'select_one',
          label: 'هل المنشأة مأهولة حالياً؟',
          required: true,
          choices: [
            { value: 'yes', label: 'نعم' },
            { value: 'no', label: 'لا' },
            { value: 'partial', label: 'جزئياً' },
          ],
        },
        {
          name: 'occupants',
          type: 'integer',
          label: 'عدد الأشخاص الموجودين',
          unit: 'شخص',
          min: 0,
          required: "one_of(${occupied}, 'yes', 'partial')",
          relevant: "one_of(${occupied}, 'yes', 'partial')",
        },
      ],
    },

    {
      name: 'damage',
      title: 'الأضرار',
      children: [
        {
          name: 'damage_level',
          type: 'range',
          label: 'درجة الضرر الإجمالية',
          hint: '1 = ضرر طفيف، 5 = دمار كامل',
          required: true,
          min: 1,
          max: 5,
          minLabel: 'طفيف',
          maxLabel: 'كامل',
        },
        {
          name: 'damage_parts',
          type: 'select_multiple',
          label: 'الأجزاء المتضررة',
          hint: 'يمكن اختيار أكثر من إجابة.',
          relevant: '${damage_level} >= 2',
          required: '${damage_level} >= 2',
          appearance: 'columns',
          choices: [
            { value: 'structure', label: 'الهيكل الإنشائي' },
            { value: 'roof', label: 'السقف' },
            { value: 'walls', label: 'الجدران' },
            { value: 'water_net', label: 'شبكة المياه' },
            { value: 'power_net', label: 'شبكة الكهرباء' },
            { value: 'sewage', label: 'الصرف الصحي' },
          ],
        },
        {
          name: 'structural_note',
          type: 'note',
          label: 'تنبيه: الضرر الإنشائي يستوجب إخلاءً فورياً وتقييماً هندسياً مختصاً.',
          relevant: "selected(${damage_parts}, 'structure')",
        },
        {
          name: 'evacuation_done',
          type: 'select_one',
          label: 'هل تم الإخلاء؟',
          required: "selected(${damage_parts}, 'structure')",
          relevant: "selected(${damage_parts}, 'structure')",
          choices: [
            { value: 'yes', label: 'نعم' },
            { value: 'no', label: 'لا' },
          ],
        },
        {
          name: 'damage_photo',
          type: 'image',
          label: 'صورة للضرر',
          hint: 'تُضغط الصورة تلقائياً قبل الحفظ.',
          capture: true,
          relevant: '${damage_level} >= 3',
        },
        {
          name: 'damage_desc',
          type: 'textarea',
          label: 'وصف الضرر',
          maxLength: 600,
          relevant: '${damage_level} >= 2',
        },
      ],
    },

    {
      name: 'households',
      title: 'الأسر المتضررة',
      children: [
        {
          name: 'has_households',
          type: 'select_one',
          label: 'هل توجد أسر متضررة تحتاج تسجيلاً؟',
          required: true,
          choices: [
            { value: 'yes', label: 'نعم' },
            { value: 'no', label: 'لا' },
          ],
        },
        {
          name: 'households',
          type: 'repeat',
          label: 'الأسر المتضررة',
          itemLabel: 'أسرة',
          hint: 'أضف سجلاً لكل أسرة.',
          relevant: "${has_households} = 'yes'",
          minCount: 1,
          maxCount: 30,
          children: [
            {
              name: 'head_name',
              type: 'text',
              label: 'اسم رب الأسرة',
              required: true,
            },
            {
              name: 'members',
              type: 'integer',
              label: 'عدد الأفراد',
              unit: 'فرد',
              required: true,
              min: 1,
              max: 40,
            },
            {
              name: 'children_count',
              type: 'integer',
              label: 'منهم أطفال دون 18',
              unit: 'طفل',
              min: 0,
              constraint: '${children_count} <= ${members}',
              constraintMessage: 'عدد الأطفال لا يمكن أن يتجاوز عدد الأفراد',
            },
            {
              name: 'needs',
              type: 'select_multiple',
              label: 'الاحتياجات العاجلة',
              choices: [
                { value: 'shelter', label: 'مأوى' },
                { value: 'food', label: 'غذاء' },
                { value: 'water', label: 'مياه' },
                { value: 'medical', label: 'رعاية طبية' },
                { value: 'heating', label: 'تدفئة' },
              ],
            },
          ],
        },
      ],
    },

    {
      name: 'priority',
      title: 'الأولوية',
      children: [
        {
          name: 'priority_rank',
          type: 'rank',
          label: 'رتّب التدخلات حسب الأولوية',
          hint: 'اضغط بالترتيب الذي تراه — الأهم أولاً.',
          choices: [
            { value: 'structural', label: 'تدعيم إنشائي' },
            { value: 'shelter', label: 'إيواء بديل' },
            { value: 'utilities', label: 'إعادة الخدمات' },
            { value: 'debris', label: 'إزالة الأنقاض' },
          ],
        },
        {
          name: 'followup',
          type: 'select_one',
          label: 'هل يلزم زيارة متابعة؟',
          required: true,
          choices: [
            { value: 'yes', label: 'نعم' },
            { value: 'no', label: 'لا' },
          ],
        },
        {
          name: 'followup_date',
          type: 'date',
          label: 'تاريخ المتابعة المقترح',
          required: "${followup} = 'yes'",
          relevant: "${followup} = 'yes'",
          constraint: '${followup_date} > ${visit_date}',
          constraintMessage: 'يجب أن يكون بعد تاريخ الزيارة',
        },
        {
          name: 'notes',
          type: 'textarea',
          label: 'ملاحظات إضافية',
          maxLength: 800,
        },
      ],
    },
  ],
};

export default damageSurvey;

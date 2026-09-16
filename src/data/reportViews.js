/*
  تعريف ما يعرضه كل تقرير: الرقم الرئيسي، بطاقات المؤشرات،
  صف الأثر (إن وُجد)، وترتيب لوحات الأبعاد.

  الأبعاد والمقاييس تأتي محسوبة من محرك التقارير، وهنا نختار
  ما يستحق الظهور لكل تصنيف وبأي ترتيب.
*/

const fmt = (n) => Number(n).toLocaleString('en-US');

const pct = (part, total) => (total ? Math.round((part / total) * 100) : 0);

/* بطاقة زمن الوصول — مشتركة بين كل التقارير */
const etaStat = (d) => ({
  icon: 'clock',
  tone: 'teal',
  label: 'وسيط زمن الوصول',
  value: d.metrics.eta.median,
  unit: 'دقيقة',
  note: 'نصف البلاغات وصلت خلال هذه المدة أو أقل',
  share: 100,
});

const crewStat = (d) => ({
  icon: 'staff',
  tone: 'forest',
  label: 'الكادر المشارك',
  value: d.metrics.crew.sum,
  unit: 'مشاركة',
  note: 'مجموع مشاركات الكوادر',
  share: 100,
});

const durationStat = (d) => ({
  icon: 'target',
  tone: 'gold',
  label: 'وسيط مدة العملية',
  value: d.metrics.duration.median,
  unit: 'دقيقة',
  note: `محسوب من ${fmt(d.metrics.duration.count)} عملية`,
  share: pct(d.metrics.duration.count, d.total),
});

const dimValue = (d, key, label) =>
  d.dims[key]?.data.find((x) => x.label === label)?.value ?? 0;

export const REPORT_VIEWS = {
  fire: {
    icon: 'flame',
    eyebrow: 'إجمالي الحرائق المسجّلة',
    unit: 'حريق',
    stats: (d) => {
      const known = d.dims.cause.coverage - d.dims.cause.excluded;
      return [
        {
          icon: 'area',
          tone: 'gold',
          label: 'المساحة المحترقة',
          value: d.metrics.area.sum,
          unit: 'دونم',
          note: `مسجّلة في ${fmt(d.metrics.area.count)} حريقاً`,
          share: pct(d.metrics.area.count, d.total),
        },
        etaStat(d),
        {
          icon: 'target',
          tone: 'forest',
          label: 'الحرائق محدَّدة السبب',
          value: known,
          unit: 'حريق',
          note: `${pct(known, d.total)}% من الإجمالي`,
          share: pct(known, d.total),
        },
      ];
    },
    toll: {
      title: 'الأثر البشري',
      note: 'مسجّل في كل بلاغات الإطفاء دون استثناء',
      rows: (d) => [
        { label: 'إصابات المدنيين', value: d.metrics.civInjured.sum, icon: 'civilianHurt' },
        { label: 'وفيات المدنيين', value: d.metrics.civDead.sum, icon: 'civilian' },
        { label: 'إصابات كوادر الوزارة', value: d.metrics.staffInjured.sum, icon: 'staffHurt', staff: true },
        { label: 'وفيات كوادر الوزارة', value: d.metrics.staffDead.sum, icon: 'staff', staff: true },
      ],
    },
    panels: [
      { dim: 'cause', tone: 'gold', span: 'wide' },
      { dim: 'inhabited', tone: 'teal' },
      { dim: 'placeType', tone: 'teal', max: 8, span: 'wide' },
    ],
  },

  ambulance: {
    icon: 'civilianHurt',
    eyebrow: 'إجمالي بلاغات الإسعاف',
    unit: 'بلاغ',
    stats: (d) => [
      etaStat(d),
      {
        icon: 'target',
        tone: 'gold',
        label: 'وسيط زمن النقل للمشفى',
        value: d.metrics.toHospital.median,
        unit: 'دقيقة',
        note: `مسجّل في ${fmt(d.metrics.toHospital.count)} حالة`,
        share: pct(d.metrics.toHospital.count, d.total),
      },
      crewStat(d),
    ],
    toll: {
      title: 'مآل الحالات',
      note: 'إلى أين نُقلت الحالات بعد الإسعاف',
      rows: (d) => [
        { label: 'نُقلت إلى مشفى', value: dimValue(d, 'destination', 'مشفى'), icon: 'civilianHurt' },
        { label: 'أُسعفت في المنزل', value: dimValue(d, 'destination', 'منزل'), icon: 'civilian' },
        { label: 'حالات إحالة', value: dimValue(d, 'referral', 'احالة'), icon: 'target', staff: true },
        { label: 'نقل إلى مقبرة', value: dimValue(d, 'destination', 'مقبرة'), icon: 'civilian', staff: true },
      ],
    },
    panels: [
      { dim: 'reason', tone: 'gold', max: 10, span: 'wide' },
      { dim: 'destination', tone: 'teal', max: 7 },
      { dim: 'condition', tone: 'teal', max: 10, span: 'wide' },
      { dim: 'referral', tone: 'gold' },
    ],
  },

  services: {
    icon: 'area',
    eyebrow: 'إجمالي الأعمال الخدمية',
    stats: (d) => [etaStat(d), durationStat(d), crewStat(d)],
    panels: [
      { dim: 'kind', tone: 'gold', max: 12, span: 'wide' },
      { dim: 'sector', tone: 'teal' },
      { dim: 'unit', tone: 'teal', max: 10, span: 'wide' },
      { dim: 'status', tone: 'gold' },
    ],
  },

  traffic: {
    icon: 'target',
    eyebrow: 'إجمالي حوادث السير',
    unit: 'حادث',
    stats: (d) => [
      etaStat(d),
      {
        icon: 'civilianHurt',
        tone: 'gold',
        label: 'نُقلت إلى مشفى',
        value: dimValue(d, 'destination', 'مشفى'),
        unit: 'حادث',
        note: `${pct(dimValue(d, 'destination', 'مشفى'), d.total)}% من الحوادث`,
        share: pct(dimValue(d, 'destination', 'مشفى'), d.total),
      },
      {
        icon: 'flame',
        tone: 'forest',
        label: 'الحوادث ذات إصابات',
        value: d.metrics.injured.count,
        unit: 'حادث',
        note: `${pct(d.metrics.injured.count, d.total)}% من الحوادث`,
        share: pct(d.metrics.injured.count, d.total),
      },
    ],
    toll: {
      title: 'الأثر البشري',
      note: 'مجموع المصابين والوفيات في حوادث السير',
      rows: (d) => [
        { label: 'المصابون', value: d.metrics.injured.sum, icon: 'civilianHurt' },
        { label: 'الوفيات', value: d.metrics.dead.sum, icon: 'civilian' },
      ],
    },
    panels: [
      { dim: 'crashType', tone: 'gold', span: 'wide' },
      { dim: 'vehicle', tone: 'teal', max: 10 },
      { dim: 'cause', tone: 'gold', max: 12, span: 'wide' },
      { dim: 'road', tone: 'teal' },
      { dim: 'light', tone: 'teal' },
      { dim: 'signs', tone: 'gold' },
      { dim: 'destination', tone: 'teal' },
    ],
  },

  drowning: {
    icon: 'civilian',
    eyebrow: 'إجمالي حالات الغرق',
    unit: 'حالة',
    stats: (d) => [
      etaStat(d),
      {
        icon: 'civilianHurt',
        tone: 'gold',
        label: 'انتُشلوا أحياء',
        value: d.dims.state.coverage - dimValue(d, 'state', 'ميت'),
        unit: 'شخص',
        note: `${pct(d.dims.state.coverage - dimValue(d, 'state', 'ميت'), d.dims.state.coverage)}% من الحالات`,
        share: pct(d.dims.state.coverage - dimValue(d, 'state', 'ميت'), d.dims.state.coverage),
      },
      crewStat(d),
    ],
    toll: {
      title: 'الحصيلة',
      note: 'نتائج عمليات البحث والانتشال وفق حالة الغريق',
      rows: (d) => [
        { label: 'وفيات', value: dimValue(d, 'state', 'ميت'), icon: 'civilian', staff: true },
        {
          label: 'انتُشلوا أحياء',
          value: d.dims.state.coverage - dimValue(d, 'state', 'ميت'),
          icon: 'civilianHurt',
        },
      ],
    },
    panels: [
      { dim: 'cause', tone: 'gold', span: 'wide' },
      { dim: 'state', tone: 'teal' },
      { dim: 'mission', tone: 'teal' },
      { dim: 'warnings', tone: 'gold' },
      { dim: 'firstAid', tone: 'teal' },
    ],
  },

  'cold-rescue': {
    icon: 'staff',
    eyebrow: 'إجمالي عمليات الإنقاذ البارد',
    stats: (d) => [etaStat(d), durationStat(d), crewStat(d)],
    panels: [
      { dim: 'kind', tone: 'gold', span: 'wide' },
      { dim: 'inhabited', tone: 'teal' },
    ],
  },

  'animal-rescue': {
    icon: 'staff',
    eyebrow: 'إجمالي عمليات إنقاذ الحيوان',
    stats: (d) => [etaStat(d), durationStat(d), crewStat(d)],
    panels: [{ dim: 'inhabited', tone: 'teal', span: 'wide' }],
  },

  'hazard-marking': {
    icon: 'target',
    eyebrow: 'إجمالي عمليات وسم الأماكن الخطرة',
    stats: (d) => [etaStat(d), durationStat(d), crewStat(d)],
    panels: [{ dim: 'inhabited', tone: 'teal', span: 'wide' }],
  },

  attacks: {
    icon: 'flame',
    eyebrow: 'إجمالي الهجمات المسجّلة',
    stats: (d) => [
      etaStat(d),
      {
        icon: 'target',
        tone: 'gold',
        label: 'عدد الغارات',
        value: d.metrics.raids.sum,
        unit: 'غارة',
        note: `في ${fmt(d.total)} هجوماً`,
        share: 100,
      },
      {
        icon: 'flame',
        tone: 'forest',
        label: 'الذخائر المستخدمة',
        value: d.metrics.munitions.sum,
        unit: 'ذخيرة',
        note: 'وفق ما وثّقته الفرق',
        share: 100,
      },
    ],
    toll: {
      title: 'الأثر البشري',
      note: 'حصيلة الهجمات المسجّلة',
      rows: (d) => [
        { label: 'المصابون', value: d.metrics.injured.sum, icon: 'civilianHurt' },
        { label: 'الشهداء', value: d.metrics.dead.sum, icon: 'civilian', staff: true },
        { label: 'المتضررون', value: d.metrics.affected.sum, icon: 'civilian' },
      ],
    },
    panels: [
      { dim: 'kind', tone: 'gold', span: 'wide' },
      { dim: 'actor', tone: 'teal' },
      { dim: 'inhabited', tone: 'teal', span: 'wide' },
    ],
  },

  evacuation: {
    icon: 'civilian',
    eyebrow: 'إجمالي عمليات الإخلاء',
    stats: (d) => [
      etaStat(d),
      {
        icon: 'civilianHurt',
        tone: 'gold',
        label: 'الذين تم إخلاؤهم',
        value: d.metrics.evacuated.sum,
        unit: 'شخص',
        note: 'مجموع من جرى إخلاؤهم',
        share: 100,
      },
      crewStat(d),
    ],
    panels: [
      { dim: 'kind', tone: 'gold', span: 'wide' },
      { dim: 'inhabited', tone: 'teal' },
    ],
  },
};

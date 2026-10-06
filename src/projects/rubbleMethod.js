/*
  المنهجية المعتمدة لتقدير كميات الأنقاض — مصدر واحد للمعاملات في كل المنصة،
  حتى تحسب كل الجهات بالمعادلة نفسها وبالقيم نفسها.

  المرجع: «الدليل المختصر عن الآلية المعتمدة لتقدير كميات ترحيل الأنقاض — 2026»
  (data/rubble-pipeline/methodology-engineering.xlsx)
*/

/* القيم المرجعية المقفلة في الدليل */
export const REF = {
  floorHeight: 3, // ارتفاع الطابق المعياري (م)
  cu: 0.225, // معامل الركام الإنشائي Cu الافتراضي (م³/م²)
  bf: 1.4, // عامل الانتفاخ Bf الافتراضي
  p: 1.35, // الكثافة P الافتراضية (طن/م³)
};

/* المجالات المسموحة في الدليل */
export const CU_RANGE = [0.2, 0.21, 0.22, 0.23, 0.24, 0.25];
export const BF_RANGE = [1.3, 1.35, 1.4, 1.45, 1.5];

const num = (v) => (v === '' || v == null ? null : Number(v));

/*
  الطريقة الهندسية:
    حجم الأنقاض V = n × A × N × Cu × Bf
    n عدد المباني المدمرة، A مساحة المسقط الطابقي (م²)، N عدد الطوابق،
    Cu معامل الركام الإنشائي (م³/م²)، Bf عامل الانتفاخ.
  وحجم المبنى الإنشائي = A × N × ارتفاع الطابق (للمرجعية فقط).
*/
export function engineering({ n, area, floors, height, cu, bf }) {
  const A = num(area);
  const N = num(floors);
  const B = num(n);
  const C = num(cu) ?? REF.cu;
  const F = num(bf) ?? REF.bf;
  const H = num(height) ?? REF.floorHeight;
  if (!(A > 0) || !(N > 0) || !(B > 0)) return null;
  const perBuilding = A * N * C * F;
  const volume = B * perBuilding;
  return {
    volume, perBuilding,
    structural: A * N * H,
    weight: volume * REF.p,
    used: { n: B, A, N, Cu: C, Bf: F, H },
  };
}

/*
  المنهجية الأولى (حصر الأضرار) — الدليل المعتمد 2026، البند 6.1:
    الحجم الإنشائي = A × عدد الطوابق × ارتفاع الطابق (3 م)
    كمية الأنقاض = الحجم الإنشائي × معامل التحويل حسب درجة الضرر
  ثم الكمية النهائية = الكمية النظرية × معامل تصحيح المحافظة (من الكميات المرحّلة فعلاً).
*/
export const DAMAGE = [
  { key: 'destroyed', label: 'مدمر كلياً', share: 0.35, weight: 4, color: '#b3261e' },
  { key: 'severe', label: 'ضرر شديد', share: 0.2, weight: 3, color: '#e0742b' },
  { key: 'moderate', label: 'ضرر متوسط', share: 0.08, weight: 2, color: '#d4a443' },
  { key: 'light', label: 'ضرر خفيف', share: 0.02, weight: 1, color: '#7fae5a' },
];
export const DEFAULT_BUILDING = { area: 120, floors: 3 };

/* المنهجية الأولى لمجموعة مبانٍ: counts = {destroyed, severe, moderate, light} */
export function damageMethod({ area, floors, height, ...counts }) {
  const A = num(area); const N = num(floors); const H = num(height) ?? REF.floorHeight;
  if (!(A > 0) || !(N > 0)) return null;
  const structural = A * N * H;
  const by = Object.fromEntries(DAMAGE.map((d) => [d.key, (num(counts[d.key]) || 0) * structural * d.share]));
  const volume = Object.values(by).reduce((a, b) => a + b, 0);
  if (!(volume > 0)) return null;
  return { by, volume, structural, weight: volume * REF.p };
}

/* أنقاض سطر أضرار واحد بالمنهجية الأولى */
export function damageRubble(row) {
  const r = damageMethod({ ...row, area: row.avgArea || DEFAULT_BUILDING.area, floors: row.avgFloors || DEFAULT_BUILDING.floors });
  return { by: r?.by || Object.fromEntries(DAMAGE.map((d) => [d.key, 0])), volume: r?.volume || 0, assumed: !row.avgArea || !row.avgFloors };
}

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
  ربط الضرر بالأنقاض: نسبة ما يتحول إلى أنقاض من حجم المبنى حسب فئة الضرر.
  المدمر كلياً = 100%، والفئات الأخف نسبة تقديرية قابلة للتعديل حين تعتمد الوزارة قيمها.
*/
export const DAMAGE = [
  { key: 'destroyed', label: 'مدمر كلياً', share: 1, weight: 4, color: '#b3261e' },
  { key: 'severe', label: 'أضرار جسيمة', share: 0.5, weight: 3, color: '#e0742b' },
  { key: 'moderate', label: 'أضرار متوسطة', share: 0.2, weight: 2, color: '#d4a443' },
  { key: 'light', label: 'أضرار طفيفة', share: 0.05, weight: 1, color: '#7fae5a' },
];
export const DEFAULT_BUILDING = { area: 120, floors: 3 };

/* أنقاض سطر أضرار واحد: Σ عدد الفئة × A × N × Cu × Bf × نسبة الفئة */
export function damageRubble(row) {
  const A = row.avgArea || DEFAULT_BUILDING.area;
  const N = row.avgFloors || DEFAULT_BUILDING.floors;
  const per = A * N * REF.cu * REF.bf;
  const by = Object.fromEntries(DAMAGE.map((d) => [d.key, (row[d.key] || 0) * per * d.share]));
  return { by, volume: Object.values(by).reduce((a, b) => a + b, 0), assumed: !row.avgArea || !row.avgFloors };
}

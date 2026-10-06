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

/*
  أيقونات خطية مرسومة يدوياً — لا مكتبة خارجية.
  كلها بمقاس واحد وسماكة خط واحدة لتبدو من عائلة واحدة.
*/

const PATHS = {
  /* لهب — الحرائق */
  flame: (
    <>
      <path d="M12 3c0 3-3 4-3 7a3 3 0 0 0 6 0c0-1.2-.6-2-1.2-2.8" />
      <path d="M12 21a6 6 0 0 1-6-6c0-2.4 1.2-4 2.4-5.4" />
      <path d="M12 21a6 6 0 0 0 6-6c0-1.6-.6-3-1.5-4.2" />
    </>
  ),
  /* ساعة — الزمن */
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  /* هدف — التحديد */
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" stroke="none" />
    </>
  ),
  /* مساحة — الأرض المحترقة */
  area: (
    <>
      <path d="M3.5 8.5 12 4l8.5 4.5v7L12 20l-8.5-4.5z" />
      <path d="M12 4v16" />
    </>
  ),
  /* مدني مصاب */
  civilianHurt: (
    <>
      <circle cx="12" cy="6.5" r="2.8" />
      <path d="M5.5 20.5v-2a6.5 6.5 0 0 1 9-6" />
      <path d="M18 14.5v5M15.5 17h5" />
    </>
  ),
  /* مدني — وفاة */
  civilian: (
    <>
      <circle cx="12" cy="6.5" r="2.8" />
      <path d="M5.5 20.5v-2a6.5 6.5 0 0 1 13 0v2" />
    </>
  ),
  /* خوذة إطفاء — كادر مصاب */
  staffHurt: (
    <>
      <path d="M5 16.5a7 7 0 0 1 14 0" />
      <path d="M2.5 16.5h19" />
      <path d="M9.5 16.5c0-4.2 1-7 2.5-7s2.5 2.8 2.5 7" />
      <path d="M18 19v4M16 21h4" />
    </>
  ),
  /* خوذة إطفاء */
  staff: (
    <>
      <path d="M5 16.5a7 7 0 0 1 14 0" />
      <path d="M2.5 16.5h19" />
      <path d="M9.5 16.5c0-4.2 1-7 2.5-7s2.5 2.8 2.5 7" />
    </>
  ),
  /* شمس — تبديل للوضع الداكن */
  sun: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.8v2.6M12 18.6v2.6M4.6 12H2M22 12h-2.6M6.2 6.2l1.8 1.8M16 16l1.8 1.8M17.8 6.2 16 8M8 16l-1.8 1.8" />
    </>
  ),
  /* هلال — تبديل للوضع الفاتح */
  moon: (
    <path d="M20 14.2A8.5 8.5 0 1 1 9.8 4a7 7 0 0 0 10.2 10.2Z" />
  ),
  /* كاميرا */
  camera: (
    <>
      <path d="M3 8.6h3.2l1.6-2.4h8.4l1.6 2.4H21v10.2H3z" />
      <circle cx="12" cy="13.4" r="3.4" />
    </>
  ),
  /* دبوس موقع */
  pin: (
    <>
      <path d="M12 21.5s6.5-6.2 6.5-11a6.5 6.5 0 1 0-13 0c0 4.8 6.5 11 6.5 11Z" />
      <circle cx="12" cy="10.4" r="2.5" />
    </>
  ),
};

export default function Icon({ name, className }) {
  const shape = PATHS[name];
  if (!shape) return null;

  return (
    <svg
      viewBox="0 0 24 24"
      className={className ? `icon ${className}` : 'icon'}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {shape}
    </svg>
  );
}

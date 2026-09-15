import { useEffect, useRef, useState } from 'react';

const reduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* يكشف دخول العنصر إلى الشاشة مرة واحدة فقط */
export function useInView(margin = '-60px') {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (reduced()) {
      setSeen(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: margin }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [margin]);

  return [ref, seen];
}

/* عدّ تصاعدي حتى القيمة النهائية — يُتخطّى إن طلب المستخدم تقليل الحركة */
export function useCountUp(target, active, duration = 900) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) return undefined;
    if (reduced() || target === 0) {
      setValue(target);
      return undefined;
    }

    let frame;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      /* تباطؤ تدريجي عند النهاية */
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, active, duration]);

  return value;
}

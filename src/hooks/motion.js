import { useEffect, useRef, useState } from 'react';

const reduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/*
  يكشف دخول العنصر إلى الشاشة مرة واحدة فقط.

  يتحقق أولاً بشكل مباشر من موضع العنصر، لأن IntersectionObserver
  لا يُطلق دائماً على الأجهزة المحمولة حين يكون العنصر ظاهراً منذ البداية
  أو حين يتغير ارتفاع الصفحة بعد تحميل البيانات — وكان ذلك يترك
  بعض الأرقام عالقة على صفر.
*/
export function useInView(margin = '0px 0px -8% 0px') {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return undefined;

    if (reduced() || typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return undefined;
    }

    /* فحص مباشر: هل العنصر ظاهر الآن؟ */
    const isVisible = () => {
      const rect = el.getBoundingClientRect();
      const height = window.innerHeight || document.documentElement.clientHeight;
      return rect.top < height && rect.bottom > 0;
    };

    if (isVisible()) {
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

    /* شبكة أمان: لو لم يُطلق المراقب رغم ظهور العنصر */
    const guard = window.setInterval(() => {
      if (isVisible()) {
        setSeen(true);
        io.disconnect();
        window.clearInterval(guard);
      }
    }, 500);

    return () => {
      io.disconnect();
      window.clearInterval(guard);
    };
  }, [margin, seen]);

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
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        /* ضمان الوصول للقيمة النهائية بالضبط */
        setValue(target);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, active, duration]);

  return value;
}

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'medsp-theme';

function readInitialTheme() {
  if (typeof window === 'undefined') return 'dark';
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* التخزين المحلي غير متاح — نتجاهل ونكمل بالافتراضي */
  }
  return 'dark';
}

/*
  الوضع الداكن هو هوية المنصة الأساسية، لذا هو الافتراضي دائماً
  عند أول زيارة. الاختيار اليدوي يُحفظ محلياً ويُطبَّق تلقائياً
  بعدها عبر السمة data-theme على <html> (المضبوطة مسبقاً في index.html
  لمنع "ومضة" الثيم الخاطئ قبل تحميل React).
*/
export default function useTheme() {
  const [theme, setTheme] = useState(readInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* تجاهل بيئات بلا تخزين محلي */
    }
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  return { theme, toggle };
}

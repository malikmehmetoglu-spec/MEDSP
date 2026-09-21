import { createClient } from '@supabase/supabase-js';

/*
  الاتصال بقاعدة البيانات.

  المفتاح هنا "مفتاح علني" (publishable) مصمّم ليُضمَّن في كود الواجهة —
  لا يمنح بمفرده أي صلاحية. الحماية الفعلية في قاعدة البيانات نفسها:
  كل الجداول مغلقة بسياسات RLS، والزائر لا يصل إلا عبر دوال محددة
  (جلب استبيان مفتوح، إرسال إجابة، قراءة المنشور).

  لا يوضع هنا أبداً مفتاح service_role — ذاك يتجاوز كل الحماية.

  عند الانتقال إلى الخادم الداخلي: تُغيّر القيمتان عبر متغيرات البيئة.
*/

const URL = import.meta.env.VITE_SUPABASE_URL
  || 'https://wyyvsntytjtcrmllptfs.supabase.co';
const KEY = import.meta.env.VITE_SUPABASE_KEY
  || 'sb_publishable_HRhdNiHxp46Zj7014bVbzg_sTqfLyKX';

export const supabase = createClient(URL, KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export default supabase;

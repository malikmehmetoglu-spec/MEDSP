import { useCountUp, useInView } from '../hooks/motion';

const fmt = (n) => Number(n).toLocaleString('en-US');

/*
  رقم يعدّ تصاعدياً عند ظهوره على الشاشة.
  الاتجاه LTR حتى لا تنعكس الفاصلة، والمحاذاة لليمين دائماً
  لأن الصفحة عربية والرقم يجب أن يبدأ من حافة السطر اليمنى.
*/
export default function Figure({ value, className }) {
  const [ref, seen] = useInView();
  const shown = useCountUp(value, seen);

  return (
    <span ref={ref} className={className ? `num ${className}` : 'num'} dir="ltr">
      {fmt(shown)}
    </span>
  );
}

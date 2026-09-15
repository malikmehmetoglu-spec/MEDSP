import { useCountUp, useInView } from '../hooks/motion';

const fmt = (n) => Number(n).toLocaleString('en-US');

/* رقم يعدّ تصاعدياً عند ظهوره على الشاشة */
export default function Figure({ value, className }) {
  const [ref, seen] = useInView();
  const shown = useCountUp(value, seen);

  return (
    <span ref={ref} className={className} dir="ltr">
      {fmt(shown)}
    </span>
  );
}

/*
  مدة التعبئة، وكشف الاستمارات السريعة بشكل مريب.

  القاعدة: أقل من 3 ثوانٍ لكل سؤال مُجاب، أو أقل من 20 ثانية إجمالاً،
  أسرع من أن تكون قراءة فعلية. ليست حكماً — تنبيه للمشرف ليتحقق.
  الاستمارات القديمة بلا توقيت لا تُعلَّم.
*/

export const SECONDS_PER_ANSWER = 3;
export const MIN_SECONDS = 20;

function answeredCount(answers) {
  return Object.values(answers || {}).filter((v) => !(v === '' || v === null || v === undefined
    || (Array.isArray(v) && v.length === 0))).length;
}

export function durationInfo(response) {
  const sec = response?.meta?.durationSec;
  if (typeof sec !== 'number') return { sec: null, label: '', suspicious: false };
  const answered = answeredCount(response.answers);
  const floor = Math.max(MIN_SECONDS, answered * SECONDS_PER_ANSWER);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  const label = m ? `${m} د ${String(s).padStart(2, '0')} ث` : `${s} ث`;
  return { sec, label, suspicious: sec < floor, floor };
}

import { useMemo } from 'react';

/*
  يعيد حساب كل مؤشرات تقرير الإطفاء من السجلات الخام
  وفق الفترة الزمنية المختارة. الحساب يجري في المتصفح،
  فتغيير الفترة يحدّث التقرير فوراً دون أي طلب للخادم.

  فهارس أعمدة السجل:
  0 اليوم | 1 المحافظة | 2 السبب | 3 نوع المكان | 4 مأهول
  5 المساحة | 6 إصابات مدنيين | 7 وفيات مدنيين
  8 إصابات كوادر | 9 وفيات كوادر | 10 زمن الوصول | 11 الموقع
*/

const D = { DAY: 0, GOV: 1, CAUSE: 2, PLACE: 3, INHAB: 4, AREA: 5, CINJ: 6, CDEAD: 7, SINJ: 8, SDEAD: 9, ETA: 10, SITE: 11 };

function rank(counts, labels) {
  return counts
    .map((value, i) => ({ label: labels[i], value }))
    .filter((d) => d.value > 0 && d.label)
    .sort((a, b) => b.value - a.value);
}

export default function useFireStats(fire, range) {
  return useMemo(() => {
    const { dict, records } = fire;
    const { from, to } = range;

    const rows = records.filter((r) => {
      const day = r[D.DAY];
      if (!day) return false;
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    });

    const govCounts = new Array(dict.govs.length).fill(0);
    const causeCounts = new Array(dict.causes.length).fill(0);
    const placeCounts = new Array(dict.placeTypes.length).fill(0);
    const inhabCounts = new Array(dict.inhabited.length).fill(0);
    const siteCounts = new Array(dict.sites.length).fill(0);
    const byDay = new Map();

    let burnedArea = 0;
    let burnedAreaRecords = 0;
    let civilianInjuries = 0;
    let civilianDeaths = 0;
    let staffInjuries = 0;
    let staffDeaths = 0;
    let etaSum = 0;
    let etaCount = 0;
    let unknownCause = 0;
    let placeTypeCoverage = 0;

    const UNKNOWN = dict.causes.indexOf('مجهول');

    for (const r of rows) {
      if (r[D.GOV] >= 0) govCounts[r[D.GOV]] += 1;
      if (r[D.CAUSE] >= 0) {
        causeCounts[r[D.CAUSE]] += 1;
        if (r[D.CAUSE] === UNKNOWN) unknownCause += 1;
      }
      if (r[D.PLACE] >= 0) {
        placeCounts[r[D.PLACE]] += 1;
        placeTypeCoverage += 1;
      }
      if (r[D.INHAB] >= 0) inhabCounts[r[D.INHAB]] += 1;
      if (r[D.SITE] >= 0) siteCounts[r[D.SITE]] += 1;

      if (r[D.AREA] > 0) {
        burnedArea += r[D.AREA];
        burnedAreaRecords += 1;
      }

      civilianInjuries += r[D.CINJ];
      civilianDeaths += r[D.CDEAD];
      staffInjuries += r[D.SINJ];
      staffDeaths += r[D.SDEAD];

      if (r[D.ETA] > 0) {
        etaSum += r[D.ETA];
        etaCount += 1;
      }

      byDay.set(r[D.DAY], (byDay.get(r[D.DAY]) ?? 0) + 1);
    }

    const locations = siteCounts
      .map((count, i) => (count > 0 ? { ...dict.sites[i], count } : null))
      .filter(Boolean)
      .sort((a, b) => b.count - a.count);

    const causes = rank(causeCounts, dict.causes).filter((c) => c.label !== 'مجهول');

    const timeline = [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([day, value]) => ({ day, value }));

    return {
      total: rows.length,
      burnedArea,
      burnedAreaRecords,
      civilianInjuries,
      civilianDeaths,
      staffInjuries,
      staffDeaths,
      avgArrival: etaCount ? Math.round(etaSum / etaCount) : 0,
      causes,
      causesUnknown: unknownCause,
      placeTypesCoverage: placeTypeCoverage,
      byGovernorate: rank(govCounts, dict.govs),
      placeTypes: rank(placeCounts, dict.placeTypes),
      inhabited: rank(inhabCounts, dict.inhabited),
      locations,
      timeline,
    };
  }, [fire, range]);
}

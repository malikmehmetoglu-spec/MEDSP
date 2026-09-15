import { useMemo } from 'react';

/*
  يعيد حساب كل مؤشرات تقرير الإطفاء من السجلات الخام
  وفق الفترة الزمنية المختارة. الحساب يجري في المتصفح،
  فتغيير الفترة يحدّث التقرير فوراً دون أي طلب للخادم.

  فهارس أعمدة السجل:
  0 اليوم | 1 المحافظة | 2 المديرية | 3 المركز | 4 السبب
  5 نوع المكان | 6 مأهول | 7 المساحة | 8 إصابات مدنيين | 9 وفيات مدنيين
  10 إصابات كوادر | 11 وفيات كوادر | 12 زمن الوصول | 13 الموقع
*/

const D = {
  DAY: 0, GOV: 1, DIR: 2, CENTER: 3, CAUSE: 4, PLACE: 5, INHAB: 6,
  AREA: 7, CINJ: 8, CDEAD: 9, SINJ: 10, SDEAD: 11, ETA: 12, SITE: 13,
};

function rank(counts, labels) {
  return counts
    .map((value, i) => ({ label: labels[i], value }))
    .filter((d) => d.value > 0 && d.label)
    .sort((a, b) => b.value - a.value);
}

export default function useFireStats(fire, range, filters = {}) {
  const { directorate = null, center = null } = filters;

  return useMemo(() => {
    const { dict, records } = fire;
    const { from, to } = range;

    /* الفلاتر تعمل معاً: الفترة + المديرية + المركز */
    const dirIdx = directorate ? dict.directorates.indexOf(directorate) : -1;
    const centerIdx = center ? dict.centers.indexOf(center) : -1;

    const rows = records.filter((r) => {
      const day = r[D.DAY];
      if (!day) return false;
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (directorate && r[D.DIR] !== dirIdx) return false;
      if (center && r[D.CENTER] !== centerIdx) return false;
      return true;
    });

    /* المراكز المتاحة تتقلص تبعاً للمديرية المختارة */
    const centerSet = new Set();
    for (const r of records) {
      if (directorate && r[D.DIR] !== dirIdx) continue;
      if (r[D.CENTER] >= 0) centerSet.add(dict.centers[r[D.CENTER]]);
    }
    const availableCenters = [...centerSet].sort((a, b) => a.localeCompare(b, 'ar'));

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
      directorates: dict.directorates,
      availableCenters,
    };
  }, [fire, range, directorate, center]);
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/*
  خريطة سوريا — مبنية بالكامل من طبقات الوزارة، بلا أي خدمة خرائط خارجية.

  الطبقات: خلفية الدولة، المسطحات المائية، حدود المحافظات وأسماؤها،
  ثم النواحي وحدودها وأسماؤها تظهر تدريجياً عند التكبير.
  فوقها نقاط بحجم يتناسب مع عدد السجلات في كل موقع.
*/

const PAD = 16;
const MAX_ZOOM = 12;
const MIN_ZOOM = 1;

/* عتبات ظهور النواحي وأسمائها */
const SUB_FADE_IN = 1.7;
const SUB_FULL = 2.6;
const SUB_LABELS = 3.4;

function useBounds(basemap) {
  return useMemo(() => {
    let minLon = 180;
    let maxLon = -180;
    let minLat = 90;
    let maxLat = -90;

    const scan = (geometry) => {
      const polygons =
        geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
      for (const polygon of polygons) {
        for (const [lon, lat] of polygon[0]) {
          if (lon < minLon) minLon = lon;
          if (lon > maxLon) maxLon = lon;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
      }
    };

    basemap.country.forEach((f) => scan(f.g));
    return { minLon, maxLon, minLat, maxLat };
  }, [basemap]);
}

/* noun: ما تمثّله النقاط، بصيغة الجمع المعرّفة (البلاغات، الاستمارات…) */
export default function SyriaMap({ basemap, locations, noun = 'البلاغات', faded = null, onPickGovernorate = null }) {
  const wrapRef = useRef(null);
  const [size, setSize] = useState({ width: 900, height: 560 });
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const [hovered, setHovered] = useState(null);
  const drag = useRef(null);

  const bounds = useBounds(basemap);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const { width } = entry.contentRect;
      setSize({ width, height: Math.max(380, Math.round(width * 0.62)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* إسقاط مستطيل مع تصحيح لتقارب خطوط الطول */
  const project = useMemo(() => {
    const spanLon = bounds.maxLon - bounds.minLon;
    const spanLat = bounds.maxLat - bounds.minLat;
    const aspect = Math.cos((((bounds.minLat + bounds.maxLat) / 2) * Math.PI) / 180);

    const usableW = size.width - PAD * 2;
    const usableH = size.height - PAD * 2;
    const scale = Math.min(usableW / (spanLon * aspect), usableH / spanLat);

    const offsetX = PAD + (usableW - spanLon * aspect * scale) / 2;
    const offsetY = PAD + (usableH - spanLat * scale) / 2;

    return (lon, lat) => [
      offsetX + (lon - bounds.minLon) * aspect * scale,
      offsetY + (bounds.maxLat - lat) * scale,
    ];
  }, [bounds, size]);

  const toPath = useCallback(
    (geometry) => {
      const polygons =
        geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
      let d = '';
      for (const polygon of polygons) {
        polygon[0].forEach(([lon, lat], i) => {
          const [x, y] = project(lon, lat);
          d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
        });
        d += 'Z';
      }
      return d;
    },
    [project]
  );

  /* مركز كل مضلع لوضع الاسم عليه */
  const centroid = useCallback(
    (geometry) => {
      const polygons =
        geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
      let best = polygons[0][0];
      let bestLen = 0;
      for (const polygon of polygons) {
        if (polygon[0].length > bestLen) {
          bestLen = polygon[0].length;
          best = polygon[0];
        }
      }
      let sx = 0;
      let sy = 0;
      for (const [lon, lat] of best) {
        sx += lon;
        sy += lat;
      }
      return project(sx / best.length, sy / best.length);
    },
    [project]
  );

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /*
    تقييد التحريك حتى لا تُسحب الخريطة خارج الإطار فتبدو مختفية.
    يُسمح بهامش يعادل عُشر المساحة الظاهرة في كل اتجاه.
  */
  const clampView = useCallback(
    (next) => {
      const zoom = clamp(Number(next.zoom) || 1, MIN_ZOOM, MAX_ZOOM);
      const marginX = size.width * 0.1;
      const marginY = size.height * 0.1;
      const minX = size.width - size.width * zoom - marginX;
      const minY = size.height - size.height * zoom - marginY;

      const x = Number.isFinite(next.x) ? clamp(next.x, minX, marginX) : 0;
      const y = Number.isFinite(next.y) ? clamp(next.y, minY, marginY) : 0;

      return { zoom, x, y };
    },
    [size]
  );

  const zoomAt = useCallback(
    (factor, cx, cy) => {
      setView((prev) => {
        const zoom = clamp(prev.zoom * factor, MIN_ZOOM, MAX_ZOOM);
        const ratio = zoom / prev.zoom;
        return clampView({
          zoom,
          x: cx - (cx - prev.x) * ratio,
          y: cy - (cy - prev.y) * ratio,
        });
      });
    },
    [clampView]
  );

  /*
    مستمع أصلي بـ passive:false — مستمع React للعجلة سلبي
    فلا يستطيع منع تمرير الصفحة أثناء التكبير.
  */
  const svgRef = useRef(null);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;

    const onWheel = (event) => {
      event.preventDefault();
      const box = el.getBoundingClientRect();
      zoomAt(
        event.deltaY < 0 ? 1.18 : 1 / 1.18,
        event.clientX - box.left,
        event.clientY - box.top
      );
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  /*
    الخريطة تلتقط المؤشر لتمكين السحب، فلا تصل ضغطة النقطة إلى الدائرة.
    لذلك نسجّل ما تحت المؤشر عند الضغط، وعند الإفلات: إن لم تتحرك اليد
    فهي ضغطة اختيار لا سحب.
  */
  const onPointerDown = (event) => {
    drag.current = {
      sx: event.clientX, sy: event.clientY, ox: view.x, oy: view.y,
      gov: event.target?.dataset?.gov || null,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event) => {
    if (!drag.current) return;
    const { ox, oy, sx, sy } = drag.current;
    setView((prev) =>
      clampView({
        zoom: prev.zoom,
        x: ox + (event.clientX - sx),
        y: oy + (event.clientY - sy),
      })
    );
  };

  const endDrag = (event) => {
    /* ضغطة (لا سحب): الإزاحة أقل من 4 بكسل وتحتها نقطة محافظة */
    const d = drag.current;
    if (d?.gov && onPickGovernorate && event
        && Math.abs(event.clientX - d.sx) < 4 && Math.abs(event.clientY - d.sy) < 4) {
      onPickGovernorate(d.gov);
    }
    drag.current = null;
    if (event?.pointerId !== undefined) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* المؤشر أُفلت مسبقاً */
      }
    }
  };

  const reset = () => setView({ zoom: MIN_ZOOM, x: 0, y: 0 });

  const { zoom } = view;

  /* شفافية النواحي تتدرج مع التكبير */
  const subOpacity = clamp((zoom - SUB_FADE_IN) / (SUB_FULL - SUB_FADE_IN), 0, 1);
  const subLabelOpacity = clamp((zoom - SUB_LABELS) / 1.4, 0, 1);
  const govLabelOpacity = clamp(1 - (zoom - SUB_LABELS) / 2.2, 0.25, 1);

  const peak = locations.length ? locations[0].count : 1;
  const radius = (count) => (2.1 + Math.sqrt(count / peak) * 10) / Math.sqrt(zoom);

  const ordered = useMemo(
    () => [...locations].sort((a, b) => a.count - b.count),
    [locations]
  );

  return (
    <div className="map" ref={wrapRef}>
      <div className="map__stage" style={{ height: size.height }}>
        <svg
          width={size.width}
          height={size.height}
          ref={svgRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={endDrag}
          onDoubleClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            zoomAt(1.6, event.clientX - box.left, event.clientY - box.top);
          }}
          className={drag.current ? 'map__svg map__svg--grabbing' : 'map__svg'}
          role="img"
          aria-label={`خريطة توزّع ${noun}`}
        >
          <g transform={`translate(${view.x} ${view.y}) scale(${zoom})`}>
            {basemap.country.map((f, i) => (
              <path key={`c${i}`} d={toPath(f.g)} className="geo geo--country" />
            ))}

            {subOpacity > 0 &&
              basemap.subdistricts.map((f) => (
                <path
                  key={f.code}
                  d={toPath(f.g)}
                  className="geo geo--sub"
                  style={{ opacity: subOpacity }}
                />
              ))}

            {basemap.water.map((f, i) => (
              <path key={`w${i}`} d={toPath(f.g)} className="geo geo--water" />
            ))}

            {basemap.governorates.map((f) => (
              <path
                key={f.code}
                d={toPath(f.g)}
                className="geo geo--gov"
              />
            ))}

            {ordered.map((loc) => {
              const [x, y] = project(loc.lon, loc.lat);
              return (
                <circle
                  key={loc.code}
                  cx={x}
                  cy={y}
                  r={radius(loc.count)}
                  className={[
                    'map__dot',
                    hovered?.code === loc.code ? 'map__dot--on' : '',
                    /* خارج التحديد: النقطة تبهت ولا تختفي */
                    faded && !faded.has(loc.code) ? 'map__dot--faded' : '',
                    onPickGovernorate ? 'map__dot--pick' : '',
                  ].filter(Boolean).join(' ')}
                  onMouseEnter={() =>
                    setHovered({ ...loc, x: x * zoom + view.x, y: y * zoom + view.y })
                  }
                  onMouseLeave={() => setHovered(null)}
                  data-gov={loc.governorate || undefined}
                />
              );
            })}

            {basemap.governorates.map((f) => {
              const [x, y] = centroid(f.g);
              return (
                <text
                  key={`gl${f.code}`}
                  x={x}
                  y={y}
                  className="geo__label geo__label--gov"
                  style={{ fontSize: 15 / zoom, opacity: govLabelOpacity }}
                >
                  {f.name}
                </text>
              );
            })}

            {subLabelOpacity > 0 &&
              basemap.subdistricts.map((f) => {
                const [x, y] = centroid(f.g);
                return (
                  <text
                    key={`sl${f.code}`}
                    x={x}
                    y={y}
                    className="geo__label geo__label--sub"
                    style={{ fontSize: 12 / zoom, opacity: subLabelOpacity }}
                  >
                    {f.name}
                  </text>
                );
              })}
          </g>
        </svg>

        {hovered && (
          <div
            className="map__tip"
            style={{ right: size.width - hovered.x + 16, top: hovered.y - 12 }}
          >
            <strong>{hovered.name}</strong>
            <span>{hovered.governorate}</span>
            <span className="map__tip-count" dir="ltr">
              {hovered.count.toLocaleString('en-US')}
            </span>
          </div>
        )}

        <div className="map__controls">
          <button type="button" onClick={() => zoomAt(1.4, size.width / 2, size.height / 2)} aria-label="تكبير">
            +
          </button>
          <button type="button" onClick={() => zoomAt(1 / 1.4, size.width / 2, size.height / 2)} aria-label="تصغير">
            −
          </button>
          <button type="button" onClick={reset} aria-label="إعادة الضبط" className="map__reset">
            ⟲
          </button>
        </div>
      </div>

      <p className="map__legend">
        حجم الدائرة يعكس عدد {noun} في الموقع. كبّر لعرض حدود النواحي وأسمائها.
      </p>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';

/*
  خريطة نقاط مبنية محلياً — لا تعتمد على أي خدمة خرائط خارجية.
  الخلفية: المواقع المأهولة في سوريا (٨٠٠٧ موقعاً) ترسم حدود البلاد بنقاط خفيفة.
  الطبقة العليا: مواقع الحرائق، حجم الدائرة حسب عدد الحرائق في الموقع.

  عند توفّر حدود المحافظات كمضلعات من QGIS تُضاف كطبقة إضافية دون تغيير المنطق.
*/

const BOUNDS = { minLon: 35.5, maxLon: 42.5, minLat: 32.0, maxLat: 37.4 };
const PAD = 14;

function useProjection(width, height) {
  return useMemo(() => {
    const spanLon = BOUNDS.maxLon - BOUNDS.minLon;
    const spanLat = BOUNDS.maxLat - BOUNDS.minLat;
    const midLat = ((BOUNDS.minLat + BOUNDS.maxLat) / 2) * (Math.PI / 180);
    const aspect = Math.cos(midLat);

    const usableW = width - PAD * 2;
    const usableH = height - PAD * 2;
    const scale = Math.min(usableW / (spanLon * aspect), usableH / spanLat);

    const drawW = spanLon * aspect * scale;
    const drawH = spanLat * scale;
    const offsetX = PAD + (usableW - drawW) / 2;
    const offsetY = PAD + (usableH - drawH) / 2;

    return (lon, lat) => [
      offsetX + (lon - BOUNDS.minLon) * aspect * scale,
      offsetY + (BOUNDS.maxLat - lat) * scale,
    ];
  }, [width, height]);
}

export default function FireMap({ backdrop, locations }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [size, setSize] = useState({ width: 640, height: 460 });
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const { width } = entry.contentRect;
      setSize({ width, height: Math.max(360, Math.round(width * 0.58)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const project = useProjection(size.width, size.height);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.fillStyle = 'rgba(143, 202, 190, 0.34)';
    for (const [lon, lat] of backdrop) {
      const [x, y] = project(lon, lat);
      ctx.fillRect(x, y, 1.1, 1.1);
    }
  }, [backdrop, project, size]);

  const max = locations.length ? locations[0].count : 1;
  const radius = (count) => 3 + Math.sqrt(count / max) * 15;

  /* الأصغر أولاً حتى لا تحجب الدوائر الكبيرة ما تحتها */
  const ordered = [...locations].sort((a, b) => a.count - b.count);

  return (
    <div className="map" ref={wrapRef}>
      <div className="map__stage" style={{ height: size.height }}>
        <canvas ref={canvasRef} style={{ width: size.width, height: size.height }} />
        <svg width={size.width} height={size.height} role="img" aria-label="توزّع الحرائق جغرافياً">
          {ordered.map((loc) => {
            const [x, y] = project(loc.lon, loc.lat);
            return (
              <circle
                key={loc.code}
                cx={x}
                cy={y}
                r={radius(loc.count)}
                className={hovered?.code === loc.code ? 'map__dot map__dot--on' : 'map__dot'}
                onMouseEnter={() => setHovered({ ...loc, x, y })}
                onMouseLeave={() => setHovered(null)}
              />
            );
          })}
        </svg>

        {hovered && (
          <div
            className="map__tip"
            style={{ right: size.width - hovered.x + 14, top: hovered.y - 10 }}
          >
            <strong>{hovered.name}</strong>
            <span>{hovered.governorate}</span>
            <span className="map__tip-count">{hovered.count} حريق</span>
          </div>
        )}
      </div>

      <p className="map__legend">
        حجم الدائرة يعكس عدد الحرائق في الموقع. النقاط الخفيفة هي المواقع المأهولة في سوريا.
      </p>
    </div>
  );
}

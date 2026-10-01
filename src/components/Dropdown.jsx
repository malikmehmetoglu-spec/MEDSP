import { useEffect, useId, useRef, useState } from 'react';

/*
  قائمة منسدلة موحّدة للمرشّحات.

  القائمة الأصلية للمتصفح تقرر وحدها أين تُفتح (لأعلى أو لأسفل حسب
  المساحة)، ورسم سهمها يختلف بين المتصفحات. هذه القائمة تُفتح لأسفل
  دائماً، بارتفاع محدود وتمرير داخلي، وسهمها واحد في كل مكان.

  options: [{ value, label, count? }]
*/
export default function Dropdown({ value, onChange, options, placeholder = 'الكل', label }) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const root = useRef(null);
  const list = useRef(null);
  const id = useId();

  /* الخيار الأول دائماً «الكل» (قيمة فارغة) */
  const items = [{ value: '', label: placeholder }, ...options];
  const current = items.find((o) => String(o.value) === String(value ?? '')) ?? items[0];
  const isOn = Boolean(value);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!root.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  /* عند الفتح: المؤشر على الخيار المختار، ويُمرَّر إليه */
  const openList = () => {
    const i = Math.max(0, items.indexOf(current));
    setCursor(i);
    setOpen(true);
    requestAnimationFrame(() => {
      list.current?.children[i]?.scrollIntoView({ block: 'nearest' });
    });
  };
  const toggle = () => (open ? setOpen(false) : openList());

  const pick = (o) => {
    onChange(o.value === '' ? null : o.value);
    setOpen(false);
  };

  const move = (step) => {
    setCursor((c) => {
      const next = Math.min(items.length - 1, Math.max(0, c + step));
      list.current?.children[next]?.scrollIntoView({ block: 'nearest' });
      return next;
    });
  };

  const onKey = (e) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) openList(); else move(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); if (open) move(-1); return; }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (open && items[cursor]) pick(items[cursor]);
      else openList();
    }
  };

  return (
    <div className={`dd${open ? ' is-open' : ''}`} ref={root}>
      <button
        type="button"
        className={`dd__btn${isOn ? ' is-on' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        onClick={toggle}
        onKeyDown={onKey}
      >
        <span className="dd__value">{current.label}</span>
        <svg className="dd__chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <ul className="dd__list" role="listbox" id={id} ref={list}>
          {items.map((o, i) => {
            const selected = String(o.value) === String(value ?? '');
            return (
              <li
                key={`${o.value}`}
                role="option"
                aria-selected={selected}
                className={`dd__opt${selected ? ' is-sel' : ''}${i === cursor ? ' is-cur' : ''}`}
                onPointerEnter={() => setCursor(i)}
                onClick={() => pick(o)}
              >
                <span className="dd__optlabel">{o.label}</span>
                {o.count != null && <span className="dd__count">{Number(o.count).toLocaleString('en-US')}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

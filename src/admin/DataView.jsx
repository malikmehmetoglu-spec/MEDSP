import { useEffect, useMemo, useState } from 'react';
import { DetailTable } from '../projects/ProjectReport';
import * as store from '../projects/store';
import Icon from '../components/Icon';

/*
  تبويب «البيانات» في مشروع البيانات: ما في الجدول الآن، ومن أي ملف
  جاء آخر تحديث ومتى.
*/

const fmt = (n) => Number(n).toLocaleString('en-US');
const records = (n) => (n === 1 ? 'سجل واحد' : n === 2 ? 'سجلان'
  : n % 100 >= 3 && n % 100 <= 10 ? `${fmt(n)} سجلات` : `${fmt(n)} سجلاً`);
const when = (iso) => new Date(iso).toLocaleDateString('en-GB');

export default function DataView({ survey, rows, basemap, onUpload }) {
  const [imports, setImports] = useState([]);
  useEffect(() => { store.listImports(survey.id).then(setImports).catch(() => setImports([])); }, [survey.id, rows.length]);

  const nodes = useMemo(() => new Map(survey.pages.flatMap((p) => p.children).map((n) => [n.name, n])), [survey]);
  const columns = [...nodes.values()].filter((n) => !['note', 'repeat', 'image'].includes(n.type)).map((n) => n.name);
  const names = useMemo(() => (basemap ? new Map(basemap.governorates.map((g) => [g.code, g.name])) : null), [basemap]);

  if (rows.length === 0) {
    return (
      <div className="rempty">
        <Icon name="t_textarea" className="rempty__icon" />
        <h3>لا توجد بيانات بعد</h3>
        <p>ارفع ملف Excel فيه البيانات، وتُبنى الأعمدة منه تلقائياً.</p>
        <button type="button" className="bx-save" onClick={onUpload}>رفع ملف Excel</button>
      </div>
    );
  }

  const last = imports[0];
  return (
    <div className="dview">
      <div className="dview__bar">
        <div>
          <strong>{records(rows.length)}</strong>
          {last && (
            <span>
              آخر تحديث {when(last.imported_at)} من ملف «{last.file_name}»
              {last.summary && ` — ${[
                last.summary.changed ? `${last.summary.changed} تغيّر` : '',
                last.summary.added ? `${last.summary.added} جديد` : '',
                last.summary.removed ? `${last.summary.removed} حُذف` : '',
              ].filter(Boolean).join('، ') || 'بلا تغييرات'}`}
            </span>
          )}
        </div>
        <button type="button" className="bx-save" onClick={onUpload}>تحديث من ملف جديد</button>
      </div>

      <DetailTable rows={rows} columns={columns} nodes={nodes} names={names} />

      {imports.length > 1 && (
        <details className="dview__log">
          <summary>سجل التحديثات ({imports.length})</summary>
          <ul>
            {imports.map((i) => (
              <li key={i.id}>
                <b>{when(i.imported_at)}</b> «{i.file_name}» — {i.imported_by}
                {' '}({i.summary?.changed || 0} تغيّر، {i.summary?.added || 0} جديد، {i.summary?.removed || 0} حُذف)
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

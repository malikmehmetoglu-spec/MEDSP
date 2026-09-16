import ThemeToggle from './ThemeToggle';

export default function Masthead({ period, theme, onToggleTheme }) {
  return (
    <header>
      <div className="masthead">
        <div className="shell masthead__inner">
          <img
            className="masthead__emblem"
            src="brand/eagle.png"
            alt="شعار الجمهورية العربية السورية"
          />
          <div className="masthead__titles">
            <span className="masthead__title">منصة مديرية التخطيط والإحصاء</span>
            <span className="masthead__parent">وزارة الطوارئ وإدارة الكوارث</span>
          </div>
          {period && <span className="masthead__period">بيانات {period}</span>}
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
      </div>
      <div className="brand-band" aria-hidden="true" />
    </header>
  );
}

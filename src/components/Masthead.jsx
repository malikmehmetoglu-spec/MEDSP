import ThemeToggle from './ThemeToggle';
import Icon from './Icon';

export default function Masthead({ theme, onToggleTheme, showLogin }) {
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
          <div className="masthead__tools">
            {showLogin && (
              <a className="masthead__login" href="#/admin">
                <Icon name="lock" className="masthead__loginicon" />
                دخول
              </a>
            )}
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          </div>
        </div>
      </div>
      <div className="brand-band" aria-hidden="true" />
    </header>
  );
}

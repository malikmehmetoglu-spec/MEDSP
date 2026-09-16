import Icon from './Icon';

export default function ThemeToggle({ theme, onToggle }) {
  const isLight = theme === 'light';

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={onToggle}
      aria-pressed={isLight}
      aria-label={isLight ? 'التبديل إلى الوضع الداكن' : 'التبديل إلى الوضع الفاتح'}
      title={isLight ? 'الوضع الداكن' : 'الوضع الفاتح'}
    >
      <Icon name={isLight ? 'moon' : 'sun'} className="theme-toggle__icon" />
    </button>
  );
}

import { useApp } from '../store/useStore';

export function TabBar() {
  const screen = useApp((s) => s.screen);
  const goTo = useApp((s) => s.goTo);

  const tabs = [
    { key: 'home',    label: 'Hoje',    icon: '○' },
    { key: 'ritual',  label: 'Ritual',  icon: '◐', primary: true },
    { key: 'insight', label: 'Insight', icon: '✦' },
  ] as const;

  return (
    <nav className="tabbar" aria-label="Navegação principal">
      {tabs.map((t) => (
        <button
          key={t.key}
          className={`tab ${screen === t.key ? 'tab--active' : ''} ${'primary' in t && t.primary ? 'tab--primary' : ''}`}
          onClick={() => goTo(t.key as 'home' | 'ritual' | 'insight')}
          aria-current={screen === t.key ? 'page' : undefined}
          aria-label={t.label}
        >
          <span className="tab__icon" aria-hidden>{t.icon}</span>
          <span className="tab__label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

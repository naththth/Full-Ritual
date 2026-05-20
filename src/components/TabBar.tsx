import { useApp } from '../store/useStore';

type Tab = {
  key: 'home' | 'ritual' | 'body' | 'mind' | 'diet' | 'spirit' | 'insight';
  label: string;
  icon: string;
};

export function TabBar() {
  const screen = useApp((s) => s.screen);
  const focusedDimension = useApp((s) => s.focusedDimension);
  const goTo = useApp((s) => s.goTo);

  const tabs: Tab[] = [
    { key: 'home', label: 'Hoje', icon: '○' },
    { key: 'ritual', label: 'Pele', icon: '◐' },
    { key: 'body', label: 'Corpo', icon: '◑' },
    { key: 'mind', label: 'Mente', icon: '○' },
    { key: 'diet', label: 'Dieta', icon: '◍' },
    { key: 'spirit', label: 'Espírito', icon: '✧' },
    { key: 'insight', label: 'Insight', icon: '✦' },
  ];

  return (
    <nav className="tabbar" aria-label="Navegação principal">
      {tabs.map((tab) => {
        const active = screen === tab.key ||
          (tab.key === 'ritual' && screen === 'dimension' && focusedDimension === 'skin') ||
          (tab.key === 'body' && screen === 'dimension' && focusedDimension === 'body') ||
          (tab.key === 'mind' && screen === 'dimension' && focusedDimension === 'mind') ||
          (tab.key === 'diet' && screen === 'dimension' && focusedDimension === 'diet') ||
          (tab.key === 'spirit' && screen === 'dimension' && focusedDimension === 'spirit');

        return (
          <button
            key={tab.key}
            className={`tab ${active ? 'tab--active' : ''}`}
            onClick={() => goTo(tab.key)}
            aria-current={active ? 'page' : undefined}
            aria-label={tab.label}
          >
            <span className="tab__icon" aria-hidden>{tab.icon}</span>
            <span className="tab__label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

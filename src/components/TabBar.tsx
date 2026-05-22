import type { CSSProperties } from 'react';
import { useApp } from '../store/useStore';
import { Glyph } from './Glyph';

type TabKey = 'home' | 'energy' | 'ritual' | 'body' | 'mind' | 'diet' | 'spirit' | 'insight';

type Tab = {
  key: TabKey;
  label: string;
  glyph: Parameters<typeof Glyph>[0]['kind'];
  dim?: string;
};

const DIM_TO_TAB: Partial<Record<string, TabKey>> = {
  skin: 'ritual', body: 'body', mind: 'mind', diet: 'diet', spirit: 'spirit',
};

export function TabBar() {
  const screen = useApp((s) => s.screen);
  const focusedDimension = useApp((s) => s.focusedDimension);
  const goTo = useApp((s) => s.goTo);
  const activeDimensions = useApp((s) => s.activeDimensions);

  const allTabs: Tab[] = [
    { key: 'home',    label: 'Hoje',     glyph: 'mandala' },
    { key: 'energy',  label: 'Energia',  glyph: 'spark',  dim: 'var(--gold)'   },
    { key: 'ritual',  label: 'Pele',     glyph: 'skin',   dim: 'var(--skin)'   },
    { key: 'body',    label: 'Corpo',    glyph: 'body',   dim: 'var(--body)'   },
    { key: 'mind',    label: 'Mente',    glyph: 'brain',  dim: 'var(--mind)'   },
    { key: 'diet',    label: 'Dieta',    glyph: 'meal',   dim: 'var(--diet)'   },
    { key: 'spirit',  label: 'Espírito', glyph: 'lotus',  dim: 'var(--spirit)' },
    { key: 'insight', label: 'Insight',  glyph: 'orbit'  },
  ];

  const tabs = allTabs.filter((t) => {
    if (t.key === 'home' || t.key === 'energy' || t.key === 'insight') return true;
    const dimKey = Object.entries(DIM_TO_TAB).find(([, tk]) => tk === t.key)?.[0];
    return !dimKey || activeDimensions.includes(dimKey as never);
  });

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
            style={active && tab.dim ? ({ ['--tab-accent' as never]: tab.dim } as CSSProperties) : undefined}
          >
            <span className="tab__icon" aria-hidden style={tab.dim && active ? { color: tab.dim } : undefined}>
              <Glyph kind={tab.glyph} size={20} strokeWidth={1.7} filled={active} />
            </span>
            <span className="tab__label">{tab.label}</span>
            {active && <span className="tab__dot" aria-hidden />}
          </button>
        );
      })}
    </nav>
  );
}

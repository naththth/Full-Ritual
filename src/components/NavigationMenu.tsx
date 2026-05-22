import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Glyph } from './Glyph';
import { Icon3D, type Icon3DKind } from './Icon3D';
import { useApp, type Screen } from '../store/useStore';
import type { DimensionKey } from '../types';
import { supabase, hasSupabase } from '../lib/supabase';

type MenuItem = {
  label: string;
  screen: Screen;
  icon: Icon3DKind;
};

type DimensionItem = {
  label: string;
  screen: Screen;
  glyph: Parameters<typeof Glyph>[0]['kind'];
  color: string;
  dimension?: DimensionKey;
};

const profileMenuItems: MenuItem[] = [
  { label: 'Meu perfil', screen: 'profile', icon: 'health' },
  { label: 'Configurar dimensões', screen: 'onboarding', icon: 'home' },
  { label: 'Biblioteca', screen: 'library', icon: 'library' },
  { label: 'Produtos', screen: 'products', icon: 'skincare' },
];

const healthMenuItems: MenuItem[] = [
  { label: 'Peso', screen: 'body_metrics', icon: 'body' },
  { label: 'Lesões', screen: 'pain', icon: 'pain' },
  { label: 'Medicamentos', screen: 'supplements', icon: 'supplements' },
  { label: 'Exames', screen: 'labs', icon: 'labs' },
];

const dimensionItems: DimensionItem[] = [
  { label: 'Energia', screen: 'energy', glyph: 'spark', color: 'var(--gold)' },
  { label: 'Pele', screen: 'ritual', glyph: 'skin', color: 'var(--skin)', dimension: 'skin' },
  { label: 'Corpo', screen: 'body', glyph: 'body', color: 'var(--body)', dimension: 'body' },
  { label: 'Mente', screen: 'mind', glyph: 'brain', color: 'var(--mind)', dimension: 'mind' },
  { label: 'Dieta', screen: 'diet', glyph: 'meal', color: 'var(--diet)', dimension: 'diet' },
  { label: 'Espírito', screen: 'spirit', glyph: 'lotus', color: 'var(--spirit)', dimension: 'spirit' },
];

export function NavigationMenu() {
  const [profileOpen, setProfileOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement | null>(null);
  const screen = useApp((s) => s.screen);
  const focusedDimension = useApp((s) => s.focusedDimension);
  const profile = useApp((s) => s.profile);
  const goTo = useApp((s) => s.goTo);
  const activeDimensions = useApp((s) => s.activeDimensions);

  const visibleDimensionItems = dimensionItems.filter((item) => {
    if (!item.dimension) return true;
    return activeDimensions.includes(item.dimension);
  });

  const navigate = (itemScreen: Screen, dimension?: DimensionKey) => {
    goTo(itemScreen, dimension);
    setProfileOpen(false);
  };

  const handleLogout = async () => {
    setProfileOpen(false);
    if (hasSupabase) await supabase.auth.signOut();
    useApp.getState().setUser(null);
  };

  const isActive = (itemScreen: Screen, dimension?: DimensionKey) => {
    if (screen === itemScreen) return !dimension || focusedDimension === dimension;
    if (!dimension) return false;
    return screen === 'dimension' && focusedDimension === dimension;
  };

  useEffect(() => {
    if (!profileOpen) return;

    const closeOnOutside = (event: PointerEvent) => {
      if (accountRef.current?.contains(event.target as Node)) return;
      setProfileOpen(false);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [profileOpen]);

  return (
    <>
      <header className="app-topbar" aria-label="Ações principais">
        <div className="app-topbar-account" ref={accountRef}>
          <button
            className="app-topbar-avatar"
            type="button"
            onClick={() => setProfileOpen((value) => !value)}
            aria-label="Abrir menu do perfil"
            aria-expanded={profileOpen}
            style={profile?.photo_url ? { backgroundImage: `url(${profile.photo_url})` } : undefined}
          >
            {!profile?.photo_url && (profile?.name?.[0] ?? 'N')}
          </button>

          {profileOpen && (
            <div className="nav-profile-menu" role="menu" aria-label="Menu do perfil">
              <p>{profile?.name ?? 'Perfil'}</p>
              {profileMenuItems.map((item) => (
                <button key={item.screen} type="button" role="menuitem" onClick={() => navigate(item.screen)}>
                  <Icon3D kind={item.icon} size={20} />
                  <span>{item.label}</span>
                </button>
              ))}
              <div className="nav-profile-menu__divider" aria-hidden />
              <section className="nav-profile-health-group" aria-label="Hub de saúde">
                <button className="nav-profile-health-heading" type="button" role="menuitem" onClick={() => navigate('health')}>
                  <Icon3D kind="vitals" size={20} />
                  <span>Hub de saúde</span>
                </button>
                <div className="nav-profile-health-children">
                  {healthMenuItems.map((item) => (
                    <button key={item.screen} type="button" role="menuitem" onClick={() => navigate(item.screen)}>
                      <Icon3D kind={item.icon} size={18} />
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </section>
              <div className="nav-profile-menu__divider" aria-hidden />
              <button
                type="button"
                role="menuitem"
                onClick={handleLogout}
                style={{ color: 'var(--skin)', opacity: 0.85 }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                <span>Sair da conta</span>
              </button>
            </div>
          )}
        </div>

        <button
          className={`app-topbar-home ${screen === 'home' ? 'app-topbar-home--active' : ''}`}
          type="button"
          aria-label="Ir para hoje"
          aria-current={screen === 'home' ? 'page' : undefined}
          onClick={() => navigate('home')}
        >
          Hoje
        </button>

        <button
          className={`app-topbar-insight ${screen === 'insight' ? 'app-topbar-insight--active' : ''}`}
          type="button"
          aria-label="Insight"
          aria-current={screen === 'insight' ? 'page' : undefined}
          onClick={() => navigate('insight')}
        >
          <Glyph kind="orbit" size={24} strokeWidth={1.7} filled={screen === 'insight'} />
        </button>
      </header>

      <nav className="dimension-toolbar" aria-label="Dimensões">
        {visibleDimensionItems.map((item) => {
          const active = isActive(item.screen, item.dimension);
          return (
            <button
              key={item.label}
              className={`dimension-toolbar-item ${active ? 'dimension-toolbar-item--active' : ''}`}
              type="button"
              style={{ '--dimension-color': item.color } as CSSProperties}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              onClick={() => navigate(item.screen, item.dimension)}
            >
              <Glyph kind={item.glyph} size={24} strokeWidth={1.8} filled={active} />
            </button>
          );
        })}
      </nav>
    </>
  );
}

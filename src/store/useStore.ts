import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Profile, DimensionKey } from '../types';

type Screen = 'home' | 'ritual' | 'insight' | 'dimension' | 'profile' | 'products' | 'sleep' | 'evolution';

interface AppState {
  // Sessão
  userId: string | null;
  profile: Profile | null;
  setProfile: (p: Profile | null) => void;
  setUser: (id: string | null) => void;

  // Navegação
  screen: Screen;
  focusedDimension: DimensionKey | null;
  goTo: (s: Screen, dim?: DimensionKey) => void;

  // Toast
  toast: string | null;
  showToast: (msg: string) => void;
}

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      userId: null,
      profile: null,
      setProfile: (profile) => set({ profile }),
      setUser: (userId) => set({ userId }),

      screen: 'home',
      focusedDimension: null,
      goTo: (screen, focusedDimension = null) =>
        set({ screen, focusedDimension }),

      toast: null,
      showToast: (toast) => {
        set({ toast });
        setTimeout(() => set({ toast: null }), 2400);
      },
    }),
    { name: 'full-ritual-session' }
  )
);

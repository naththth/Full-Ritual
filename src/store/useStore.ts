import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Profile, DimensionKey } from '../types';
import { isoToday } from '../lib/dates';
import { safeStringStorage } from '../lib/storage';

export type Screen =
  | 'home'
  | 'energy'
  | 'ritual'
  | 'body'
  | 'mind'
  | 'diet'
  | 'spirit'
  | 'insight'
  | 'dimension'
  | 'profile'
  | 'products'
  | 'library'
  | 'evolution'
  | 'chat'
  | 'body_coach'
  | 'body_metrics'
  | 'labs'
  | 'supplements'
  | 'vitals'
  | 'pain'
  | 'health';

interface NavigationEntry {
  screen: Screen;
  focusedDimension?: DimensionKey;
}

interface AppState {
  // Sessão
  userId: string | null;
  profile: Profile | null;
  setProfile: (p: Profile | null) => void;
  setUser: (id: string | null) => void;

  // Navegação
  screen: Screen;
  focusedDimension: DimensionKey | undefined;
  navigationStack: NavigationEntry[];
  selectedDate: string;
  goTo: (s: Screen, dim?: DimensionKey) => void;
  goBack: () => void;
  setSelectedDate: (date: string) => void;

  // Toast
  toast: string | null;
  showToast: (msg: string) => void;
}

function resolveScreen(screen: Screen, focusedDimension?: DimensionKey): NavigationEntry {
  if (screen !== 'dimension') return { screen, focusedDimension };

  if (focusedDimension === 'skin') return { screen: 'ritual', focusedDimension };
  if (focusedDimension === 'body') return { screen: 'body', focusedDimension };
  if (focusedDimension === 'mind') return { screen: 'mind', focusedDimension };
  if (focusedDimension === 'diet') return { screen: 'diet', focusedDimension };
  if (focusedDimension === 'spirit') return { screen: 'spirit', focusedDimension };

  return { screen, focusedDimension };
}

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      userId: null,
      profile: null,
      setProfile: (profile) => set({ profile }),
      setUser: (userId) => set({ userId }),

      screen: 'home',
      focusedDimension: undefined,
      navigationStack: [],
      selectedDate: isoToday(),
      goTo: (screen, focusedDimension) => {
        const current = get();
        const next = resolveScreen(screen, focusedDimension);
        const isSameScreen = current.screen === next.screen && current.focusedDimension === next.focusedDimension;

        set({
          screen: next.screen,
          focusedDimension: next.focusedDimension,
          navigationStack: isSameScreen
            ? current.navigationStack ?? []
            : [...(current.navigationStack ?? []), {
              screen: current.screen,
              focusedDimension: current.focusedDimension,
            }].slice(-12),
        });
      },
      goBack: () => {
        const current = get();
        const stack = current.navigationStack ?? [];
        const previous = stack[stack.length - 1];

        if (!previous) {
          set({ screen: 'home', focusedDimension: undefined, navigationStack: [] });
          return;
        }

        set({
          screen: previous.screen,
          focusedDimension: previous.focusedDimension,
          navigationStack: stack.slice(0, -1),
        });
      },
      setSelectedDate: (selectedDate) => set({ selectedDate }),

      toast: null,
      showToast: (toast) => {
        set({ toast });
        setTimeout(() => set({ toast: null }), 2400);
      },
    }),
    {
      name: 'full-ritual-session',
      storage: createJSONStorage(() => safeStringStorage),
      version: 1,
      partialize: (state) => {
        const { selectedDate: _selectedDate, ...persistedState } = state;
        return persistedState;
      },
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState as Partial<AppState>),
        selectedDate: isoToday(),
      }),
      migrate: (persistedState) => {
        const state = persistedState as AppState;
        const migratedState = (state?.screen as string) === 'sleep'
          ? { ...state, screen: 'energy' as Screen }
          : state;

        return {
          ...migratedState,
          selectedDate: isoToday(),
        };
      },
    }
  )
);

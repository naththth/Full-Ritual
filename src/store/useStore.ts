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
  | 'onboarding'
  | 'products'
  | 'library'
  | 'evolution'
  | 'chat'
  | 'body_coach'
  | 'body_metrics'
  | 'labs'
  | 'supplements'
  | 'pain'
  | 'health'
  | 'skin';

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
  activeDimensions: DimensionKey[];
  setActiveDimensions: (dims: DimensionKey[]) => void;
  sexo: 'masculino' | 'feminino' | 'outro' | null;
  setSexo: (s: 'masculino' | 'feminino' | 'outro' | null) => void;

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

  if (focusedDimension === 'skin') return { screen: 'skin', focusedDimension };
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
      setProfile: (profile) => {
        const updates: Partial<AppState> = { profile };
        if (profile) {
          const dims = profile.selected_dimensions?.length
            ? (profile.selected_dimensions as DimensionKey[]).filter((d): d is DimensionKey =>
                ['skin', 'body', 'mind', 'diet', 'spirit'].includes(d),
              )
            : (['skin', 'body', 'mind', 'diet', 'spirit'] as DimensionKey[]);
          updates.activeDimensions = dims;
          updates.sexo = profile.biological_sex ?? null;
        }
        set(updates);
      },
      setUser: (userId) => set((state) => {
        if (state.userId === userId) return { userId };
        return {
          userId,
          profile: null,
          activeDimensions: ['skin', 'body', 'mind', 'diet', 'spirit'],
          sexo: null,
          screen: userId ? 'home' : 'home',
          focusedDimension: undefined,
          navigationStack: [],
        };
      }),
      activeDimensions: ['skin', 'body', 'mind', 'diet', 'spirit'],
      setActiveDimensions: (activeDimensions) => set({ activeDimensions }),
      sexo: null,
      setSexo: (sexo) => set({ sexo }),

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
        const {
          selectedDate: _selectedDate,
          userId: _userId,
          profile: _profile,
          activeDimensions: _activeDimensions,
          sexo: _sexo,
          ...persistedState
        } = state;
        return persistedState;
      },
      merge: (persistedState, currentState) => {
        const {
          userId: _userId,
          profile: _profile,
          activeDimensions: _activeDimensions,
          sexo: _sexo,
          ...safePersistedState
        } = (persistedState as Partial<AppState>) ?? {};

        return {
          ...currentState,
          ...safePersistedState,
          selectedDate: isoToday(),
        };
      },
      migrate: (persistedState) => {
        const state = persistedState as AppState;
        const migratedState = (state?.screen as string) === 'sleep'
          ? { ...state, screen: 'energy' as Screen }
          : state;
        const {
          userId: _userId,
          profile: _profile,
          activeDimensions: _activeDimensions,
          sexo: _sexo,
          ...safeMigratedState
        } = migratedState;

        return {
          ...safeMigratedState,
          selectedDate: isoToday(),
        };
      },
    }
  )
);

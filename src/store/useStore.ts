import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Profile, DimensionKey } from '../types';
import { isoToday } from '../lib/dates';
import { safeStringStorage } from '../lib/storage';

type Screen =
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
  | 'chat';

interface AppState {
  // Sessão
  userId: string | null;
  profile: Profile | null;
  setProfile: (p: Profile | null) => void;
  setUser: (id: string | null) => void;

  // Navegação
  screen: Screen;
  focusedDimension: DimensionKey | undefined;
  selectedDate: string;
  goTo: (s: Screen, dim?: DimensionKey) => void;
  setSelectedDate: (date: string) => void;

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
      focusedDimension: undefined,
      selectedDate: isoToday(),
      goTo: (screen, focusedDimension) => {
        if (screen === 'dimension') {
          if (focusedDimension === 'skin') {
            set({ screen: 'ritual', focusedDimension });
            return;
          }
          if (focusedDimension === 'body') {
            set({ screen: 'body', focusedDimension });
            return;
          }
          if (focusedDimension === 'mind') {
            set({ screen: 'mind', focusedDimension });
            return;
          }
          if (focusedDimension === 'diet') {
            set({ screen: 'diet', focusedDimension });
            return;
          }
          if (focusedDimension === 'spirit') {
            set({ screen: 'spirit', focusedDimension });
            return;
          }
        }

        set({ screen, focusedDimension });
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
      migrate: (persistedState) => {
        const state = persistedState as AppState;
        return (state?.screen as string) === 'sleep'
          ? { ...state, screen: 'energy' }
          : state;
      },
    }
  )
);

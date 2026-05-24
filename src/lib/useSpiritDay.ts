import { useCallback, useEffect, useRef, useState } from 'react';
import { hasSupabase } from './supabase';
import { loadSpirit, saveSpirit, type SpiritPayload } from './spiritService';
import { readJson, writeJson, scopedStorageKey } from './storage';
import type { SpiritTheme } from '../types';

interface SpiritState {
  intention: string;
  relief: string;
  gratitude: string;
  mood: number;
  theme: SpiritTheme | null;
}

const INITIAL: SpiritState = {
  intention: '',
  relief: '',
  gratitude: '',
  mood: 7,
  theme: 'presenca',
};

function toPayload(s: SpiritState): SpiritPayload {
  return {
    intention: s.intention || null,
    gratitude: s.gratitude ? [s.gratitude] : [],
    mood: s.mood,
    theme: s.theme,
    notes: s.relief || null,
  };
}

function fromPayload(p: SpiritPayload): SpiritState {
  return {
    intention: p.intention ?? '',
    relief: p.notes ?? '',
    gratitude: p.gratitude?.[0] ?? '',
    mood: p.mood ?? 7,
    theme: p.theme ?? 'presenca',
  };
}

export function useSpiritDay(userId: string | null, date: string) {
  const cacheKey = scopedStorageKey(`full-ritual-spirit-${date}`, userId ?? '');

  const [state, setState] = useState<SpiritState>(() =>
    readJson(cacheKey, INITIAL),
  );
  const [loading, setLoading] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Load from Supabase when userId/date changes; fall back to localStorage
  useEffect(() => {
    if (!hasSupabase || !userId) {
      setState(readJson(cacheKey, INITIAL));
      return;
    }
    setLoading(true);
    loadSpirit(userId, date)
      .then((payload) => {
        if (!mountedRef.current) return;
        if (payload) {
          const s = fromPayload(payload);
          setState(s);
          writeJson(cacheKey, s);
        } else {
          setState(readJson(cacheKey, INITIAL));
        }
      })
      .catch(() => {
        if (mountedRef.current) setState(readJson(cacheKey, INITIAL));
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, date]);

  const update = useCallback(<K extends keyof SpiritState>(key: K, value: SpiritState[K]) => {
    setState((prev) => {
      const next = { ...prev, [key]: value };
      writeJson(cacheKey, next);

      if (hasSupabase && userId) {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          saveSpirit(userId, date, toPayload(next)).catch(console.error);
        }, 800);
      }

      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, date, cacheKey]);

  return { state, update, loading } as const;
}

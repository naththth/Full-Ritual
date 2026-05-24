import { useCallback, useEffect, useRef, useState } from 'react';
import { hasSupabase } from './supabase';
import {
  loadCheckin,
  saveCheckin,
  saveSleepLog,
  listSleepLogs,
  type CheckinPayload,
  type SleepPayload,
} from './energyService';
import { addDays, dateFromIso, isoToday } from './dates';
import { readJson, writeJson, scopedStorageKey } from './storage';
import type { SleepLog } from '../types';

export interface EnergyCheckin {
  energy: number;
  calm: number;
  skinState: number;
  bodyState: number;
  signals: string[];
  note: string;
}

const INITIAL_CHECKIN: EnergyCheckin = {
  energy: 6,
  calm: 5,
  skinState: 7,
  bodyState: 6,
  signals: [],
  note: '',
};

function toCheckinPayload(c: EnergyCheckin): CheckinPayload {
  return {
    energy: c.energy,
    calm: c.calm,
    skin_state: c.skinState,
    body_state: c.bodyState,
    signals: c.signals,
    note: c.note || null,
  };
}

function fromCheckinPayload(p: CheckinPayload): EnergyCheckin {
  return {
    energy: p.energy ?? 6,
    calm: p.calm ?? 5,
    skinState: p.skin_state ?? 7,
    bodyState: p.body_state ?? 6,
    signals: p.signals ?? [],
    note: p.note ?? '',
  };
}

export function useEnergyDay(userId: string | null, date: string) {
  const checkinKey = scopedStorageKey(`full-ritual-energy-${date}`, userId ?? '');
  const sleepListKey = scopedStorageKey('full-ritual-sleep', userId ?? '');

  const [checkin, setCheckinState] = useState<EnergyCheckin>(() =>
    readJson(checkinKey, INITIAL_CHECKIN),
  );
  const [sleepLogs, setSleepLogs] = useState<SleepLog[]>(() =>
    readJson(sleepListKey, []),
  );
  const [sleepHistory, setSleepHistory] = useState<SleepLog[]>([]);

  const checkinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Load checkin from Supabase when userId/date changes
  useEffect(() => {
    if (!hasSupabase || !userId) {
      setCheckinState(readJson(checkinKey, INITIAL_CHECKIN));
      return;
    }
    loadCheckin(userId, date)
      .then((payload) => {
        if (!mountedRef.current) return;
        if (payload) {
          const c = fromCheckinPayload(payload);
          setCheckinState(c);
          writeJson(checkinKey, c);
        } else {
          setCheckinState(readJson(checkinKey, INITIAL_CHECKIN));
        }
      })
      .catch(() => {
        if (mountedRef.current) setCheckinState(readJson(checkinKey, INITIAL_CHECKIN));
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, date]);

  // Load sleep history from Supabase on mount
  useEffect(() => {
    if (!hasSupabase || !userId) {
      setSleepLogs(readJson(sleepListKey, []));
      return;
    }
    const since = isoToday(addDays(new Date(), -13));
    listSleepLogs(userId, since)
      .then((data) => {
        if (!mountedRef.current) return;
        setSleepHistory(data);
        setSleepLogs((current) => {
          const merged = [...current];
          for (const log of data) {
            if (!merged.some((l) => l.date === log.date)) merged.push(log);
          }
          return merged;
        });
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const setCheckinField = useCallback(<K extends keyof EnergyCheckin>(field: K, value: EnergyCheckin[K]) => {
    setCheckinState((prev) => {
      const next = { ...prev, [field]: value };
      writeJson(checkinKey, next);

      if (hasSupabase && userId) {
        if (checkinTimer.current) clearTimeout(checkinTimer.current);
        checkinTimer.current = setTimeout(() => {
          saveCheckin(userId, date, toCheckinPayload(next)).catch(console.error);
        }, 800);
      }

      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, date, checkinKey]);

  const toggleSignal = useCallback((signal: string) => {
    setCheckinState((prev) => {
      const next = {
        ...prev,
        signals: prev.signals.includes(signal)
          ? prev.signals.filter((s) => s !== signal)
          : [...prev.signals, signal],
      };
      writeJson(checkinKey, next);

      if (hasSupabase && userId) {
        if (checkinTimer.current) clearTimeout(checkinTimer.current);
        checkinTimer.current = setTimeout(() => {
          saveCheckin(userId, date, toCheckinPayload(next)).catch(console.error);
        }, 800);
      }

      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, date, checkinKey]);

  const persistSleep = useCallback((payload: SleepPayload, previousDate: string) => {
    const log: SleepLog = {
      id: crypto.randomUUID(),
      user_id: userId ?? 'local',
      date,
      bedtime: `${previousDate}T${payload.bedtime}:00`,
      wake_time: `${date}T${payload.wake_time}:00`,
      duration_min: payload.duration_min,
      quality: payload.quality,
      notes: payload.notes,
    };

    if (hasSupabase && userId) {
      saveSleepLog(userId, date, {
        ...payload,
        bedtime: log.bedtime ?? '',
        wake_time: log.wake_time ?? '',
      })
        .then((saved) => {
          if (!mountedRef.current) return;
          setSleepLogs((current) => [
            ...current.filter((s) => s.date !== date),
            saved,
          ]);
          writeJson(sleepListKey, [
            ...readJson<SleepLog[]>(sleepListKey, []).filter((s) => s.date !== date),
            saved,
          ]);
        })
        .catch(console.error);
    } else {
      setSleepLogs((current) => [...current.filter((s) => s.date !== date), log]);
      writeJson(sleepListKey, [
        ...readJson<SleepLog[]>(sleepListKey, []).filter((s) => s.date !== date),
        log,
      ]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, date, sleepListKey]);

  const currentSleep = sleepLogs.find((l) => l.date === date);
  const previousDate = isoToday(addDays(dateFromIso(date), -1));

  return {
    checkin,
    setCheckinField,
    toggleSignal,
    sleepLogs,
    sleepHistory,
    currentSleep,
    previousDate,
    persistSleep,
  } as const;
}

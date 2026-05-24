import { supabase } from './supabase';
import type { SleepLog } from '../types';

export interface CheckinPayload {
  energy: number;
  calm: number;
  skin_state: number;
  body_state: number;
  signals: string[];
  note: string | null;
}

export interface SleepPayload {
  bedtime: string;
  wake_time: string;
  duration_min: number;
  quality: number;
  notes: string | null;
}

export async function loadCheckin(userId: string, date: string): Promise<CheckinPayload | null> {
  const { data, error } = await supabase
    .from('checkins')
    .select('energy, calm, skin_state, body_state, signals, note')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    energy: data.energy ?? 6,
    calm: data.calm ?? 5,
    skin_state: data.skin_state ?? 7,
    body_state: data.body_state ?? 6,
    signals: data.signals ?? [],
    note: data.note ?? null,
  };
}

export async function saveCheckin(userId: string, date: string, payload: CheckinPayload): Promise<void> {
  const { error } = await supabase
    .from('checkins')
    .upsert({ user_id: userId, date, ...payload }, { onConflict: 'user_id,date' });
  if (error) throw error;
}

export async function loadSleepLog(userId: string, date: string): Promise<SleepLog | null> {
  const { data, error } = await supabase
    .from('sleep_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle();

  if (error) throw error;
  return data as SleepLog | null;
}

export async function saveSleepLog(userId: string, date: string, payload: SleepPayload): Promise<SleepLog> {
  const { data, error } = await supabase
    .from('sleep_logs')
    .upsert({ user_id: userId, date, ...payload }, { onConflict: 'user_id,date' })
    .select('*')
    .single();

  if (error) throw error;
  return data as SleepLog;
}

export async function listSleepLogs(userId: string, since: string): Promise<SleepLog[]> {
  const { data, error } = await supabase
    .from('sleep_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('date', since)
    .order('date', { ascending: true });

  if (error) throw error;
  return (data ?? []) as SleepLog[];
}

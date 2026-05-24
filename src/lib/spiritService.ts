import { supabase } from './supabase';
import type { SpiritTheme } from '../types';

export interface SpiritPayload {
  intention: string | null;
  gratitude: string[];
  mood: number;
  theme: SpiritTheme | null;
  notes: string | null;
}

export async function loadSpirit(userId: string, date: string): Promise<SpiritPayload | null> {
  const { data, error } = await supabase
    .from('spirit_logs')
    .select('intention, gratitude, mood, theme, notes')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    intention: data.intention ?? null,
    gratitude: data.gratitude ?? [],
    mood: data.mood ?? 7,
    theme: data.theme ?? null,
    notes: data.notes ?? null,
  };
}

export async function saveSpirit(userId: string, date: string, payload: SpiritPayload): Promise<void> {
  const { error } = await supabase.from('spirit_logs').upsert(
    { user_id: userId, date, ...payload },
    { onConflict: 'user_id,date' },
  );
  if (error) throw error;
}

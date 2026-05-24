import { supabase } from './supabase';

export interface SkincareLogPayload {
  time_of_day: 'manha' | 'noite';
  skin_signal: string | null;
  photo_url: string | null;
}

export async function loadSkincareLog(userId: string, date: string, timeOfDay: 'manha' | 'noite'): Promise<SkincareLogPayload | null> {
  const { data, error } = await supabase
    .from('skincare_logs')
    .select('time_of_day, skin_signal, photo_url')
    .eq('user_id', userId)
    .eq('date', date)
    .eq('time_of_day', timeOfDay)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    time_of_day: data.time_of_day as 'manha' | 'noite',
    skin_signal: data.skin_signal ?? null,
    photo_url: data.photo_url ?? null,
  };
}

export async function saveSkincareLog(userId: string, date: string, payload: SkincareLogPayload): Promise<void> {
  const { error } = await supabase
    .from('skincare_logs')
    .upsert(
      { user_id: userId, date, ...payload },
      { onConflict: 'user_id,date,time_of_day' },
    );
  if (error) throw error;
}

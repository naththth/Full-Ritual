import { supabase } from './supabase';

export interface MindLogRow {
  user_id: string;
  date: string;
  type: string;
  duration_min: number | null;
  content_ref: string | null;
  notes: string | null;
}

export async function saveMindLogs(rows: MindLogRow[]): Promise<void> {
  if (!rows.length) return;
  const { error } = await supabase
    .from('mind_logs')
    .upsert(rows, { onConflict: 'user_id,date,type' });
  if (error) throw error;
}

export async function loadMindLogs(userId: string, date: string): Promise<MindLogRow[]> {
  const { data, error } = await supabase
    .from('mind_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date);

  if (error) throw error;
  return (data ?? []) as MindLogRow[];
}

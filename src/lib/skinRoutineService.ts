import { supabase } from './supabase';
import type { SkinRoutine, SkinRoutineItem } from '../types';

export type { SkinRoutineItem };

export async function loadLatestSkinRoutine(userId: string): Promise<SkinRoutine | null> {
  const { data, error } = await supabase
    .from('skin_routines')
    .select('*, skin_routine_items(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    ...data,
    skin_routine_items: (data.skin_routine_items ?? []).sort(
      (a: SkinRoutineItem, b: SkinRoutineItem) => a.order_index - b.order_index,
    ),
  } as SkinRoutine;
}

export async function toggleRoutineItemCheck(
  userId: string,
  itemId: string,
  checked: boolean,
): Promise<SkinRoutineItem> {
  const { data, error } = await supabase
    .from('skin_routine_items')
    .update({
      is_checked: checked,
      checked_at: checked ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  return data as SkinRoutineItem;
}

export interface GenerateRoutineResult {
  routine: SkinRoutine;
  warnings: string[];
  recommendations: string[];
  missingInformation: string[];
  dermatologySafetyNotes: string[];
}

export async function generateSkinRoutine(
  _userId: string,
  authToken: string,
): Promise<GenerateRoutineResult> {
  const supabaseUrl = (supabase as unknown as { supabaseUrl: string }).supabaseUrl
    ?? import.meta.env.VITE_SUPABASE_URL;

  const response = await fetch(`${supabaseUrl}/functions/v1/ia-care`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? 'Erro ao gerar rotina.');
  }

  const result = await response.json();
  return result as GenerateRoutineResult;
}

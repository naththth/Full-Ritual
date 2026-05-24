import { supabase } from './supabase';
import type { MealType } from '../types';

export interface MealLogPayload {
  meal_type: MealType;
  ingredients: string[];
  photo_url: string | null;
  notes: string | null;
}

export interface DietPlanRow {
  manual_foods: unknown[];
  pdf_url: string | null;
  pdf_name: string | null;
  notes: string | null;
  setup_mode: string | null;
  nutri_profile: Record<string, unknown>;
  nutri_configured: boolean;
}

export async function saveMealLog(userId: string, date: string, payload: MealLogPayload): Promise<void> {
  const { error } = await supabase
    .from('meal_logs')
    .upsert({ user_id: userId, date, ...payload }, { onConflict: 'user_id,date,meal_type' });
  if (error) throw error;
}

export async function loadDietPlan(userId: string): Promise<DietPlanRow | null> {
  const { data, error } = await supabase
    .from('diet_plans')
    .select('manual_foods, pdf_url, pdf_name, notes, setup_mode, nutri_profile, nutri_configured')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    manual_foods: (data.manual_foods as unknown[]) ?? [],
    pdf_url: data.pdf_url ?? null,
    pdf_name: data.pdf_name ?? null,
    notes: data.notes ?? null,
    setup_mode: data.setup_mode ?? null,
    nutri_profile: (data.nutri_profile as Record<string, unknown>) ?? {},
    nutri_configured: Boolean(data.nutri_configured),
  };
}

export async function saveDietPlan(userId: string, plan: DietPlanRow): Promise<void> {
  const { error } = await supabase
    .from('diet_plans')
    .upsert({
      user_id: userId,
      manual_foods: plan.manual_foods,
      pdf_url: plan.pdf_url,
      pdf_name: plan.pdf_name,
      notes: plan.notes,
      setup_mode: plan.setup_mode,
      nutri_profile: plan.nutri_profile,
      nutri_configured: plan.nutri_configured,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  if (error) throw error;
}

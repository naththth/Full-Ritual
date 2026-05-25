import { supabase } from './supabase';
import type { MealType } from '../types';
import type { DietMeal, DietFood, FoodMacros } from './dietCalculations';

// ── Tipos ─────────────────────────────────────────────────────────────────────

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

export interface DietProfileRow {
  id?: string;
  goal?: string | null;
  weight_kg?: number | null;
  height_cm?: number | null;
  age?: number | null;
  sex?: string | null;
  activity_level?: string | null;
  work_routine?: string | null;
  desired_meals_count?: number | null;
  hunger_level?: string | null;
  training_routine?: string | null;
  training_frequency?: string | null;
  training_schedule?: string | null;
  training_duration_min?: number | null;
  training_intensity?: string | null;
  fasted_training?: boolean | null;
  sports_goal?: string | null;
  liked_foods?: string | null;
  avoided_foods?: string | null;
  current_water_ml?: number | null;
  supplements?: string | null;
  dietary_restrictions?: string | null;
  intolerances?: string | null;
  allergies?: string | null;
  digestive_symptoms?: string | null;
  injuries?: string | null;
  medications?: string | null;
  relevant_exams?: string | null;
  pregnancy_context?: string | null;
  professional_calories?: number | null;
  professional_protein_g?: number | null;
  professional_carbs_g?: number | null;
  professional_fat_g?: number | null;
  professional_notes?: string | null;
  diet_history?: string | null;
  appetite_and_energy?: string | null;
  budget?: string | null;
  cooking_skill?: string | null;
  objective_details?: string | null;
  available_meal_times?: string | null;
}

export interface DietDocumentRow {
  id: string;
  file_name: string;
  file_path: string;
  file_size?: number | null;
  mime_type: string;
  source: string;
  status: string;
  notes?: string | null;
  uploaded_at: string;
}

export interface DietMealRow extends DietMeal {
  user_id?: string;
  diet_plan_id?: string | null;
}

export interface DietFoodRow extends DietFood {
  user_id?: string;
}

export interface WaterDailyRow {
  id?: string;
  log_date: string;
  target_ml: number;
  consumed_ml: number;
}

const DIET_PROFILE_COLUMNS = [
  'goal',
  'weight_kg',
  'height_cm',
  'age',
  'sex',
  'activity_level',
  'work_routine',
  'desired_meals_count',
  'hunger_level',
  'training_routine',
  'training_frequency',
  'training_schedule',
  'training_duration_min',
  'training_intensity',
  'fasted_training',
  'sports_goal',
  'liked_foods',
  'avoided_foods',
  'current_water_ml',
  'supplements',
  'dietary_restrictions',
  'intolerances',
  'allergies',
  'digestive_symptoms',
  'injuries',
  'medications',
  'relevant_exams',
  'pregnancy_context',
  'professional_calories',
  'professional_protein_g',
  'professional_carbs_g',
  'professional_fat_g',
  'professional_notes',
  'diet_history',
  'appetite_and_energy',
  'budget',
  'cooking_skill',
  'objective_details',
  'available_meal_times',
] as const;

type DietProfileColumn = typeof DIET_PROFILE_COLUMNS[number];

export function sanitizeDietProfile(profile: DietProfileRow): Partial<Record<DietProfileColumn, DietProfileRow[DietProfileColumn]>> {
  const allowed = new Set<string>(DIET_PROFILE_COLUMNS);
  return Object.fromEntries(
    Object.entries(profile)
      .filter(([key]) => allowed.has(key))
      .map(([key, value]) => [key, value === '' ? null : value])
      .filter(([, value]) => value !== undefined),
  ) as Partial<Record<DietProfileColumn, DietProfileRow[DietProfileColumn]>>;
}

// ── meal_logs ─────────────────────────────────────────────────────────────────

export async function saveMealLog(userId: string, date: string, payload: MealLogPayload): Promise<void> {
  const { error } = await supabase
    .from('meal_logs')
    .upsert({ user_id: userId, date, ...payload }, { onConflict: 'user_id,date,meal_type' });
  if (error) throw error;
}

// ── diet_plans (legado — mantido para retrocompatibilidade) ───────────────────

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

// ── diet_profiles ─────────────────────────────────────────────────────────────

export async function loadDietProfile(userId: string): Promise<DietProfileRow | null> {
  const { data, error } = await supabase
    .from('diet_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function saveDietProfile(userId: string, profile: DietProfileRow): Promise<DietProfileRow> {
  const cleanProfile = sanitizeDietProfile(profile);
  const { data, error } = await supabase
    .from('diet_profiles')
    .upsert({ user_id: userId, ...cleanProfile }, { onConflict: 'user_id' })
    .select()
    .single();
  if (error) throw error;
  return data as DietProfileRow;
}

// ── diet_documents ────────────────────────────────────────────────────────────

export async function loadActiveDietDocument(userId: string): Promise<DietDocumentRow | null> {
  const { data, error } = await supabase
    .from('diet_documents')
    .select('id, file_name, file_path, file_size, mime_type, source, status, notes, uploaded_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('uploaded_at', { ascending: false })
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function saveDietDocument(userId: string, doc: Omit<DietDocumentRow, 'id' | 'uploaded_at'>): Promise<DietDocumentRow> {
  const { data, error } = await supabase
    .from('diet_documents')
    .insert({ user_id: userId, ...doc })
    .select()
    .single();
  if (error) throw error;
  return data as DietDocumentRow;
}

export async function archiveDietDocument(userId: string, docId: string): Promise<void> {
  const { error } = await supabase
    .from('diet_documents')
    .update({ status: 'archived' })
    .eq('id', docId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function getSignedDietUrl(filePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('diet')
    .createSignedUrl(filePath, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}

// ── diet_meals ────────────────────────────────────────────────────────────────

export async function loadDietMeals(userId: string): Promise<DietMealRow[]> {
  const { data, error } = await supabase
    .from('diet_meals')
    .select('id, name, meal_time, position, notes, total_calories, total_protein, total_carbs, total_fat')
    .eq('user_id', userId)
    .order('position', { ascending: true });
  if (error) throw error;
  return (data ?? []) as DietMealRow[];
}

export async function saveDietMeal(userId: string, meal: Omit<DietMealRow, 'id' | 'user_id'>): Promise<DietMealRow> {
  const { data, error } = await supabase
    .from('diet_meals')
    .insert({ user_id: userId, ...meal })
    .select()
    .single();
  if (error) throw error;
  return data as DietMealRow;
}

export async function updateDietMeal(userId: string, mealId: string, patch: Partial<DietMealRow>): Promise<void> {
  const { error } = await supabase
    .from('diet_meals')
    .update(patch)
    .eq('id', mealId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function deleteDietMeal(userId: string, mealId: string): Promise<void> {
  const { error } = await supabase
    .from('diet_meals')
    .delete()
    .eq('id', mealId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function updateMealTotals(userId: string, mealId: string, totals: FoodMacros): Promise<void> {
  await updateDietMeal(userId, mealId, {
    total_calories: totals.calories,
    total_protein: totals.protein,
    total_carbs: totals.carbs,
    total_fat: totals.fat,
  });
}

// ── diet_foods ────────────────────────────────────────────────────────────────

export async function loadDietFoods(userId: string, mealId: string): Promise<DietFoodRow[]> {
  const { data, error } = await supabase
    .from('diet_foods')
    .select('id, diet_meal_id, name, quantity, unit, calories, protein, carbs, fat, notes, position')
    .eq('user_id', userId)
    .eq('diet_meal_id', mealId)
    .order('position', { ascending: true });
  if (error) throw error;
  return (data ?? []) as DietFoodRow[];
}

export async function saveDietFood(userId: string, food: Omit<DietFoodRow, 'id' | 'user_id'>): Promise<DietFoodRow> {
  const { data, error } = await supabase
    .from('diet_foods')
    .insert({ user_id: userId, ...food })
    .select()
    .single();
  if (error) throw error;
  return data as DietFoodRow;
}

export async function deleteDietFood(userId: string, foodId: string): Promise<void> {
  const { error } = await supabase
    .from('diet_foods')
    .delete()
    .eq('id', foodId)
    .eq('user_id', userId);
  if (error) throw error;
}

// ── water_daily ───────────────────────────────────────────────────────────────

export async function loadWaterDaily(userId: string, date: string): Promise<WaterDailyRow | null> {
  const { data, error } = await supabase
    .from('water_daily')
    .select('id, log_date, target_ml, consumed_ml')
    .eq('user_id', userId)
    .eq('log_date', date)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function saveWaterDaily(userId: string, date: string, consumed_ml: number, target_ml: number): Promise<WaterDailyRow> {
  const { data, error } = await supabase
    .from('water_daily')
    .upsert({ user_id: userId, log_date: date, consumed_ml, target_ml }, { onConflict: 'user_id,log_date' })
    .select()
    .single();
  if (error) throw error;
  return data as WaterDailyRow;
}

// ── nutrition_ai_logs ─────────────────────────────────────────────────────────

export async function saveNutritionAiLog(userId: string, params: {
  diet_profile_id?: string | null;
  prompt_summary?: string | null;
  response: string;
  model?: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from('nutrition_ai_logs')
    .insert({ user_id: userId, ...params });
  if (error) throw error;
}

export async function loadLatestNutritionAiLog(userId: string): Promise<{ response: string; created_at: string } | null> {
  const { data, error } = await supabase
    .from('nutrition_ai_logs')
    .select('response, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data ?? null;
}

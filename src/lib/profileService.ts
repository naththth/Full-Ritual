import { supabase } from './supabase';
import type { Profile, DimensionKey } from '../types';

export type BiologicalSex = 'feminino' | 'masculino' | 'outro';

export const SELECTABLE_DIMENSIONS: DimensionKey[] = ['skin', 'body', 'mind', 'diet', 'spirit'];

// ─── pure helpers (tested) ───────────────────────────────────────────────────

export function needsOnboarding(profile: Pick<Profile, 'onboarding_completed'>): boolean {
  return !profile.onboarding_completed;
}

export function isEnergyAlwaysActive(): boolean {
  return true;
}

export function isInsightSelectable(): boolean {
  return false;
}

export function getSelectableDimensions(): readonly DimensionKey[] {
  return SELECTABLE_DIMENSIONS;
}

export function shouldShowCycleTracking(
  profile: Pick<Profile, 'biological_sex' | 'cycle_tracking'>,
): boolean {
  return profile.biological_sex === 'feminino' && profile.cycle_tracking === true;
}

export function toggleDimension(
  current: DimensionKey[],
  dim: DimensionKey,
): DimensionKey[] {
  const has = current.includes(dim);
  if (has) {
    const next = current.filter((d) => d !== dim);
    return next.length === 0 ? current : next;
  }
  return [...current, dim];
}

export function normalizeDimensions(dims: string[]): DimensionKey[] {
  const valid = SELECTABLE_DIMENSIONS;
  const filtered = dims.filter((d): d is DimensionKey => (valid as readonly string[]).includes(d));
  return filtered.length === 0 ? [...valid] : filtered;
}

export function buildProfilePatch(
  fields: Partial<Pick<Profile, 'biological_sex' | 'selected_dimensions' | 'onboarding_completed' | 'onboarding_completed_at' | 'onboarding_version'>>,
): typeof fields {
  return { ...fields };
}

// ─── Supabase I/O ────────────────────────────────────────────────────────────

export async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data as Profile;
}

export async function saveProfilePatch(
  userId: string,
  patch: Partial<Omit<Profile, 'id' | 'created_at'>>,
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
}

export async function completeOnboarding(userId: string, version = '2'): Promise<void> {
  await saveProfilePatch(userId, {
    onboarding_completed: true,
    onboarding_completed_at: new Date().toISOString(),
    onboarding_version: version,
  });
}

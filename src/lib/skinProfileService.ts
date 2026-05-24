import { supabase } from './supabase';
import type { SkinProfile } from '../types';

export type SkinProfilePayload = Omit<SkinProfile, 'id' | 'user_id' | 'created_at' | 'updated_at'>;

export async function loadSkinProfile(userId: string): Promise<SkinProfile | null> {
  const { data, error } = await supabase
    .from('skin_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data as SkinProfile | null;
}

export async function saveSkinProfile(userId: string, payload: SkinProfilePayload): Promise<void> {
  const { error } = await supabase
    .from('skin_profiles')
    .upsert({ user_id: userId, ...payload, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

  if (error) throw error;
}

export async function loadSkinProducts(userId: string) {
  const { data, error } = await supabase
    .from('skin_products')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function saveSkinProduct(
  userId: string,
  product: {
    name: string;
    brand?: string | null;
    category?: string | null;
    area?: 'face' | 'body' | 'aromas' | null;
    current_frequency?: string | null;
    causes_irritation?: boolean;
    is_prescription?: boolean;
    notes?: string | null;
  },
) {
  const { data, error } = await supabase
    .from('skin_products')
    .insert({ user_id: userId, ...product })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function deleteSkinProduct(userId: string, productId: string): Promise<void> {
  const { error } = await supabase
    .from('skin_products')
    .delete()
    .eq('id', productId)
    .eq('user_id', userId);

  if (error) throw error;
}

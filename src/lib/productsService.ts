import { supabase } from './supabase';
import type { Product } from '../types';

export async function loadProducts(userId: string): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('user_id', userId)
    .order('order_in_routine', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Product[];
}

export async function saveProduct(userId: string, product: Omit<Product, 'id' | 'created_at' | 'user_id'>): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .insert({ ...product, user_id: userId })
    .select('*')
    .single();

  if (error) throw error;
  return data as Product;
}

export async function updateProduct(userId: string, id: string, patch: Partial<Product>): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) throw error;
  return data as Product;
}

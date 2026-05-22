import { hasSupabase, supabase } from './supabase';

export interface BodyCoachMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  metadata?: Record<string, unknown> | null;
}

export interface DietAddition {
  date?: string;
  meal_type?: 'manha' | 'almoco' | 'lanche' | 'jantar' | 'ceia' | null;
  title: string;
  note?: string;
  rationale?: string;
}

export async function fetchBodyCoachHistory(userId: string): Promise<BodyCoachMessage[]> {
  if (!hasSupabase) return [];
  const { data, error } = await supabase
    .from('body_coach_messages')
    .select('id, role, content, created_at, metadata')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) {
    console.error(error);
    return [];
  }
  return (data ?? []) as BodyCoachMessage[];
}

export async function sendBodyCoachMessage(message: string): Promise<{
  reply: string;
  diet_additions: DietAddition[];
}> {
  if (!hasSupabase) {
    return { reply: 'Configure o Supabase para falar com o IA Coach.', diet_additions: [] };
  }
  const { data, error } = await supabase.functions.invoke<{
    reply: string;
    diet_additions: DietAddition[];
  }>('body-coach', { body: { message } });
  if (error) throw new Error(error.message);
  if (!data) throw new Error('resposta vazia do IA Coach.');
  return data;
}

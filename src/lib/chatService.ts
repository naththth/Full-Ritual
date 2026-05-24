import { supabase } from './supabase';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  at: string;
}

export async function loadConversation(userId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('ai_conversations')
    .select('messages')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data?.messages as ChatMessage[]) ?? [];
}

export async function saveConversation(userId: string, messages: ChatMessage[]): Promise<void> {
  const { data: existing } = await supabase
    .from('ai_conversations')
    .select('id')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from('ai_conversations')
      .update({ messages, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .eq('user_id', userId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('ai_conversations')
      .insert({ user_id: userId, messages });
    if (error) throw error;
  }
}

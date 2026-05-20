import { supabase, hasSupabase } from './supabase';

export interface GeminiContext {
  /** Últimos N dias de scores e checkins. Montado no front antes de chamar. */
  recent_summary?: string;
  /** Dimensão sob foco no contexto atual da conversa (para tom). */
  focus_dimension?: string;
}

export interface GeminiResponse {
  reply: string;
  suggestions?: string[];
  insight?: { title: string; body: string };
}

/**
 * Conversa com a IA. A chave do Gemini NUNCA aparece no front.
 * A Edge Function `gemini-chat` valida o usuário, busca contexto extra
 * direto do Postgres (com RLS), monta o prompt e chama o Gemini.
 */
export async function geminiChat(
  message: string,
  context: GeminiContext = {}
): Promise<GeminiResponse> {
  if (!hasSupabase) {
    return {
      reply:
        'Configure o Supabase para conversar com a IA. ' +
        'Enquanto isso, escreva no diário e os padrões vão aparecer.',
    };
  }

  const { data, error } = await supabase.functions.invoke<GeminiResponse>('gemini-chat', {
    body: { message, context },
  });

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Resposta vazia da IA.');
  return data;
}

/**
 * Regenera a ordem da rotina de skincare a partir dos produtos cadastrados.
 * Roda no servidor para garantir que a lógica clínica fique consistente.
 */
export async function regenerateSkincareRoutine(timeOfDay: 'manha' | 'noite'): Promise<{
  ordered_products: { id: string; order: number; name: string; category?: string; reason: string }[];
}> {
  if (!hasSupabase) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase.functions.invoke('regenerate-routine', {
    body: { time_of_day: timeOfDay },
  });
  if (error) throw new Error(error.message);
  return data;
}

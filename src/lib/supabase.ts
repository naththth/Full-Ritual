import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Falha visível em dev; em produção isso vira erro no console e o app degrada
  // para modo offline (localStorage) caso a integração não esteja configurada.
  console.warn(
    '[Full Ritual] Variáveis VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY ausentes. ' +
    'O app vai rodar em modo offline (somente localStorage).'
  );
}

export const supabase: SupabaseClient = createClient(
  SUPABASE_URL ?? 'https://placeholder.supabase.co',
  SUPABASE_ANON_KEY ?? 'placeholder',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  }
);

export const hasSupabase = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

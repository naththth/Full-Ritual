// =====================================================================
// FULL RITUAL · Edge Function `regenerate-routine`
// Quando produtos mudam, a IA reordena a rotina de skincare seguindo
// a ordem correta de aplicação (limpeza → tônico → sérum → tratamento →
// hidratante → protetor solar) e a frequência cadastrada.
// =====================================================================

// @ts-expect-error
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// @ts-expect-error
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// @ts-expect-error
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Ordem clínica fixa (não vem da IA — é regra do produto)
const CATEGORY_ORDER: Record<string, number> = {
  limpeza:        1,
  tonico:         2,
  esfoliante:     3,
  serum:          4,
  tratamento:     5,
  olhos:          6,
  hidratante:     7,
  mascara:        8,
  protetor_solar: 9,
  corpo:          10,
};

// @ts-expect-error
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'sem auth' }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'usuário inválido' }, 401);

    const { time_of_day } = await req.json() as { time_of_day: 'manha' | 'noite' };

    // Busca produtos ativos do usuário para esse momento
    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', user.id)
      .eq('active', true)
      .or(`step.eq.${time_of_day},step.eq.ambos`);

    if (error) return json({ error: error.message }, 500);

    // Aplica ordem clínica e regrava order_in_routine
    const ordered = (products ?? [])
      .map((p) => ({
        ...p,
        clinical_order: CATEGORY_ORDER[p.category] ?? 99,
      }))
      .sort((a, b) => a.clinical_order - b.clinical_order)
      // Protetor solar só de manhã (regra dura)
      .filter((p) => !(p.category === 'protetor_solar' && time_of_day === 'noite'));

    // Atualiza order_in_routine
    for (let i = 0; i < ordered.length; i++) {
      await supabase
        .from('products')
        .update({ order_in_routine: i + 1 })
        .eq('id', ordered[i].id);
    }

    return json({
      ordered_products: ordered.map((p, i) => ({
        id: p.id,
        order: i + 1,
        category: p.category,
        name: p.name,
        reason: explanationFor(p.category, time_of_day),
      })),
    }, 200);
  } catch (err) {
    console.error(err);
    return json({ error: 'erro interno' }, 500);
  }
});

function explanationFor(cat: string, when: string): string {
  const map: Record<string, string> = {
    limpeza:        'começa pela limpeza para preparar a pele',
    tonico:         'tônico repõe pH e prepara para os ativos',
    esfoliante:     'esfoliante antes dos ativos potencializa a absorção',
    serum:          'sérum entra antes do hidratante, ativo concentrado primeiro',
    tratamento:     'ativo de tratamento depois do sérum',
    olhos:          'área dos olhos pede produto específico, gesto suave',
    hidratante:     'hidratante sela os ativos anteriores',
    mascara:        'máscara como pausa de cuidado, antes do hidratante',
    protetor_solar: when === 'manha' ? 'protetor solar é a última camada da manhã' : 'protetor solar à noite não é necessário',
    corpo:          'cuidado com o corpo finaliza o ritual',
  };
  return map[cat] ?? 'aplicar na ordem correspondente';
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// =====================================================================
// FULL RITUAL · Edge Function `ia-nutri`
// IA NUTRI — gera orientação nutricional estruturada com base no
// perfil real do usuário. Nunca expõe GEMINI_API_KEY.
// user_id vem sempre da sessão autenticada (JWT), nunca do body.
// =====================================================================

// @ts-expect-error Deno runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { IA_NUTRI_SYSTEM_PROMPT, buildNutriContext } from './prompt.ts';

// @ts-expect-error Deno global
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
// @ts-expect-error
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// @ts-expect-error
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-user-jwt, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// @ts-expect-error Deno serve
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let body: { question?: string; date?: string; user_jwt?: string } = {};
  try { body = await req.json(); } catch { /* nenhum body */ }

  const userJwt = req.headers.get('x-user-jwt')
    ?? (typeof body.user_jwt === 'string' ? body.user_jwt : undefined)
    ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!userJwt) return json({ error: 'token de usuário ausente' }, 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { authorization: `Bearer ${userJwt}` } },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    console.error('ia-nutri auth.getUser failed:', authError);
    return json({ error: 'sessão inválida ou expirada' }, 401);
  }

  const userId = user.id;

  const question = typeof body.question === 'string' ? body.question.trim() : '';
  const date = typeof body.date === 'string' ? body.date : new Date().toISOString().split('T')[0];

  // Coleta dados reais do usuário (tudo via RLS)
  const [profileRes, docRes, mealsRes, waterRes, labRes] = await Promise.all([
    supabase.from('diet_profiles').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('diet_documents').select('id, file_name').eq('user_id', userId).eq('status', 'active').order('uploaded_at', { ascending: false }).maybeSingle(),
    supabase.from('diet_meals').select('id, name, total_calories, total_protein, total_carbs, total_fat').eq('user_id', userId).order('position'),
    supabase.from('water_daily').select('consumed_ml, target_ml').eq('user_id', userId).eq('log_date', date).maybeSingle(),
    supabase.from('lab_results').select('date, lab_name, markers, file_type').eq('user_id', userId).order('date', { ascending: false }).limit(1).maybeSingle(),
  ]);

  const dietProfile = profileRes.data ?? {};
  const pdfDoc = docRes.data ?? null;
  const manualMeals = mealsRes.data ?? [];
  const waterToday = waterRes.data?.consumed_ml ?? 0;
  const latestLab = labRes.data ?? null;

  if (!dietProfile || Object.keys(dietProfile).length === 0) {
    return json({ error: 'perfil nutricional não encontrado. Preencha o questionário primeiro.' }, 400);
  }

  const context = buildNutriContext(dietProfile as Record<string, unknown>, {
    manualMeals,
    pdfDoc,
    latestLab,
    waterToday,
    question: question || undefined,
  });

  const userMessage = question
    ? question
    : 'Com base no meu perfil nutricional, por favor faça uma análise inicial e forneça orientações práticas para minha alimentação.';

  const prompt = [
    IA_NUTRI_SYSTEM_PROMPT,
    '',
    'DADOS REAIS DO USUÁRIO:',
    context,
    '',
    'Pergunta ou solicitação do usuário:',
    userMessage,
  ].join('\n');

  if (!GEMINI_API_KEY) return json({ error: 'IA indisponível' }, 503);

  let aiResponse = '';
  try {
    const geminiRes = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        ],
      }),
    });

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      console.error('Gemini error:', err);
      return json({ error: 'IA indisponível. Tente novamente.' }, 503);
    }

    const geminiData = await geminiRes.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    aiResponse = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!aiResponse) return json({ error: 'IA retornou resposta vazia.' }, 503);
  } catch (err) {
    console.error('Gemini fetch error:', err);
    return json({ error: 'Erro ao conectar com a IA. Tente novamente.' }, 503);
  }

  // Persistir log da interação
  try {
    const profileId = (dietProfile as Record<string, string>).id ?? null;
    await supabase.from('nutrition_ai_logs').insert({
      user_id: userId,
      diet_profile_id: profileId,
      prompt_summary: question || 'análise inicial',
      response: aiResponse,
      model: 'gemini-2.0-flash',
    });
  } catch (logErr) {
    console.error('Falha ao salvar log da IA:', logErr);
    // Não interrompe o fluxo se o log falhar
  }

  return json({ response: aiResponse });
});

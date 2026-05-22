// =====================================================================
// FULL RITUAL · Edge Function `analyze-body-progress`
// Roda quando o usuário registra peso/%gordura SEM foto.
// Compara medida atual vs objetivo + saúde geral (sono, check-ins, treino)
// e devolve análise estruturada. Salva em body_metrics.ai_analysis.
//
// Body:
//   { metric_id: uuid }   // medida já gravada no body_metrics
// =====================================================================

// @ts-expect-error Deno import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// @ts-expect-error Deno global
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
// @ts-expect-error
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// @ts-expect-error
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// @ts-expect-error Deno.serve
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    if (!GEMINI_API_KEY) return json({ error: 'GEMINI_API_KEY não configurada.' }, 500);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'sem token' }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'usuário inválido' }, 401);

    const { metric_id } = await req.json();
    if (!metric_id) return json({ error: 'metric_id ausente' }, 400);

    const sinceIso = new Date(Date.now() - 21 * 86400000).toISOString().slice(0, 10);

    const [metricRes, profileRes, historyRes, sleepRes, checkinsRes, loadsRes] = await Promise.all([
      supabase.from('body_metrics').select('*').eq('id', metric_id).eq('user_id', user.id).single(),
      supabase.from('profiles').select('name,target_weight_kg,target_weight_kg_max,target_body_fat_pct,target_date,sport_modalities').eq('id', user.id).single(),
      supabase.from('body_metrics').select('date,weight_kg,body_fat_pct').eq('user_id', user.id).neq('id', metric_id).order('date', { ascending: false }).limit(10),
      supabase.from('sleep_logs').select('date,duration_min,quality').gte('date', sinceIso).order('date', { ascending: false }).limit(21),
      supabase.from('checkins').select('date,energy,calm,body_state,signals').gte('date', sinceIso).order('date', { ascending: false }).limit(21),
      supabase.from('workout_loads').select('date,exercise_name,load_kg,rpe').eq('user_id', user.id).gte('date', sinceIso).order('date', { ascending: false }).limit(20),
    ]);

    const metric = metricRes.data;
    if (!metric) return json({ error: 'medida não encontrada' }, 404);
    const profile = profileRes.data ?? {};

    const histLines = (historyRes.data ?? []).map((h: any) =>
      `- ${h.date}: ${h.weight_kg ?? '?'}kg, %gord ${h.body_fat_pct ?? '?'}`).join('\n');

    // ritmo observado (kg/semana) últimos 30d
    const recent = [...(historyRes.data ?? []), metric].filter((m: any) => m.weight_kg != null)
      .filter((m: any) => (Date.now() - new Date(m.date).getTime()) / 86400000 <= 30)
      .sort((a: any, b: any) => a.date.localeCompare(b.date));
    let observedPaceWk: number | null = null;
    if (recent.length >= 2) {
      const f = recent[0], l = recent[recent.length - 1];
      const dt = (new Date(l.date).getTime() - new Date(f.date).getTime()) / 86400000;
      if (dt > 0) observedPaceWk = ((Number(l.weight_kg) - Number(f.weight_kg)) / dt) * 7;
    }
    let requiredPaceWk: number | null = null;
    if (profile.target_weight_kg && profile.target_date && metric.weight_kg) {
      const days = (new Date(profile.target_date).getTime() - Date.now()) / 86400000;
      if (days > 0) requiredPaceWk = ((profile.target_weight_kg - Number(metric.weight_kg)) / days) * 7;
    }

    const circ: string[] = [];
    if (metric.waist_cm) circ.push(`cintura ${metric.waist_cm}cm`);
    if (metric.hip_cm) circ.push(`quadril ${metric.hip_cm}cm`);
    if (metric.chest_cm) circ.push(`peito ${metric.chest_cm}cm`);
    if (metric.arm_cm) circ.push(`braço ${metric.arm_cm}cm`);
    if (metric.thigh_cm) circ.push(`coxa ${metric.thigh_cm}cm`);
    if (metric.neck_cm) circ.push(`pescoço ${metric.neck_cm}cm`);
    const whr = (metric.waist_cm && metric.hip_cm) ? (Number(metric.waist_cm) / Number(metric.hip_cm)).toFixed(2) : null;

    const avg = (arr: number[]) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : '-';
    const sleeps = (sleepRes.data ?? []).map((s: any) => Number(s.duration_min)).filter(Number.isFinite);
    const checkins = checkinsRes.data ?? [];

    const contextText =
      `Nova medida registrada:\n` +
      `- data: ${metric.date}\n` +
      `- peso: ${metric.weight_kg ?? '?'} kg\n` +
      `- altura: ${metric.height_cm ?? '?'} cm\n` +
      `- %gordura: ${metric.body_fat_pct ?? 'não informado'}\n\n` +
      (circ.length ? `- circunferências: ${circ.join(', ')}\n` : '') +
      (whr ? `- cintura/quadril: ${whr}\n` : '') +
      `\nObjetivo:\n` +
      `- peso alvo: ${profile.target_weight_kg ?? 'não definido'} kg` +
      (profile.target_weight_kg_max ? ` (faixa até ${profile.target_weight_kg_max} kg)` : '') + `\n` +
      `- %gordura alvo: ${profile.target_body_fat_pct ?? 'não definido'}\n` +
      `- prazo: ${profile.target_date ?? 'sem prazo'}\n` +
      `- ritmo observado: ${observedPaceWk != null ? observedPaceWk.toFixed(2) + ' kg/sem' : '-'}\n` +
      `- ritmo necessário pro prazo: ${requiredPaceWk != null ? requiredPaceWk.toFixed(2) + ' kg/sem' : '-'}\n\n` +
      `Histórico recente:\n${histLines || '(sem registros anteriores)'}\n\n` +
      `Saúde geral (últimos 21 dias):\n` +
      `- sono médio: ${avg(sleeps)} min/noite\n` +
      `- energia média: ${avg(checkins.map((c: any) => Number(c.energy)))}\n` +
      `- calma média: ${avg(checkins.map((c: any) => Number(c.calm)))}\n` +
      `- estado corporal médio: ${avg(checkins.map((c: any) => Number(c.body_state)))}\n` +
      `- sessões de força registradas: ${(loadsRes.data ?? []).length}\n` +
      `- esportes: ${(profile.sport_modalities ?? []).join(', ') || '-'}\n`;

    const systemPrompt =
      `Você é a IA do Full Ritual analisando o progresso corporal de ${profile.name ?? 'a pessoa'}.\n` +
      `Devolva APENAS um JSON válido neste schema exato:\n` +
      `{\n` +
      `  "fat_distribution": [],\n` +
      `  "trend": "emagrecendo" | "estavel" | "ganhando" | "indeterminado",\n` +
      `  "observations": string[],     // 2-4 frases: como o peso/composição atual se relaciona com o objetivo, considerando sono/energia/treino. Voz cuidadosa, terrosa. Sem julgamento.\n` +
      `  "suggestions_training": string[], // 1-3 ajustes\n` +
      `  "suggestions_diet": string[]     // 1-3 ajustes\n` +
      `}\n` +
      `Regras:\n` +
      `- Compare a medida atual com o peso/%gordura alvo (delta, ritmo).\n` +
      `- Compare ritmo observado x ritmo necessário pro prazo. Avise se o ritmo necessário > 0.7 kg/sem (agressivo demais) ou se observado vai contra o objetivo.\n` +
      `- Se há circunferências, comente cintura/quadril (saúde metabólica) quando relevante.\n` +
      `- Se sono ruim ou energia baixa, priorize recuperação antes de déficit calórico mais agressivo.\n` +
      `- Se tendência conflita com o objetivo, aponte com cuidado e proponha ajuste.\n` +
      `- Se não há objetivo definido, mencione brevemente que vale definir, mas siga com a análise da tendência.\n` +
      `- Português do Brasil. Nunca diagnostique.\n` +
      `- SOMENTE JSON, sem markdown.`;

    const geminiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: contextText }] }],
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 1200,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    }).finally(() => clearTimeout(timeout));

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini error:', errText);
      return json({ error: 'falha ao analisar progresso' }, 502);
    }

    const data = await geminiRes.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? '').join('').trim() ?? '';
    let analysis: any = null;
    try { analysis = JSON.parse(rawText); }
    catch {
      const m = rawText.match(/\{[\s\S]*\}/);
      analysis = m ? JSON.parse(m[0]) : null;
    }
    if (!analysis) return json({ error: 'IA não devolveu JSON', raw: rawText }, 502);

    await supabase.from('body_metrics').update({ ai_analysis: analysis }).eq('id', metric_id);

    return json({ analysis }, 200);
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      return json({ error: 'tempo esgotado' }, 504);
    }
    console.error(err);
    return json({ error: 'erro interno' }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// =====================================================================
// FULL RITUAL · Edge Function `body-coach`
// IA-treinadora dedicada à dimensão Corpo. Carrega as regras técnicas
// de triatlo (TRAINING_COACH_RULES), histórico de conversa, perfil de
// treino, último plano, cargas recentes de musculação e avaliações de
// arquivos .FIT. Pode também propor adições à dieta (diet_ai_additions).
// =====================================================================

// @ts-expect-error Deno runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { TRAINING_COACH_RULES, COACH_VOICE_RULES } from '../_shared/training-rules.ts';

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

interface ReqBody {
  message: string;
}

// @ts-expect-error Deno.serve
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    if (!GEMINI_API_KEY) return json({ error: 'GEMINI_API_KEY não configurada.' }, 500);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'sem token de autenticação' }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'usuário inválido' }, 401);

    const { message } = (await req.json()) as ReqBody;
    if (!message?.trim()) return json({ error: 'mensagem ausente' }, 400);

    const today = new Date().toISOString().slice(0, 10);
    const since = new Date();
    since.setDate(since.getDate() - 28);
    const sinceIso = since.toISOString().slice(0, 10);

    const [historyRes, trainingProfileRes, activePlanRes, recentLoadsRes, recentWorkoutsRes, sleepRes, checkinsRes, bodyMetricsRes] = await Promise.all([
      supabase.from('body_coach_messages').select('role,content,created_at').eq('user_id', user.id).order('created_at', { ascending: true }).limit(60),
      supabase.from('training_profile').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('training_plans').select('*').eq('user_id', user.id).eq('is_active', true).order('week_start_date', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('workout_loads').select('*').eq('user_id', user.id).gte('date', sinceIso).order('date', { ascending: false }).limit(80),
      supabase.from('garmin_workouts').select('date,modality,parsed_data,ai_feedback').eq('user_id', user.id).gte('date', sinceIso).order('date', { ascending: false }).limit(10),
      supabase.from('sleep_logs').select('date,duration_min,quality').gte('date', sinceIso).order('date', { ascending: false }).limit(21),
      supabase.from('checkins').select('date,energy,calm,body_state,signals,note').gte('date', sinceIso).order('date', { ascending: false }).limit(21),
      supabase.from('body_metrics').select('date,weight_kg,height_cm,body_fat_pct,ai_analysis,note').eq('user_id', user.id).order('date', { ascending: false }).limit(12),
    ]);

    const history = historyRes.data ?? [];

    // Persiste a mensagem do usuário antes da chamada (para sobreviver a timeouts).
    await supabase.from('body_coach_messages').insert({
      user_id: user.id,
      role: 'user',
      content: message,
    });

    const systemPrompt = buildSystemPrompt({
      today,
      trainingProfile: trainingProfileRes.data,
      activePlan: activePlanRes.data,
      recentLoads: recentLoadsRes.data ?? [],
      recentWorkouts: recentWorkoutsRes.data ?? [],
      sleep: sleepRes.data ?? [],
      checkins: checkinsRes.data ?? [],
      bodyMetrics: bodyMetricsRes.data ?? [],
    });

    const contents = [
      ...history.map((m: any) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      { role: 'user', parts: [{ text: message }] },
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 28000);

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 2200,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      },
    ).finally(() => clearTimeout(timeout));

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini error:', errText);
      return json({ error: 'falha ao consultar a IA' }, 502);
    }

    const geminiData = await geminiRes.json();
    const candidate = geminiData?.candidates?.[0];
    const rawReply = extractText(candidate) || 'Sem resposta no momento.';
    const { visibleText, dietAdds } = extractDietAdditions(rawReply);

    // Persiste resposta da IA
    await supabase.from('body_coach_messages').insert({
      user_id: user.id,
      role: 'assistant',
      content: visibleText,
      metadata: dietAdds.length ? { diet_additions: dietAdds } : null,
    });

    // Materializa adições de dieta
    if (dietAdds.length) {
      const rows = dietAdds.map((d) => ({
        user_id: user.id,
        date: d.date || today,
        meal_type: d.meal_type ?? null,
        title: d.title,
        note: d.note ?? null,
        source: 'body_coach',
        rationale: d.rationale ?? null,
      }));
      await supabase.from('diet_ai_additions').insert(rows);
    }

    return json({ reply: visibleText, diet_additions: dietAdds }, 200);
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      return json({ error: 'tempo esgotado ao consultar a IA' }, 504);
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

function extractText(candidate: any): string {
  const parts = candidate?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .map((part: any) => typeof part?.text === 'string' ? part.text : '')
    .filter(Boolean)
    .join('\n')
    .trim();
}

// A IA pode anexar adições à dieta usando um bloco JSON com fence ```diet_additions
// Exemplo:
// ```diet_additions
// [{"meal_type":"lanche","title":"40g whey + banana","note":"pós-força","rationale":"síntese proteica"}]
// ```
function extractDietAdditions(text: string): { visibleText: string; dietAdds: any[] } {
  const re = /```diet_additions\s*([\s\S]*?)```/i;
  const match = text.match(re);
  if (!match) return { visibleText: text, dietAdds: [] };
  let parsed: any[] = [];
  try {
    const raw = JSON.parse(match[1].trim());
    if (Array.isArray(raw)) parsed = raw;
  } catch {
    parsed = [];
  }
  const cleaned = text.replace(re, '').trim();
  return { visibleText: cleaned, dietAdds: parsed };
}

function buildSystemPrompt(ctx: {
  today: string;
  trainingProfile: any;
  activePlan: any;
  recentLoads: any[];
  recentWorkouts: any[];
  sleep: any[];
  checkins: any[];
  bodyMetrics: any[];
}): string {
  const loadsByExercise: Record<string, any[]> = {};
  for (const l of ctx.recentLoads) {
    (loadsByExercise[l.exercise_key] ||= []).push({
      date: l.date, load_kg: l.load_kg, sets: l.sets, reps: l.reps, rpe: l.rpe,
    });
  }
  const recentLoadsSummary = Object.entries(loadsByExercise).slice(0, 20).map(([k, arr]) => {
    const last = arr[0];
    return `- ${k}: última ${last.load_kg}kg ${last.sets ?? ''}x${last.reps ?? ''} RPE ${last.rpe ?? '-'} (${last.date})`;
  }).join('\n');

  const avg = (arr: number[]) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : '-';
  const sleepSummary = ctx.sleep.length
    ? `sono médio últimos dias: ${avg(ctx.sleep.map((s) => Number(s.duration_min)).filter(Number.isFinite)) }min, qualidade média ${avg(ctx.sleep.map((s) => Number(s.quality)).filter(Number.isFinite))}`
    : 'sem registros de sono';

  const checkinsSummary = ctx.checkins.length
    ? `energia média ${avg(ctx.checkins.map((c) => Number(c.energy)))}, calma ${avg(ctx.checkins.map((c) => Number(c.calm)))}, estado corporal ${avg(ctx.checkins.map((c) => Number(c.body_state)))}`
    : 'sem check-ins recentes';

  return `${TRAINING_COACH_RULES}

${COACH_VOICE_RULES}

# CONTEXTO ATUAL (data de hoje: ${ctx.today})

## Perfil de treino
${JSON.stringify(ctx.trainingProfile ?? null, null, 2)}

## Plano ativo (semana em curso)
${JSON.stringify(ctx.activePlan?.plan_json ?? null, null, 2)}

## Cargas recentes de musculação (use para progressão)
${recentLoadsSummary || '(sem registros)'}

## Treinos importados (.FIT) recentes
${JSON.stringify(ctx.recentWorkouts.slice(0, 5), null, 2)}

## Recuperação e bem-estar
- ${sleepSummary}
- ${checkinsSummary}

## Medidas corporais recentes (peso/altura/%gordura + análise da IA por foto)
${ctx.bodyMetrics.length ? ctx.bodyMetrics.slice(0, 6).map((m: any) => {
  const a = m.ai_analysis ?? {};
  return `- ${m.date}: ${m.weight_kg ?? '?'}kg, %gord ${m.body_fat_pct ?? '?'}` +
    (a.trend ? ` · tendência ${a.trend}` : '') +
    (a.fat_distribution?.length ? ` · gordura em ${a.fat_distribution.join(', ')}` : '');
}).join('\n') : '(sem registros)'}
Use peso/%gordura/tendência/distribuição de gordura para personalizar volume, intensidade e foco do treino.

# FORMATO DE RESPOSTA

Você está conversando com a atleta dentro do app Full Ritual. Responda em markdown leve (negrito quando for chamar atenção, listas para prescrições). Inclua sempre racional técnico quando propor mudança.

Quando a sua resposta envolver impacto na DIETA (alimentação extra, ajuste pós-treino, hidratação adicional, CHO pré-longão, proteína pós-força), anexe no FINAL da resposta um bloco assim, literalmente:

\`\`\`diet_additions
[
  {"date":"YYYY-MM-DD","meal_type":"manha|almoco|lanche|jantar|ceia","title":"texto curto","note":"opcional","rationale":"motivo técnico"}
]
\`\`\`

Esse bloco será capturado pelo app e exibido em roxo na tela de dieta, marcado como sugestão da IA. Não use esse bloco se a resposta não pedir mudança real na dieta. Não inclua mais nada depois do bloco.`;
}

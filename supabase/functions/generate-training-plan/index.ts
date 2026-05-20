// =====================================================================
// FULL RITUAL · Edge Function `generate-training-plan`
// Gera plano semanal real com Gemini, salva em training_plans e retorna
// o JSON pronto para a tela Corpo.
// =====================================================================

// @ts-expect-error Deno runtime
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

type GeneratedFrom = 'onboarding' | 'feedback' | 'manual';

interface ReqBody {
  week_start_date?: string;
  assignments?: Record<string, string[]>;
  generated_from?: GeneratedFrom;
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

    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const weekStart = body.week_start_date ?? isoMondayOf(new Date());
    const generatedFrom = body.generated_from ?? 'manual';

    const since = new Date();
    since.setDate(since.getDate() - 21);
    const sinceIso = since.toISOString().slice(0, 10);

    const [profileRes, trainingProfileRes, previousPlansRes, workoutsRes, sleepRes, checkinsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('training_profile').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('training_plans').select('*').eq('user_id', user.id).order('generated_at', { ascending: false }).limit(2),
      supabase.from('garmin_workouts').select('*').eq('user_id', user.id).gte('date', sinceIso).order('date', { ascending: false }).limit(10),
      supabase.from('sleep_logs').select('*').gte('date', sinceIso).order('date', { ascending: false }).limit(21),
      supabase.from('checkins').select('*').gte('date', sinceIso).order('date', { ascending: false }).limit(21),
    ]);

    if (trainingProfileRes.error) return json({ error: trainingProfileRes.error.message }, 500);
    const trainingProfile = trainingProfileRes.data;
    if (!trainingProfile) return json({ error: 'perfil de treino não encontrado' }, 404);

    const prompt = buildPrompt({
      weekStart,
      profile: profileRes.data,
      trainingProfile,
      assignments: body.assignments,
      previousPlans: previousPlansRes.data ?? [],
      workouts: workoutsRes.data ?? [],
      sleep: sleepRes.data ?? [],
      checkins: checkinsRes.data ?? [],
    });

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt() }],
          },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.55,
            maxOutputTokens: 6500,
            responseMimeType: 'application/json',
          },
        }),
      },
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini error:', errText);
      return json({ error: 'falha ao gerar plano com IA' }, 502);
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const parsed = parseJson(rawText);
    const planJson = sanitizePlan(parsed?.plan_json ?? parsed, weekStart, trainingProfile);

    await supabase
      .from('training_plans')
      .update({ is_active: false })
      .eq('user_id', user.id)
      .eq('is_active', true);

    const { data: plan, error: insertError } = await supabase
      .from('training_plans')
      .insert({
        user_id: user.id,
        week_start_date: weekStart,
        plan_json: planJson,
        generated_from: generatedFrom,
        is_active: true,
      })
      .select()
      .single();

    if (insertError) return json({ error: insertError.message }, 500);

    return json({ plan, plan_json: planJson }, 200);
  } catch (err) {
    console.error(err);
    return json({ error: 'erro interno' }, 500);
  }
});

function systemPrompt() {
  return `Você é um treinador do Full Ritual. Gere planos de treino seguros, específicos e consultáveis no mobile.

Regras duras:
- Responda somente JSON válido.
- O plano deve ter exatamente 7 dias, começando na segunda-feira informada.
- Cada dia deve seguir o schema solicitado.
- Dias com mais de uma modalidade devem separar os blocos por modalidadeGroup.
- Nunca misture pedal e musculação dentro do mesmo bloco.
- Cada modalidade deve ter no máximo 3 blocos principais: aquecimento, série/treino, desaquecimento.
- O conteúdo de cada bloco deve ser claro para consulta durante o treino, com linhas separadas por \\n.
- Musculação: cada linha da série deve começar pelo nome do exercício, depois prescrição. Exemplo: "Agachamento livre — 4×8 · RPE 7 · desc 2min". Não quebre RPE/descanso em linhas separadas.
- Pedal: sempre assuma speed no rolo/smart trainer. Use potência, cadência e RPE; explique a execução como treinador para atleta, com linguagem técnica porém acessível.
- Pedal no rolo: não use velocidade como métrica principal. Priorize watts, zonas, cadência, estabilidade de quadril, tronco quieto e recuperação entre blocos.
- Pedal no rolo: se precisar explicar contexto, coloque em linha separada como "Leitura do rolo — ...". Não coloque frases longas dentro de chips/prescrições.
- Se houver limitação, reduza intensidade e explique no notes.
- Use FTP do pedal quando existir. Use pace da corrida quando existir.
- Não invente lesões, exames, diagnósticos ou métricas que não foram fornecidas.`;
}

function buildPrompt(input: {
  weekStart: string;
  profile: unknown;
  trainingProfile: any;
  assignments?: Record<string, string[]>;
  previousPlans: unknown[];
  workouts: unknown[];
  sleep: unknown[];
  checkins: unknown[];
}) {
  const schema = {
    plan_json: [
      {
        day_index: 0,
        date: input.weekStart,
        modality: 'musculacao | corrida | pedal | lpo | rest',
        modalities: ['musculacao'],
        title: 'string curto',
        details: 'string fallback',
        duration_min: 60,
        intensity: 'easy | moderate | hard | max',
        notes: 'string opcional',
        blocks: [
          {
            id: '0-warmup',
            icon: '◇',
            title: 'aquecimento',
            duration: '10 min',
            content: 'linha 1\\nlinha 2',
            modalityGroup: 'musculação',
          },
        ],
      },
    ],
  };

  return JSON.stringify({
    task: 'Gerar plano semanal de treino personalizado.',
    week_start_date: input.weekStart,
    required_schema: schema,
    user_profile: input.profile,
    training_profile: input.trainingProfile,
    day_assignments: input.assignments,
    recent_training_plans: input.previousPlans,
    recent_uploaded_workouts: input.workouts,
    recent_sleep_logs: input.sleep,
    recent_checkins: input.checkins,
  });
}

function parseJson(text: string): any {
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

function sanitizePlan(raw: any, weekStart: string, profile: any) {
  if (!Array.isArray(raw)) throw new Error('Plano inválido: plan_json não é array.');
  if (raw.length !== 7) throw new Error('Plano inválido: precisa ter 7 dias.');

  const start = new Date(`${weekStart}T00:00:00`);
  return raw.map((day, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const blocks = Array.isArray(day.blocks) ? day.blocks : [];
    const modalities = normalizeModalities(day.modalities, day.modality);
    const safeBlocks = blocks.map((block: any, blockIndex: number) => ({
      id: String(block.id ?? `${index}-${blockIndex}`),
      icon: String(block.icon ?? (blockIndex === 0 ? '◇' : blockIndex === blocks.length - 1 ? '○' : '◆')),
      title: String(block.title ?? 'treino'),
      duration: block.duration ? String(block.duration) : undefined,
      content: String(block.content ?? ''),
      modalityGroup: block.modalityGroup ? String(block.modalityGroup) : undefined,
    })).filter((block: any) => block.content.trim().length > 0);

    return {
      day_index: index,
      date: date.toISOString().slice(0, 10),
      modality: modalities[0] ?? 'rest',
      modalities,
      title: String(day.title ?? (modalities[0] === 'rest' ? 'descanso ativo' : 'treino')),
      details: String(day.details ?? safeBlocks.map((block: any) => `${block.title.toUpperCase()}\n${block.content}`).join('\n\n')),
      blocks: safeBlocks,
      duration_min: Number.isFinite(Number(day.duration_min)) ? Number(day.duration_min) : Number(profile.session_minutes ?? 60),
      intensity: normalizeIntensity(day.intensity),
      notes: day.notes ? String(day.notes) : undefined,
    };
  });
}

function normalizeModalities(value: unknown, fallback: unknown) {
  const allowed = new Set(['corrida', 'pedal', 'musculacao', 'lpo', 'rest']);
  const source = Array.isArray(value) ? value : [fallback ?? 'rest'];
  const normalized = source.map((item) => String(item)).filter((item) => allowed.has(item));
  return normalized.length ? normalized : ['rest'];
}

function normalizeIntensity(value: unknown) {
  const intensity = String(value ?? 'moderate');
  return ['easy', 'moderate', 'hard', 'max'].includes(intensity) ? intensity : 'moderate';
}

function isoMondayOf(date: Date): string {
  const copy = new Date(date);
  const dow = copy.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  copy.setDate(copy.getDate() + diff);
  return copy.toISOString().slice(0, 10);
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

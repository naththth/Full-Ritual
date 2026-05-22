// =====================================================================
// FULL RITUAL · Edge Function `gemini-chat`
// Deno runtime no Supabase. A chave do Gemini nunca sai daqui.
//
// Como invocar do front:
//   await supabase.functions.invoke('gemini-chat', {
//     body: { message, context }
//   });
//
// Como configurar a chave:
//   supabase secrets set GEMINI_API_KEY=sua_chave
// =====================================================================

// @ts-expect-error Deno specific import (resolvido em runtime do Supabase)
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

interface ReqBody {
  message: string;
  context?: string | {
    recent_summary?: string;
    focus_dimension?: string;
  };
  saveInsight?: boolean;
}

// @ts-expect-error Deno.serve
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    if (!GEMINI_API_KEY) {
      return json({ error: 'GEMINI_API_KEY não configurada.' }, 500);
    }

    // 1. Autenticação · JWT do usuário vem no header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'sem token de autenticação' }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'usuário inválido' }, 401);

    // 2. Body
    const { message, context: rawContext = {}, saveInsight = false } = (await req.json()) as ReqBody;
    if (!message) return json({ error: 'mensagem ausente' }, 400);
    const context = normalizeContext(rawContext);

    // 3. Busca contexto recente do usuário (com RLS, vê só o dele)
    const today = new Date().toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);

    const [profileRes, checkinsRes, sleepRes, insightsRes, bodyMetricsRes, dietPlanRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('checkins').select('*').gte('date', sevenDaysAgo).order('date', { ascending: false }),
      supabase.from('sleep_logs').select('*').gte('date', sevenDaysAgo).order('date', { ascending: false }),
      supabase.from('insights').select('title, body, date').order('date', { ascending: false }).limit(3),
      supabase.from('body_metrics').select('date,weight_kg,height_cm,body_fat_pct,ai_analysis').eq('user_id', user.id).order('date', { ascending: false }).limit(8),
      supabase.from('diet_plans').select('manual_foods,pdf_name,notes,setup_mode,nutri_profile,nutri_configured').eq('user_id', user.id).maybeSingle(),
    ]);

    const profile = profileRes.data;
    const summary = buildContextSummary({
      profile,
      checkins: checkinsRes.data ?? [],
      sleep: sleepRes.data ?? [],
      insights: insightsRes.data ?? [],
      bodyMetrics: bodyMetricsRes.data ?? [],
      dietPlan: dietPlanRes.data,
      extra: context.recent_summary,
    });

    // 4. Monta prompt para o Gemini
    const systemPrompt = buildSystemPrompt(summary, context.focus_dimension);

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
        contents: [{ role: 'user', parts: [{ text: message }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1400,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    }).finally(() => clearTimeout(timeout));

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini error:', errText);
      return json({ error: 'falha ao consultar a IA' }, 502);
    }

    const geminiData = await geminiRes.json();
    const candidate = geminiData?.candidates?.[0];
    const finishReason = candidate?.finishReason;
    const reply = extractText(candidate) || 'Sem resposta no momento.';

    if (finishReason === 'MAX_TOKENS') {
      console.warn('Gemini chat response reached max output tokens.');
    }

    // 5. Salva a interação para histórico (opt-in via profile.ai_enabled)
    if (profile?.ai_enabled) {
      await supabase.from('ai_conversations').upsert({
        user_id: user.id,
        messages: [
          { role: 'user', content: message, at: new Date().toISOString() },
          { role: 'assistant', content: reply, at: new Date().toISOString() },
        ],
        context_summary: summary.slice(0, 1000),
      });
    }

    let savedInsight = null;
    if (saveInsight) {
      const title = 'Insight da semana';
      const insightBody = personalizeInsightBody(reply, profile?.name);
      const { data: insertedInsight, error: insightError } = await supabase
        .from('insights')
        .insert({
          user_id: user.id,
          date: today,
          type: 'weekly',
          title,
          body: insightBody,
          correlations: null,
          source: 'gemini',
        })
        .select('*')
        .single();

      if (insightError) {
        console.warn('Insight save error:', insightError);
      } else {
        savedInsight = insertedInsight;
      }
    }

    return json({ reply, insight: savedInsight }, 200);
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
    .map((part) => typeof part?.text === 'string' ? part.text : '')
    .filter(Boolean)
    .join('\n')
    .trim();
}

function normalizeContext(context: ReqBody['context']): { recent_summary?: string; focus_dimension?: string } {
  if (typeof context === 'string') return { recent_summary: context };
  return context ?? {};
}

function personalizeInsightBody(text: string, profileName?: string | null): string {
  const name = profileName?.trim();
  if (!name) return text;

  return text.split(name).join('{{profile_name}}');
}

function buildContextSummary({ profile, checkins, sleep, insights, bodyMetrics, dietPlan, extra }: {
  profile: any; checkins: any[]; sleep: any[]; insights: any[]; bodyMetrics: any[]; dietPlan?: any; extra?: string;
}): string {
  const parts: string[] = [];

  if (profile) {
    parts.push(
      `Pessoa: ${profile.name}. ` +
      (profile.skin_type ? `Pele ${profile.skin_type}. ` : '') +
      (profile.sport_modalities?.length ? `Esportes: ${profile.sport_modalities.join(', ')}. ` : '') +
      (profile.spirit_themes?.length ? `Temas espirituais: ${profile.spirit_themes.join(', ')}. ` : '')
    );
  }

  if (checkins.length) {
    const avgEnergy = avg(checkins.map((c) => c.energy));
    const avgCalm = avg(checkins.map((c) => c.calm));
    const avgSkin = avg(checkins.map((c) => c.skin_state));
    parts.push(
      `Últimos 7 dias (check-ins): energia média ${avgEnergy.toFixed(1)}, ` +
      `calma média ${avgCalm.toFixed(1)}, estado da pele ${avgSkin.toFixed(1)}.`
    );
  }

  if (sleep.length) {
    const validDurations = sleep.filter((s) => s.duration_min).map((s) => s.duration_min);
    if (validDurations.length) {
      const avgSleep = avg(validDurations) / 60;
      parts.push(`Sono médio: ${avgSleep.toFixed(1)}h por noite nos últimos 7 dias.`);
    }
  }

  if (insights.length) {
    parts.push(`Insights recentes: ${insights.map((i) => i.title).join(' | ')}.`);
  }

  if (bodyMetrics?.length) {
    const latest = bodyMetrics[0];
    const a = latest.ai_analysis ?? {};
    const trendLine = a.trend ? `, tendência ${a.trend}` : '';
    const fatLine = Array.isArray(a.fat_distribution) && a.fat_distribution.length
      ? `, gordura mais visível em ${a.fat_distribution.join(', ')}`
      : '';
    parts.push(
      `Medidas mais recentes (${latest.date}): peso ${latest.weight_kg ?? '?'}kg, altura ${latest.height_cm ?? '?'}cm, ` +
      `%gordura ${latest.body_fat_pct ?? 'não informado'}${trendLine}${fatLine}. ` +
      `Use isso para calibrar sugestões alimentares (déficit/superávit, proteína, retenção, hidratação).`
    );
  }

  if (dietPlan) {
    const nutri = dietPlan.nutri_profile ?? {};
    const manualFoods = Array.isArray(dietPlan.manual_foods) ? dietPlan.manual_foods : [];
    parts.push(
      `Plano/IA Nutri: modo ${dietPlan.setup_mode ?? 'não definido'}, configurado ${dietPlan.nutri_configured ? 'sim' : 'não'}. ` +
      (dietPlan.notes ? `Notas da dieta: ${dietPlan.notes}. ` : '') +
      (dietPlan.pdf_name ? `PDF enviado: ${dietPlan.pdf_name}. ` : '') +
      (manualFoods.length ? `Alimentos manuais: ${manualFoods.map((f: any) => [f.title, f.amount, f.notes].filter(Boolean).join(' ')).join('; ')}. ` : '') +
      (Object.keys(nutri).length ? `Perfil nutricional: ${JSON.stringify(nutri)}.` : '')
    );
  }

  if (extra) parts.push(extra);

  return parts.join(' ');
}

function buildSystemPrompt(summary: string, focusDimension?: string): string {
  if (focusDimension === 'diet') return buildDietSystemPrompt(summary);

  return `Você é a IA do Full Ritual, um app de saúde integrada que conecta cinco dimensões:
pele, corpo, mente, dieta e espírito.

VOZ: calma, presente, terrosa, ritualística. Como uma terapeuta corporal escrevendo uma carta.
Nunca como um app de produtividade. Português do Brasil. Voz feminina implícita, sem formalismo.

NUNCA USE: streak, meta, perdeu, atrasado, performance, "level up", emojis, exclamações.
USE: cuidar, voltar para si, ritmo, barreira, constância, presença, ritual.

REGRAS:
- Resposta curta (2-4 parágrafos no máximo).
- Nunca diagnostique. Observe padrões, sugira ajustes, proponha pausas.
- Se notar sinais de exaustão, ofereça pausa antes de mais ação.
- Conecte dimensões quando relevante (ex: sono afeta pele, calma afeta dieta).
- Use métricas em mono apenas quando ajudar; prefira linguagem do cuidado.

CONTEXTO ATUAL DA PESSOA:
${summary}
${focusDimension ? `\nDIMENSÃO EM FOCO: ${focusDimension}` : ''}`;
}

function buildDietSystemPrompt(summary: string): string {
  return `Você é o IA Nutri do Full Ritual: uma IA-nutricionista técnica que orienta saúde geral, performance esportiva, longevidade, composição corporal sustentável e energia no dia a dia com base em ciência da nutrição e evidência consolidada.

PAPEL:
- Você não é contador de calorias, coach de dieta da moda nem chatbot motivacional.
- Construa, ajuste e justifique estratégias alimentares. Toda recomendação precisa de racional.
- Antes de orientação relevante, confirme o perfil quando faltar dado essencial: objetivo real, atividade física, saúde, medicamentos/exames, gestação/amamentação/ciclo quando relevante, rotina alimentar praticável, orçamento, habilidade na cozinha, restrições, preferências e histórico de dietas.

PRINCÍPIOS NÃO NEGOCIÁVEIS:
- Use evidência consolidada: consensos ISSN, ACSM/Academy of Nutrition and Dietetics, COI/RED-S, meta-análises de proteína, periodização nutricional esportiva e padrões alimentares de longevidade como base mediterrânea, fibra, densidade de nutrientes e baixa dependência de ultraprocessados.
- Diferencie consenso, provável, incerto e pseudociência quando isso importar.
- Alimentação suficiente vem antes de restrição. Déficit, quando indicado, deve ser moderado, sustentável e individualizado. Proteja disponibilidade energética em alto volume de treino e sinalize risco de RED-S.
- Proteína adequada e distribuída ao longo do dia: referência geral de 1,2 a 1,6 g/kg/dia para população ativa e até 2,2 g/kg/dia para atletas ou déficit, ajustando ao caso.
- Carboidrato e gordura não são vilões. Ajuste carboidrato à demanda, especialmente em perfis esportivos, e priorize qualidade, fibra e regularidade em saúde geral.
- Longevidade fica na base: micronutrientes, fibra, gorduras de boa qualidade, variedade e baixa dependência de ultraprocessados.
- Indivíduo antes do protocolo. Adapte para mulheres, idosos, adolescentes, vegetarianos/veganos, condições clínicas e públicos específicos. Encaminhe quando sair do escopo.

SUPLEMENTAÇÃO:
- Recomende suplemento só por evidência e necessidade, nunca por marketing.
- Para esporte: cafeína, creatina, beta-alanina, nitrato e bicarbonato apenas com dose, timing e contexto.
- Reposição só quando indicada por demanda ou exame: ferro, vitamina D, ômega-3, B12 especialmente em vegetarianos/veganos.
- Para endurance, considere carboidrato e sódio intra-treino quando houver volume/contexto.
- Suplemento nunca substitui comida real.

EVITE SEMPRE:
- Detox, jejum como dogma, low-carb/cetogênica imposta, eliminação sem razão clínica, alcalinização, monodieta, chá milagroso, moralização alimentar, promessas rápidas, déficit agressivo, contagem obsessiva e prescrição de treino.
- Se o pedido sugerir restrição excessiva, padrão disfuncional ou relação prejudicial com comida, não execute. Nomeie o risco e ofereça alternativa coerente.

SINAIS DE ALERTA:
Encaminhe objetivamente quando houver sinais de transtorno alimentar, RED-S, fadiga persistente com alto volume de treino, alteração de ciclo menstrual, fraturas por estresse, diabetes, doença renal, distúrbios gastrointestinais importantes, exames alterados, gestação/amamentação que demande plano individualizado ou qualquer caso que peça médico/nutricionista presencial.

TOM:
Português natural e maduro. Direto, técnico e claro. Sem moralismo, terrorismo nutricional, infantilização, buzzwords ou chavões de dieta. Responda na profundidade do usuário.

CONTEXTO ATUAL DA PESSOA:
${summary}`;
}

function avg(arr: number[]): number {
  const valid = arr.filter((n) => typeof n === 'number');
  if (!valid.length) return 0;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

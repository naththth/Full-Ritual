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
  context?: {
    recent_summary?: string;
    focus_dimension?: string;
  };
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
    const { message, context = {} } = (await req.json()) as ReqBody;
    if (!message) return json({ error: 'mensagem ausente' }, 400);

    // 3. Busca contexto recente do usuário (com RLS, vê só o dele)
    const today = new Date().toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);

    const [profileRes, checkinsRes, sleepRes, insightsRes, bodyMetricsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('checkins').select('*').gte('date', sevenDaysAgo).order('date', { ascending: false }),
      supabase.from('sleep_logs').select('*').gte('date', sevenDaysAgo).order('date', { ascending: false }),
      supabase.from('insights').select('title, body, date').order('date', { ascending: false }).limit(3),
      supabase.from('body_metrics').select('date,weight_kg,height_cm,body_fat_pct,ai_analysis').eq('user_id', user.id).order('date', { ascending: false }).limit(8),
    ]);

    const profile = profileRes.data;
    const summary = buildContextSummary({
      profile,
      checkins: checkinsRes.data ?? [],
      sleep: sleepRes.data ?? [],
      insights: insightsRes.data ?? [],
      bodyMetrics: bodyMetricsRes.data ?? [],
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

    return json({ reply }, 200);
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

function buildContextSummary({ profile, checkins, sleep, insights, bodyMetrics, extra }: {
  profile: any; checkins: any[]; sleep: any[]; insights: any[]; bodyMetrics: any[]; extra?: string;
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

  if (extra) parts.push(extra);

  return parts.join(' ');
}

function buildSystemPrompt(summary: string, focusDimension?: string): string {
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

function avg(arr: number[]): number {
  const valid = arr.filter((n) => typeof n === 'number');
  if (!valid.length) return 0;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

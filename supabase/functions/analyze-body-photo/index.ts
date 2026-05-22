// =====================================================================
// FULL RITUAL · Edge Function `analyze-body-photo`
// Recebe foto (base64) + métricas atuais. NÃO persiste a imagem.
// Usa Gemini Vision e devolve análise estruturada (distribuição de
// gordura, tendência, observações, sugestões treino/dieta).
//
// Body esperado:
//   { image_base64: string, mime_type: string,
//     weight_kg?: number, height_cm?: number, body_fat_pct?: number,
//     history?: Array<{ date, weight_kg?, body_fat_pct? }>,
//     date?: string }
//
// Retorna: { analysis: {...}, metric_id: uuid }
// =====================================================================

// @ts-expect-error Deno specific import
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
  image_base64: string;
  mime_type: string;
  weight_kg?: number;
  height_cm?: number;
  body_fat_pct?: number;
  waist_cm?: number;
  hip_cm?: number;
  chest_cm?: number;
  arm_cm?: number;
  thigh_cm?: number;
  neck_cm?: number;
  history?: Array<{ date: string; weight_kg?: number; body_fat_pct?: number }>;
  date?: string;
  note?: string;
  previous_analysis?: any;
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

    const body = (await req.json()) as ReqBody;
    if (!body.image_base64) return json({ error: 'imagem ausente' }, 400);
    const heightCm = normalizeHeightCm(body.height_cm ?? null);

    const histLines = (body.history ?? []).slice(0, 10)
      .map((h) => `- ${h.date}: peso ${h.weight_kg ?? '?'}kg, %gord ${h.body_fat_pct ?? '?'}`)
      .join('\n');

    const circ: string[] = [];
    if (body.waist_cm) circ.push(`cintura ${body.waist_cm}cm`);
    if (body.hip_cm) circ.push(`quadril ${body.hip_cm}cm`);
    if (body.chest_cm) circ.push(`peito ${body.chest_cm}cm`);
    if (body.arm_cm) circ.push(`braço ${body.arm_cm}cm`);
    if (body.thigh_cm) circ.push(`coxa ${body.thigh_cm}cm`);
    if (body.neck_cm) circ.push(`pescoço ${body.neck_cm}cm`);

    const contextText =
      `Pessoa registrando medida corporal.\n` +
      `Atual: peso ${body.weight_kg ?? '?'}kg, altura ${heightCm ?? '?'}cm, ` +
      `%gordura ${body.body_fat_pct ?? 'não informado'}.\n` +
      (circ.length ? `Circunferências: ${circ.join(', ')}.\n` : '') +
      (histLines ? `Histórico recente:\n${histLines}\n` : 'Sem histórico anterior.\n') +
      (body.previous_analysis ? `Análise anterior da IA (compare visualmente o que mudou):\n${JSON.stringify(body.previous_analysis)}\n` : '') +
      (body.note ? `Nota: ${body.note}\n` : '');

    const systemPrompt =
      `Você é a IA do Full Ritual analisando uma foto corporal enviada pela pessoa.\n` +
      `OBJETIVO: observar com cuidado e voz terrosa (nunca julgadora) e devolver APENAS um JSON válido com este schema exato:\n` +
      `{\n` +
      `  "fat_distribution": string[], // regiões onde gordura aparece mais concentrada (ex: "abdômen", "flancos", "quadril", "costas baixa", "braços", "coxas"). vazio se imperceptível\n` +
      `  "trend": "emagrecendo" | "estavel" | "ganhando" | "indeterminado",\n` +
      `  "observations": string[],     // 2-4 frases curtas sobre composição visível (postura, definição, retenção)\n` +
      `  "suggestions_training": string[], // 1-3 ajustes de treino conectados ao que se vê\n` +
      `  "suggestions_diet": string[]      // 1-3 ajustes de dieta conectados ao que se vê\n` +
      `}\n` +
      `Use português do Brasil, voz cuidadosa. Nunca diagnostique. Se a foto não permite avaliar, devolva trend "indeterminado" e observations explicando por quê.\n` +
      `Tendência: compare com o histórico recente quando houver; sem histórico, use "indeterminado".\n` +
      `Devolva SOMENTE o JSON, sem markdown, sem comentários.`;

    const geminiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{
          role: 'user',
          parts: [
            { text: contextText },
            { inlineData: { mimeType: body.mime_type || 'image/jpeg', data: body.image_base64 } },
          ],
        }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1200,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    }).finally(() => clearTimeout(timeout));

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini vision error:', errText);
      return json({ error: 'falha ao analisar a foto' }, 502);
    }

    const data = await geminiRes.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? '').join('').trim() ?? '';
    let analysis: any = null;
    try {
      analysis = JSON.parse(rawText);
    } catch {
      const m = rawText.match(/\{[\s\S]*\}/);
      analysis = m ? JSON.parse(m[0]) : null;
    }
    if (!analysis) return json({ error: 'IA não devolveu JSON válido', raw: rawText }, 502);

    // Persiste a medida com a análise (sem a imagem)
    const insertRow = {
      user_id: user.id,
      date: body.date ?? new Date().toISOString().slice(0, 10),
      weight_kg: body.weight_kg ?? null,
      height_cm: heightCm,
      body_fat_pct: body.body_fat_pct ?? null,
      waist_cm: body.waist_cm ?? null,
      hip_cm: body.hip_cm ?? null,
      chest_cm: body.chest_cm ?? null,
      arm_cm: body.arm_cm ?? null,
      thigh_cm: body.thigh_cm ?? null,
      neck_cm: body.neck_cm ?? null,
      ai_analysis: analysis,
      note: body.note ?? null,
    };
    const { data: saved, error } = await supabase
      .from('body_metrics').insert(insertRow).select('id').single();
    if (error) {
      console.error(error);
      return json({ error: 'falha ao salvar medida', analysis }, 500);
    }

    return json({ analysis, metric_id: saved.id }, 200);
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      return json({ error: 'tempo esgotado ao analisar a foto' }, 504);
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

function normalizeHeightCm(height: number | null): number | null {
  if (!height || !Number.isFinite(height)) return null;
  if (height > 0 && height <= 3) return height * 100;
  return height;
}

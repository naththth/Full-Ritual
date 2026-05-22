// =====================================================================
// FULL RITUAL · Edge Function `analyze-lab-photo`
// Recebe foto de laudo (base64) + JWT do usuário.
// Usa Gemini Vision para extrair marcadores laboratoriais.
// Salva resultado em lab_results e retorna os dados extraídos.
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

interface LabMarker {
  value: number;
  unit: string;
  ref_min?: number;
  ref_max?: number;
  status: 'normal' | 'low' | 'high' | 'critical';
}

interface ReqBody {
  image_base64: string;
  mime_type: string;
  date?: string;
  lab_name?: string;
  photo_url?: string;
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
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: 'token inválido' }, 401);

    const body: ReqBody = await req.json();
    const { image_base64, mime_type, date, lab_name, photo_url } = body;

    const prompt = `Você é um assistente médico especializado em laudos laboratoriais.
Analise esta imagem de laudo e extraia TODOS os marcadores encontrados.

Retorne SOMENTE um JSON válido com esta estrutura:
{
  "markers": {
    "<nome_do_marcador>": {
      "value": <número>,
      "unit": "<unidade>",
      "ref_min": <número ou null>,
      "ref_max": <número ou null>,
      "status": "normal" | "low" | "high" | "critical"
    }
  },
  "lab_name": "<nome do laboratório se visível>",
  "date_on_report": "<data do laudo se visível>"
}

Nomes dos marcadores em português, minúsculos, sem acento. Ex: "ferritina", "vitamina_d", "tsh", "ldl", "hdl", "colesterol_total", "triglicerideos", "hemoglobina", "hematocrito", "glicose", "hba1c", "pcr", "vhs", "vitamina_b12", "zinco", "magnesio", "cortisol", "insulina", "testosterona", "estradiol", "progesterona", "prolactina".

Status: "low" se abaixo da referência mínima, "high" se acima, "critical" se muito fora, "normal" se dentro.
Se não houver valor de referência, use "normal".
Não inclua texto fora do JSON.`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type, data: image_base64 } },
            ],
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2048,
          },
        }),
      },
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      return json({ error: `Gemini error: ${err}` }, 500);
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return json({ error: 'Não foi possível extrair dados do laudo.' }, 422);

    let extracted: { markers: Record<string, LabMarker>; lab_name?: string; date_on_report?: string };
    try {
      extracted = JSON.parse(jsonMatch[0]);
    } catch {
      return json({ error: 'Formato inválido retornado pelo modelo.' }, 422);
    }

    const labDate = date ?? extracted.date_on_report ?? new Date().toISOString().slice(0, 10);
    const labNameFinal = lab_name ?? extracted.lab_name ?? null;

    const { data: saved, error: saveError } = await supabase
      .from('lab_results')
      .insert({
        user_id: user.id,
        date: labDate,
        lab_name: labNameFinal,
        photo_url: photo_url ?? null,
        markers: extracted.markers ?? {},
      })
      .select('*')
      .single();

    if (saveError) console.error('Erro ao salvar lab_result:', saveError);

    return json({ markers: extracted.markers, lab_result: saved, lab_name: labNameFinal, date: labDate });
  } catch (err) {
    console.error(err);
    return json({ error: String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

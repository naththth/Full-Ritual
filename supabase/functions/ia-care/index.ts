// =====================================================================
// FULL RITUAL · Edge Function `ia-care`
// IA CARE — organiza rotinas de pele, corpo e aromas via Gemini.
// Nunca expõe GEMINI_API_KEY. user_id vem sempre da sessão autenticada.
// =====================================================================

// @ts-expect-error Deno runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { IA_CARE_SYSTEM_PROMPT, buildUserContext } from './prompt.ts';

// @ts-expect-error Deno global
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
// @ts-expect-error
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// @ts-expect-error
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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

    const userId = user.id;

    const [profileRes, productsRes] = await Promise.all([
      supabase.from('skin_profiles').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('skin_products').select('*').eq('user_id', userId).order('created_at'),
    ]);

    const profile = profileRes.data ?? null;
    const products = productsRes.data ?? [];

    const userContext = buildUserContext({
      profile,
      products,
      hasNoProducts: products.length === 0,
    });

    const fullPrompt = `${IA_CARE_SYSTEM_PROMPT}\n\n${userContext}`;

    const geminiRes = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_MEDICAL', threshold: 'BLOCK_NONE' },
        ],
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('[ia-care] Gemini error:', errText);
      return json({ error: 'Erro ao chamar Gemini.' }, 502);
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    let routineData: Record<string, unknown>;
    try {
      routineData = JSON.parse(rawText);
    } catch {
      console.error('[ia-care] JSON parse error. Raw:', rawText.slice(0, 500));
      return json({ error: 'Resposta da IA inválida.' }, 502);
    }

    const { routine, skinProfileSummary, warnings, recommendations, missingInformation, dermatologySafetyNotes } =
      routineData as {
        routine: {
          day: { face: unknown[]; body: unknown[]; aromas: unknown[] };
          night: { face: unknown[]; body: unknown[]; aromas: unknown[] };
        };
        skinProfileSummary: Record<string, unknown>;
        warnings: string[];
        recommendations: string[];
        missingInformation: string[];
        dermatologySafetyNotes: string[];
      };

    // Persist routine
    const { data: routineRow, error: routineErr } = await supabase
      .from('skin_routines')
      .insert({
        user_id: userId,
        routine_json: routineData,
        risk_level: skinProfileSummary?.riskLevel ?? null,
        generated_by: 'ia_care',
      })
      .select('*')
      .single();

    if (routineErr) {
      console.error('[ia-care] Error saving routine:', routineErr);
      return json({ error: 'Erro ao salvar rotina.' }, 500);
    }

    // Build flat items list
    const allItems: unknown[] = [];
    const periods: Array<'day' | 'night'> = ['day', 'night'];
    const areas: Array<'face' | 'body' | 'aromas'> = ['face', 'body', 'aromas'];

    for (const period of periods) {
      for (const area of areas) {
        const items = (routine?.[period]?.[area] ?? []) as Array<Record<string, unknown>>;
        items.forEach((item, idx) => {
          allItems.push({
            user_id: userId,
            routine_id: routineRow.id,
            product_name: item.productName ?? item.product_name ?? '',
            brand: item.brand ?? null,
            category: item.category ?? null,
            area,
            period,
            order_index: typeof item.order === 'number' ? item.order : idx + 1,
            frequency: item.frequency ?? null,
            instructions: item.instructions ?? null,
            safety_note: item.safetyNote ?? item.safety_note ?? null,
            is_prescription: Boolean(item.isPrescription ?? item.is_prescription),
            is_checked: false,
          });
        });
      }
    }

    if (allItems.length > 0) {
      const { error: itemsErr } = await supabase
        .from('skin_routine_items')
        .insert(allItems);

      if (itemsErr) {
        console.error('[ia-care] Error saving items:', itemsErr);
      }
    }

    // Log IA usage
    await supabase.from('skin_ai_logs').insert({
      user_id: userId,
      input_snapshot: { profile_exists: !!profile, products_count: products.length },
      output_snapshot: { items_count: allItems.length, risk_level: skinProfileSummary?.riskLevel },
      safety_warnings: warnings ?? [],
    });

    // Load the full routine with items
    const { data: fullRoutine } = await supabase
      .from('skin_routines')
      .select('*, skin_routine_items(*)')
      .eq('id', routineRow.id)
      .single();

    return json({
      routine: fullRoutine,
      warnings: warnings ?? [],
      recommendations: recommendations ?? [],
      missingInformation: missingInformation ?? [],
      dermatologySafetyNotes: dermatologySafetyNotes ?? [],
    });
  } catch (err) {
    console.error('[ia-care] Unexpected error:', err);
    return json({ error: 'Erro interno.' }, 500);
  }
});

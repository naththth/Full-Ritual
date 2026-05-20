// =====================================================================
// FULL RITUAL · Edge Function `evaluate-workout`
// Baixa um .FIT do Storage, parseia com fit-file-parser e usa Gemini
// para comparar o treino realizado com o planejado.
// =====================================================================

// @ts-expect-error Deno runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-expect-error npm specifier supported by Supabase Edge Runtime
import FitParserImport from 'npm:fit-file-parser@1.21.0';

// @ts-expect-error Deno global
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
// @ts-expect-error
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// @ts-expect-error
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const FIT_BUCKET = 'training-fit';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface ReqBody {
  file_path: string;
  date: string;
  modality: 'corrida' | 'pedal' | 'musculacao' | 'lpo';
}

// @ts-expect-error Deno.serve
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'sem token de autenticação' }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'usuário inválido' }, 401);

    const { file_path, date, modality } = (await req.json()) as ReqBody;
    if (!file_path || !date || !modality) return json({ error: 'payload incompleto' }, 400);
    if (!file_path.startsWith(`${user.id}/`)) return json({ error: 'arquivo fora da pasta do usuário' }, 403);

    const { data: file, error: downloadError } = await supabase.storage
      .from(FIT_BUCKET)
      .download(file_path);
    if (downloadError || !file) return json({ error: downloadError?.message ?? 'arquivo não encontrado' }, 404);

    const [planRes, profileRes, recentWorkoutsRes] = await Promise.all([
      supabase
        .from('training_plans')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('week_start_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('training_profile').select('*').eq('user_id', user.id).maybeSingle(),
      supabase
        .from('garmin_workouts')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(5),
    ]);

    const parsedFit = await parseFitFile(await file.arrayBuffer());
    const summary = withProfileMetrics(summarizeFit(parsedFit), profileRes.data);

    const plannedDay = Array.isArray(planRes.data?.plan_json)
      ? planRes.data.plan_json.find((day: any) => day.date === date)
      : null;

    const aiFeedback = GEMINI_API_KEY
      ? await evaluateWithGemini({
        modality,
        date,
        summary,
        plannedDay,
        trainingProfile: profileRes.data,
        recentWorkouts: recentWorkoutsRes.data ?? [],
      })
      : fallbackFeedback(summary, plannedDay);

    const { data: workout, error: insertError } = await supabase
      .from('garmin_workouts')
      .insert({
        user_id: user.id,
        date,
        modality,
        file_url: file_path,
        parsed_data: summary,
        ai_feedback: aiFeedback,
      })
      .select()
      .single();

    if (insertError) return json({ error: insertError.message }, 500);

    return json({ workout, parsed_data: summary, ai_feedback: aiFeedback }, 200);
  } catch (err) {
    console.error(err);
    return json({ error: 'erro interno' }, 500);
  }
});

async function parseFitFile(arrayBuffer: ArrayBuffer): Promise<any> {
  const FitParser = (FitParserImport as any).default ?? FitParserImport;
  const parser = new FitParser({
    force: true,
    speedUnit: 'km/h',
    lengthUnit: 'km',
    temperatureUnit: 'celcius',
    elapsedRecordField: true,
    mode: 'both',
  });

  return await new Promise((resolve, reject) => {
    parser.parse(arrayBuffer, (error: Error | null, data: unknown) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
}

function summarizeFit(data: any) {
  const sessions = Array.isArray(data?.sessions) ? data.sessions : [];
  const session = sessions[0] ?? {};
  const activity = data?.activity ?? {};
  const records = Array.isArray(data?.records) ? data.records : [];
  const laps = Array.isArray(data?.laps) ? data.laps : [];

  const hrValues = valuesFromRecords(records, ['heart_rate']);
  const powerValues = valuesFromRecords(records, ['power']);
  const cadenceValues = valuesFromRecords(records, ['cadence']);
  const speedValues = valuesFromRecords(records, ['speed', 'enhanced_speed']);
  const altitudeValues = valuesFromRecords(records, ['altitude', 'enhanced_altitude']);
  const temperatureValues = valuesFromRecords(records, ['temperature']);

  const durationMin = minutes(session.total_timer_time ?? session.total_elapsed_time ?? activity.total_timer_time)
    ?? durationFromRecords(records);
  const distanceKm = number(session.total_distance) ?? lastNumber(records, ['distance']);
  const avgSpeed = number(session.avg_speed) ?? average(speedValues);
  const maxSpeed = number(session.max_speed) ?? max(speedValues);
  const avgHr = integer(session.avg_heart_rate) ?? integer(average(hrValues));
  const maxHr = integer(session.max_heart_rate) ?? integer(max(hrValues));
  const minHr = integer(min(hrValues));
  const avgPower = integer(session.avg_power) ?? integer(average(powerValues));
  const maxPower = integer(session.max_power) ?? integer(max(powerValues));
  const normalizedPower = integer(session.normalized_power);
  const avgCadence = integer(session.avg_cadence) ?? integer(average(cadenceValues));
  const maxCadence = integer(session.max_cadence) ?? integer(max(cadenceValues));
  const elevationGain = integer(session.total_ascent) ?? integer(elevationGainFrom(altitudeValues));

  return {
    sport: session.sport ?? activity.type ?? data?.sport ?? null,
    start_time: session.start_time ?? activity.timestamp ?? records[0]?.timestamp ?? null,
    end_time: records.at(-1)?.timestamp ?? null,
    duration_min: durationMin,
    distance_km: distanceKm,
    avg_speed_kmh: avgSpeed,
    max_speed_kmh: maxSpeed,
    avg_hr: avgHr,
    max_hr: maxHr,
    min_hr: minHr,
    avg_power: avgPower,
    max_power: maxPower,
    normalized_power: normalizedPower,
    avg_cadence: avgCadence,
    max_cadence: maxCadence,
    calories: integer(session.total_calories),
    elevation_gain_m: elevationGain,
    avg_temperature_c: integer(average(temperatureValues)),
    heart_rate: {
      avg: avgHr,
      max: maxHr,
      min: minHr,
      samples: hrValues.length,
    },
    power: {
      avg: avgPower,
      max: maxPower,
      normalized: normalizedPower,
      samples: powerValues.length,
    },
    cadence: {
      avg: avgCadence,
      max: maxCadence,
      samples: cadenceValues.length,
    },
    speed: {
      avg_kmh: avgSpeed,
      max_kmh: maxSpeed,
      samples: speedValues.length,
    },
    elevation: {
      gain_m: elevationGain,
      min_m: min(altitudeValues),
      max_m: max(altitudeValues),
    },
    laps: laps.length,
    records: records.length,
    data_quality: {
      has_heart_rate: Boolean(avgHr || maxHr || hrValues.length),
      has_power: Boolean(avgPower || maxPower || normalizedPower || powerValues.length),
      has_cadence: Boolean(avgCadence || maxCadence || cadenceValues.length),
      has_gps_distance: Boolean(distanceKm),
      has_elevation: Boolean(elevationGain || altitudeValues.length),
    },
    source: 'fit-file-parser',
  };
}

function withProfileMetrics(summary: Record<string, any>, profile: any) {
  const ftp = number(profile?.pedal_ftp_watts);
  if (!ftp) return summary;

  const avgPower = number(summary.avg_power);
  const normalizedPower = number(summary.normalized_power);
  return {
    ...summary,
    power: {
      ...(summary.power ?? {}),
      ftp,
      intensity_factor_avg: avgPower ? round(avgPower / ftp, 2) : null,
      intensity_factor_np: normalizedPower ? round(normalizedPower / ftp, 2) : null,
      estimated_zone_avg: avgPower ? powerZone(avgPower, ftp) : null,
      estimated_zone_np: normalizedPower ? powerZone(normalizedPower, ftp) : null,
    },
  };
}

async function evaluateWithGemini(input: {
  modality: string;
  date: string;
  summary: Record<string, unknown>;
  plannedDay: unknown;
  trainingProfile: unknown;
  recentWorkouts: unknown[];
}) {
  const prompt = JSON.stringify({
    task: 'Avaliar treino realizado comparando com o treino planejado do Full Ritual.',
    rules: [
      'Responda em português do Brasil.',
      'Seja objetiva, útil e segura.',
      'Não diagnostique. Não prescreva tratamento médico.',
      'Diga se o treino ficou abaixo, dentro ou acima do planejado.',
      'Sugira ajuste para o próximo treino se necessário.',
      'Priorize recuperação quando houver excesso de intensidade ou volume.',
      'Para pedal, assuma speed no rolo/smart trainer: interprete potência, cadência, RPE estimado e estabilidade do esforço; velocidade é secundária.',
      'Fale como treinador para uma atleta: técnico, acessível e direto ao que ela precisa fazer melhor no próximo treino.',
      'Avalie todas as métricas disponíveis: duração, distância, frequência cardíaca, potência, cadência, velocidade, elevação, calorias, voltas e qualidade dos dados.',
      'Se uma métrica importante não existir no .FIT, diga explicitamente que o arquivo não trouxe esse dado em vez de fingir que avaliou.',
      'Para pedal com FTP, interprete IF médio/NP e zona estimada. Para rolo, velocidade não define qualidade do treino.',
    ],
    workout_date: input.date,
    modality: input.modality,
    parsed_fit_summary: input.summary,
    planned_day: input.plannedDay,
    training_profile: input.trainingProfile,
    recent_workouts: input.recentWorkouts,
  });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 900,
        },
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error('Gemini error:', errText);
    return fallbackFeedback(input.summary, input.plannedDay);
  }

  const json = await res.json();
  return json?.candidates?.[0]?.content?.parts?.[0]?.text
    ?? fallbackFeedback(input.summary, input.plannedDay);
}

function fallbackFeedback(summary: Record<string, any>, plannedDay: any) {
  const duration = summary.duration_min ? `${Math.round(summary.duration_min)} min` : 'duração não identificada';
  const distance = summary.distance_km ? `${summary.distance_km.toFixed(1)} km` : 'distância não identificada';
  const hr = summary.avg_hr ? ` FC média ${summary.avg_hr} bpm${summary.max_hr ? `, pico ${summary.max_hr} bpm` : ''}.` : ' O arquivo não trouxe frequência cardíaca.';
  const power = summary.avg_power ? ` Potência média ${summary.avg_power}W${summary.normalized_power ? `, NP ${summary.normalized_power}W` : ''}.` : ' O arquivo não trouxe potência.';
  const cadence = summary.avg_cadence ? ` Cadência média ${summary.avg_cadence} rpm.` : '';
  const planned = plannedDay?.title ? ` O planejado era: ${plannedDay.title}.` : '';
  return `Treino importado: ${duration}, ${distance}.${planned}${hr}${power}${cadence} Use essa leitura para ajustar recuperação, sono, hidratação e carga do próximo treino.`;
}

function minutes(value: unknown) {
  const n = number(value);
  if (n === null) return null;
  return n > 500 ? n / 60 : n;
}

function number(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function integer(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function valuesFromRecords(records: any[], keys: string[]) {
  return records
    .map((record) => {
      for (const key of keys) {
        const value = number(record?.[key]);
        if (value !== null) return value;
      }
      return null;
    })
    .filter((value): value is number => value !== null);
}

function lastNumber(records: any[], keys: string[]) {
  for (let i = records.length - 1; i >= 0; i--) {
    for (const key of keys) {
      const value = number(records[i]?.[key]);
      if (value !== null) return value;
    }
  }
  return null;
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function max(values: number[]) {
  return values.length ? Math.max(...values) : null;
}

function min(values: number[]) {
  return values.length ? Math.min(...values) : null;
}

function durationFromRecords(records: any[]) {
  const first = records[0]?.timestamp ? new Date(records[0].timestamp).getTime() : null;
  const last = records.at(-1)?.timestamp ? new Date(records.at(-1).timestamp).getTime() : null;
  if (!first || !last || !Number.isFinite(first) || !Number.isFinite(last)) return null;
  return Math.max(0, (last - first) / 60_000);
}

function elevationGainFrom(values: number[]) {
  if (values.length < 2) return null;
  let gain = 0;
  for (let i = 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    if (diff > 0) gain += diff;
  }
  return gain;
}

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function powerZone(power: number, ftp: number) {
  const ratio = power / ftp;
  if (ratio <= 0.55) return 'Z1';
  if (ratio <= 0.75) return 'Z2';
  if (ratio <= 0.90) return 'Z3';
  if (ratio <= 1.05) return 'Z4';
  if (ratio <= 1.20) return 'Z5';
  return 'Z6';
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

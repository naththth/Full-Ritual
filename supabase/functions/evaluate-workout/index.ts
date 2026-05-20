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

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoIso = sevenDaysAgo.toISOString().slice(0, 10);

    const [planRes, profileRes, userProfileRes, recentWorkoutsRes, sleepRes, checkinsRes] = await Promise.all([
      supabase
        .from('training_plans')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('week_start_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('training_profile').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('profiles').select('cycle_tracking, cycle_start, cycle_length, birthdate').eq('id', user.id).maybeSingle(),
      supabase
        .from('garmin_workouts')
        .select('date, modality, parsed_data, ai_adjustments, ai_feedback')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(5),
      supabase
        .from('sleep_logs')
        .select('date, duration_min, quality')
        .eq('user_id', user.id)
        .gte('date', sevenDaysAgoIso)
        .order('date', { ascending: false }),
      supabase
        .from('checkins')
        .select('date, energy, calm, signals')
        .eq('user_id', user.id)
        .gte('date', sevenDaysAgoIso)
        .order('date', { ascending: false }),
    ]);

    const userContext = buildUserContext({
      userProfile: userProfileRes.data,
      sleepLogs: sleepRes.data ?? [],
      checkins: checkinsRes.data ?? [],
      recentWorkouts: recentWorkoutsRes.data ?? [],
      workoutDate: date,
    });

    const parsedFit = await parseFitFile(await file.arrayBuffer());
    const summary = withProfileMetrics(summarizeFit(parsedFit), profileRes.data);

    const plannedDay = Array.isArray(planRes.data?.plan_json)
      ? planRes.data.plan_json.find((day: any) => day.date === date)
      : null;

    // Extrai apenas os blocos da modalidade enviada (em dias multi-modalidade)
    const plannedModality = extractPlannedModality(plannedDay, modality);

    const evaluation = GEMINI_API_KEY
      ? await evaluateWithGemini({
        modality,
        date,
        summary,
        plannedDay,
        plannedModality,
        trainingProfile: profileRes.data,
        recentWorkouts: recentWorkoutsRes.data ?? [],
        userContext,
      })
      : fallbackEvaluation(summary, plannedModality, userContext);

    const { data: workout, error: insertError } = await supabase
      .from('garmin_workouts')
      .insert({
        user_id: user.id,
        date,
        modality,
        file_url: file_path,
        parsed_data: summary,
        ai_feedback: evaluation.summary,
        ai_adjustments: evaluation.adjustments,
      })
      .select()
      .single();

    if (insertError) return json({ error: insertError.message }, 500);

    return json({
      workout,
      parsed_data: summary,
      ai_feedback: evaluation.summary,
      ai_adjustments: evaluation.adjustments,
    }, 200);
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

const MODALITY_LABEL_MAP: Record<string, string> = {
  corrida: 'corrida',
  pedal: 'pedal',
  musculacao: 'musculação',
  lpo: 'LPO',
};

function extractPlannedModality(plannedDay: any, modality: string) {
  if (!plannedDay) return null;
  const targetLabel = MODALITY_LABEL_MAP[modality] ?? modality;
  const allBlocks = Array.isArray(plannedDay.blocks) ? plannedDay.blocks : [];

  // Em dias multi-modalidade os blocos têm modalityGroup. Filtra só os que batem.
  // Em dia single-modalidade, todos pertencem à única modalidade do dia.
  const matchingBlocks = allBlocks.filter((b: any) => {
    if (!b.modalityGroup) return true;
    return b.modalityGroup === targetLabel;
  });

  // Soma durações em minutos a partir do campo "10 min", "1h", etc.
  const parseDur = (raw: unknown): number => {
    if (typeof raw !== 'string') return 0;
    const minMatch = raw.match(/(\d+)\s*min/);
    if (minMatch) return Number(minMatch[1]);
    const hMatch = raw.match(/(\d+)\s*h/);
    if (hMatch) return Number(hMatch[1]) * 60;
    const num = raw.match(/(\d+)/);
    return num ? Number(num[1]) : 0;
  };
  const totalDuration = matchingBlocks.reduce((sum: number, b: any) => sum + parseDur(b.duration), 0);

  return {
    modality: targetLabel,
    total_duration_min: totalDuration || null,
    blocks: matchingBlocks,
    day_intensity: plannedDay.intensity ?? null,
  };
}

interface Adjustments {
  performance: {
    level: 'under' | 'par' | 'over';
    quality: 'poor' | 'good' | 'excellent';
    summary: string;
  };
  context: {
    verdict: 'progress' | 'maintenance' | 'caution' | 'overreach';
    factors: string[]; // bullets curtos: ex "sono curto ontem", "fase folicular", "3º consecutivo acima"
    summary: string;   // 1-2 frases: este treino te aproximou ou te afastou da sua meta
  };
  water: { extra_ml: number; note: string };
  energy: { level: 'low' | 'normal' | 'high'; note: string };
  next_workout: { changes: boolean; summary: string };
  skin: { changes: boolean; summary: string };
}

interface UserContext {
  cycle: { day: number; phase: 'menstrual' | 'folicular' | 'ovulatoria' | 'lutea' } | null;
  sleep: { last_night_min: number | null; avg_7d_min: number | null };
  checkins: { avg_energy_7d: number | null; avg_calm_7d: number | null; signals_recent: string[] };
  recent_workouts: { date: string; modality: string; level: string | null }[];
  streak_levels: string[]; // últimos 5 níveis: ex ['over','par','par','under']
}

function buildUserContext(input: {
  userProfile: any;
  sleepLogs: any[];
  checkins: any[];
  recentWorkouts: any[];
  workoutDate: string;
}): UserContext {
  const cycleStart: string | null = input.userProfile?.cycle_start ?? null;
  const cycleLength: number = input.userProfile?.cycle_length ?? 28;
  let cycle: UserContext['cycle'] = null;
  if (cycleStart && input.userProfile?.cycle_tracking !== false) {
    const start = new Date(`${cycleStart}T00:00:00`);
    const target = new Date(`${input.workoutDate}T00:00:00`);
    const diff = Math.floor((target.getTime() - start.getTime()) / 86_400_000);
    const day = (((diff % cycleLength) + cycleLength) % cycleLength) + 1;
    const phase: 'menstrual' | 'folicular' | 'ovulatoria' | 'lutea' =
      day <= 5 ? 'menstrual' :
      day <= 13 ? 'folicular' :
      day <= 17 ? 'ovulatoria' : 'lutea';
    cycle = { day, phase };
  }

  const sleepDurations = input.sleepLogs.map((l) => Number(l.duration_min)).filter((n) => Number.isFinite(n) && n > 0);
  const lastNight = input.sleepLogs[0]?.duration_min ?? null;
  const avgSleep = sleepDurations.length ? Math.round(sleepDurations.reduce((a, b) => a + b, 0) / sleepDurations.length) : null;

  const energies = input.checkins.map((c) => Number(c.energy)).filter((n) => Number.isFinite(n));
  const calms = input.checkins.map((c) => Number(c.calm)).filter((n) => Number.isFinite(n));
  const signals = Array.from(new Set(input.checkins.flatMap((c) => Array.isArray(c.signals) ? c.signals : [])));

  const recent_workouts = input.recentWorkouts.map((w) => ({
    date: w.date,
    modality: w.modality,
    level: w.ai_adjustments?.performance?.level ?? null,
  }));
  const streak_levels = recent_workouts.map((w) => w.level).filter((x): x is string => Boolean(x));

  return {
    cycle,
    sleep: {
      last_night_min: lastNight ? Number(lastNight) : null,
      avg_7d_min: avgSleep,
    },
    checkins: {
      avg_energy_7d: energies.length ? round(energies.reduce((a, b) => a + b, 0) / energies.length, 1) : null,
      avg_calm_7d: calms.length ? round(calms.reduce((a, b) => a + b, 0) / calms.length, 1) : null,
      signals_recent: signals.slice(0, 6),
    },
    recent_workouts,
    streak_levels,
  };
}

interface Evaluation { summary: string; adjustments: Adjustments }

async function evaluateWithGemini(input: {
  modality: string;
  date: string;
  summary: Record<string, unknown>;
  plannedDay: unknown;
  plannedModality: unknown;
  trainingProfile: unknown;
  recentWorkouts: unknown[];
  userContext: UserContext;
}): Promise<Evaluation> {
  const schemaDescription = `
Você é treinadora pessoal experiente e analisa o treino realizado cruzando com SONO, CICLO MENSTRUAL, CHECKINS e HISTÓRICO de treinos recentes. Retorne UM JSON estrito conforme schema:

{
  "summary": "frase curta (max 140 chars) resumindo se ficou abaixo/dentro/acima e se ajudou ou atrapalhou a evolução",
  "adjustments": {
    "performance": {
      "level": "under" | "par" | "over",
      "quality": "poor" | "good" | "excellent",
      "summary": "1 frase técnica citando métrica-chave (NP, FC, IF, cadência, duração). Quality avalia QUALIDADE DA EXECUÇÃO (estabilidade de potência, controle de zona, técnica), separada de quantidade."
    },
    "context": {
      "verdict": "progress" | "maintenance" | "caution" | "overreach",
      "factors": ["bullet 1 curto", "bullet 2 curto", "bullet 3 curto"],
      "summary": "1-2 frases dizendo se ESTE treino te aproximou ou afastou da sua evolução, baseado em sono+ciclo+streak+checkins"
    },
    "water": {
      "extra_ml": 0 | 250 | 500 | 750 | 1000,
      "note": "1 frase explicando hidratação no dia (ex: 'treino curto, mantenha 2,5L base' ou 'esforço alto, +750ml hoje')"
    },
    "energy": {
      "level": "low" | "normal" | "high",
      "note": "1 frase sobre expectativa de energia próximas 4-6h e sugestão de refeição/recuperação"
    },
    "next_workout": {
      "changes": true|false,
      "summary": "Se TRUE, explica ajuste concreto no próximo treino (reduzir volume/manter/adiantar prova). Se FALSE, 'Próximo treino mantém o planejado.'"
    },
    "skin": {
      "changes": true|false,
      "summary": "Se TRUE, ajuste à rotina (ex: 'limpeza dupla à noite — suor intenso 60min+', 'evite ácidos hoje'). Se FALSE, 'Rotina de pele mantém o padrão.'"
    }
  }
}

REGRAS:
- Responda APENAS o JSON. Sem texto antes/depois.
- Seja técnico, objetivo, em pt-BR. Não diagnostique.
- Para pedal indoor/rolo: priorize potência, NP, IF, cadência. Velocidade é secundária.
- Para pedal com FTP: interprete zonas reais.
- Se uma métrica não existir no .FIT, não invente.
- Performance.level: under/par/over = quantidade/volume vs planejado.
- Performance.quality: poor (zona instável, FC descontrolada) / good (zona consistente) / excellent (executado limpo, cadência estável, FC dentro da zona).
- Context.verdict:
  • progress = treino bem-executado em momento bom do ciclo/sono, contribui para evolução
  • maintenance = treino dentro do padrão, sem ganho extra nem prejuízo
  • caution = sinais de fadiga (sono curto, fase lútea + intensidade, signal cansaço) — observar
  • overreach = 2+ "over" seguidos OU sono <6h + treino intenso OU FC anormal — recomenda descanso
- Context.factors: 2-4 bullets curtos, ex: "sono 5h12 — abaixo do ideal", "fase folicular — janela boa", "3º over consecutivo".
- Context.summary: diga claramente se ESTE treino ajudou ou atrapalhou a evolução. Concreto.
- Água extra sobe com calor, duração >60min, intensidade alta.
- Energy low = depleção real. High = treino leve/regenerativo.
- Skin changes = TRUE só com motivo claro (suor prolongado, sol, cloro, atrito).
`;

  const prompt = JSON.stringify({
    workout_date: input.date,
    modality: input.modality,
    parsed_fit_summary: input.summary,
    planned_modality: input.plannedModality,
    planned_day_overview: input.plannedDay,
    training_profile: input.trainingProfile,
    recent_workouts: input.recentWorkouts,
    user_context: input.userContext,
    instructions_for_comparison: 'Compare o .FIT APENAS com planned_modality. Cruze user_context (ciclo, sono, streak_levels, checkins) para preencher context.verdict e context.summary com substância — diga concretamente se este treino aproximou ou afastou a evolução.',
  });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: schemaDescription + '\n\nDADOS:\n' + prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 800,
          responseMimeType: 'application/json',
        },
      }),
    },
  );

  if (!res.ok) {
    console.error('Gemini error:', await res.text());
    return fallbackEvaluation(input.summary, input.plannedModality, input.userContext);
  }

  const data = await res.json();
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return fallbackEvaluation(input.summary, input.plannedModality, input.userContext);

  try {
    const parsed = JSON.parse(text);
    if (parsed?.summary && parsed?.adjustments) return parsed as Evaluation;
  } catch (err) {
    console.error('JSON parse error:', err, text);
  }
  return fallbackEvaluation(input.summary, input.plannedModality, input.userContext);
}

function fallbackEvaluation(
  summary: Record<string, any>,
  plannedModality: any,
  ctx: UserContext,
): Evaluation {
  const duration = summary.duration_min ? `${Math.round(summary.duration_min)} min` : 'duração não identificada';
  const distance = summary.distance_km ? `, ${summary.distance_km.toFixed(1)} km` : '';
  const plannedDur = plannedModality?.total_duration_min ?? null;
  const realDur = Number(summary.duration_min) || 0;

  let level: 'under' | 'par' | 'over' = 'par';
  let perfSummary = `${duration}${distance}. Sem comparação com o planejado disponível.`;
  if (plannedDur && realDur > 0) {
    const ratio = realDur / plannedDur;
    if (ratio < 0.75) { level = 'under'; perfSummary = `Ficou abaixo: ${Math.round(realDur)}min vs ${plannedDur}min planejados.`; }
    else if (ratio > 1.25) { level = 'over'; perfSummary = `Ficou acima: ${Math.round(realDur)}min vs ${plannedDur}min planejados.`; }
    else perfSummary = `Dentro do planejado: ${Math.round(realDur)}min de ${plannedDur}min.`;
  }

  // Heurística simples de qualidade
  const avgHr = Number(summary.avg_hr);
  const maxHr = Number(summary.max_hr);
  let quality: 'poor' | 'good' | 'excellent' = 'good';
  if (avgHr && maxHr && maxHr - avgHr > 50) quality = 'poor';
  else if (level === 'par' && realDur > 30) quality = 'excellent';

  // Veredicto contextual heurístico
  const lastNight = ctx.sleep.last_night_min;
  const shortSleep = lastNight !== null && lastNight < 360;
  const consecutiveOver = ctx.streak_levels.filter((l) => l === 'over').length >= 2 || (level === 'over' && ctx.streak_levels[0] === 'over');
  const inLutea = ctx.cycle?.phase === 'lutea';

  let verdict: 'progress' | 'maintenance' | 'caution' | 'overreach' = 'maintenance';
  let ctxSummary = 'Treino dentro do padrão. Sem ganho extra mas sem prejuízo.';
  const factors: string[] = [];

  if (consecutiveOver && shortSleep) {
    verdict = 'overreach';
    ctxSummary = 'Sequência de treinos acima do planejado com sono curto. Risco de fadiga acumulada — priorize recuperação no próximo.';
  } else if (consecutiveOver) {
    verdict = 'caution';
    ctxSummary = 'Esforço acima por duas sessões seguidas. Observe sono e energia antes de manter a carga.';
  } else if (level === 'par' && !shortSleep && !inLutea) {
    verdict = 'progress';
    ctxSummary = 'Treino executado dentro do planejado em momento favorável (sono OK, fase do ciclo positiva). Contribui para sua evolução.';
  } else if (shortSleep) {
    verdict = 'caution';
    ctxSummary = 'Você fez o treino, mas sono baixo na noite anterior reduz a adaptação. Compense com prioridade ao sono hoje.';
  } else if (inLutea && level === 'over') {
    verdict = 'caution';
    ctxSummary = 'Esforço acima na fase lútea — corpo já está em estado de menor recuperação. Reduza ritmo da semana.';
  }

  if (lastNight !== null) factors.push(`sono ${Math.floor(lastNight/60)}h${String(Math.round(lastNight%60)).padStart(2,'0')} ${shortSleep ? '· abaixo do ideal' : '· suficiente'}`);
  if (ctx.cycle) factors.push(`fase ${ctx.cycle.phase} (dia ${ctx.cycle.day})`);
  if (ctx.streak_levels.length) factors.push(`últimos treinos: ${ctx.streak_levels.slice(0, 3).join(' · ')}`);
  if (ctx.checkins.avg_energy_7d !== null) factors.push(`energia média 7d: ${ctx.checkins.avg_energy_7d}/10`);

  return {
    summary: perfSummary,
    adjustments: {
      performance: { level, quality, summary: perfSummary },
      context: { verdict, factors, summary: ctxSummary },
      water: {
        extra_ml: level === 'over' ? 750 : level === 'par' && realDur > 60 ? 500 : 0,
        note: level === 'over' ? 'Esforço acima — +750ml hoje para repor.' : 'Mantenha sua hidratação de base.',
      },
      energy: {
        level: level === 'over' || verdict === 'overreach' ? 'low' : level === 'under' ? 'high' : 'normal',
        note: level === 'over' ? 'Energia tende a cair nas próximas 4–6h. Proteína + carbo em até 60min.' : 'Energia esperada normal.',
      },
      next_workout: {
        changes: verdict === 'overreach' || verdict === 'caution',
        summary: verdict === 'overreach' ? 'Próximo treino: reduzir intensidade em 20% ou trocar por recuperação ativa.'
          : verdict === 'caution' ? 'Próximo treino: mantenha intensidade, evite aumento até sinais melhorarem.'
          : 'Próximo treino mantém o planejado.',
      },
      skin: {
        changes: realDur > 60,
        summary: realDur > 60 ? 'Treino longo — limpeza completa à noite, reforce hidratação.' : 'Rotina de pele mantém o padrão.',
      },
    },
  };
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

// =====================================================================
// FULL RITUAL · Edge Function `sync-garmin-vitals`
// Sincroniza sinais vitais de fontes Garmin/bridge para a tabela `vitals`.
//
// Modos:
// 1) body.records: recebe registros normalizados do app/web bridge e salva.
// 2) GARMIN_HEALTH_API_URL + GARMIN_HEALTH_API_TOKEN: busca dados no endpoint
//    oficial/proxy aprovado e normaliza respostas comuns.
// =====================================================================

// @ts-expect-error Deno specific import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// @ts-expect-error Deno global
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// @ts-expect-error
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
// @ts-expect-error
const GARMIN_HEALTH_API_URL = Deno.env.get('GARMIN_HEALTH_API_URL');
// @ts-expect-error
const GARMIN_HEALTH_API_TOKEN = Deno.env.get('GARMIN_HEALTH_API_TOKEN');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface VitalRecord {
  date: string;
  resting_hr?: number | null;
  hrv_ms?: number | null;
  steps?: number | null;
  spo2_pct?: number | null;
  weight_kg?: number | null;
  source?: string;
  raw_data?: unknown;
}

interface ReqBody {
  startDate?: string;
  endDate?: string;
  records?: VitalRecord[];
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

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: 'token inválido' }, 401);

    const body = await req.json().catch(() => ({})) as ReqBody;
    const endDate = body.endDate ?? new Date().toISOString().slice(0, 10);
    const startDate = body.startDate ?? new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);

    const incoming = Array.isArray(body.records) && body.records.length
      ? body.records
      : await fetchGarminVitals(startDate, endDate);

    if (!incoming) {
      await markConnection(supabase, user.id, 'needs_config', 'GARMIN_HEALTH_API_URL/TOKEN ausentes');
      return json({ status: 'needs_config', imported: 0, message: 'Configure GARMIN_HEALTH_API_URL e GARMIN_HEALTH_API_TOKEN.' });
    }

    const records = normalizeRows(incoming).filter((record) => record.date);
    if (!records.length) {
      await logSync(supabase, user.id, 'success', 0, 'Nenhum registro novo.');
      return json({ status: 'success', imported: 0 });
    }

    const upserts = records.map((record) => ({
      user_id: user.id,
      date: record.date,
      resting_hr: finite(record.resting_hr),
      hrv_ms: finite(record.hrv_ms),
      steps: finite(record.steps),
      spo2_pct: finite(record.spo2_pct),
      weight_kg: finite(record.weight_kg),
      source: record.source ?? 'garmin_connect',
      raw_data: record.raw_data ?? record,
    }));

    const { error } = await supabase.from('vitals').upsert(upserts, { onConflict: 'user_id,date' });
    if (error) throw error;

    await markConnection(supabase, user.id, 'connected');
    await logSync(supabase, user.id, 'success', upserts.length, 'Sincronização concluída.');
    return json({ status: 'success', imported: upserts.length });
  } catch (err) {
    console.error(err);
    return json({ error: 'falha ao sincronizar Garmin' }, 500);
  }
});

async function fetchGarminVitals(startDate: string, endDate: string): Promise<unknown[] | null> {
  if (!GARMIN_HEALTH_API_URL || !GARMIN_HEALTH_API_TOKEN) return null;

  const url = new URL(GARMIN_HEALTH_API_URL);
  url.searchParams.set('startDate', startDate);
  url.searchParams.set('endDate', endDate);

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${GARMIN_HEALTH_API_TOKEN}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) throw new Error(`Garmin API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.records)) return data.records;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.dailySummaries)) return data.dailySummaries;
  return [];
}

function normalizeRows(rows: unknown[]): VitalRecord[] {
  return rows.map((row) => {
    const flat = flatten(row);
    return {
      date: text(flat, ['date', 'calendarDate', 'summaryDate', 'startDate'])?.slice(0, 10) ?? '',
      resting_hr: num(flat, ['restingHeartRate', 'resting_hr', 'resting heart rate']),
      hrv_ms: num(flat, ['hrv', 'hrv_ms', 'hrvRmssd', 'lastNightAvg']),
      steps: num(flat, ['steps', 'totalSteps']),
      spo2_pct: num(flat, ['spo2', 'spo2_pct', 'averageSpo2', 'pulseOx']),
      weight_kg: num(flat, ['weight', 'weight_kg', 'weightInGrams']) ? gramsToKgMaybe(num(flat, ['weight', 'weight_kg', 'weightInGrams'])) : null,
      source: text(flat, ['source']) ?? 'garmin_connect',
      raw_data: row,
    };
  });
}

function flatten(value: unknown, prefix = ''): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, item]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (item && typeof item === 'object' && !Array.isArray(item)) Object.assign(acc, flatten(item, nextKey));
    acc[key] = item;
    acc[nextKey] = item;
    return acc;
  }, {});
}

function text(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return null;
}

function num(row: Record<string, unknown>, keys: string[]) {
  const value = text(row, keys);
  if (!value) return null;
  const parsed = parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function finite(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function gramsToKgMaybe(value: number | null) {
  if (value == null) return null;
  return value > 500 ? Math.round((value / 1000) * 10) / 10 : value;
}

async function markConnection(supabase: any, userId: string, status: string, message?: string) {
  await supabase.from('wearable_connections').upsert({
    user_id: userId,
    provider: 'garmin_connect',
    status,
    display_name: 'Garmin Connect',
    last_sync_at: status === 'connected' ? new Date().toISOString() : null,
    metadata: message ? { message } : {},
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,provider' });
}

async function logSync(supabase: any, userId: string, status: string, imported: number, message: string) {
  await supabase.from('vital_sync_events').insert({
    user_id: userId,
    provider: 'garmin_connect',
    status,
    imported_count: imported,
    message,
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

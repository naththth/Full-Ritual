import { supabase, hasSupabase } from './supabase';
import type { BodyMetric, BodyAiAnalysis } from '../types';

export async function listBodyMetrics(userId: string, limit = 60): Promise<BodyMetric[]> {
  if (!hasSupabase) return [];
  const { data, error } = await supabase
    .from('body_metrics')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error(error);
    return [];
  }
  return (data ?? []) as BodyMetric[];
}

export interface SaveMetricInput {
  userId: string;
  date?: string;
  weight_kg?: number | null;
  height_cm?: number | null;
  body_fat_pct?: number | null;
  waist_cm?: number | null;
  hip_cm?: number | null;
  chest_cm?: number | null;
  arm_cm?: number | null;
  thigh_cm?: number | null;
  neck_cm?: number | null;
  note?: string | null;
}

export async function saveBodyMetric(input: SaveMetricInput): Promise<BodyMetric | null> {
  if (!hasSupabase) return null;
  const row = {
    user_id: input.userId,
    date: input.date ?? new Date().toISOString().slice(0, 10),
    weight_kg: input.weight_kg ?? null,
    height_cm: normalizeHeightCm(input.height_cm ?? null),
    body_fat_pct: input.body_fat_pct ?? null,
    waist_cm: input.waist_cm ?? null,
    hip_cm: input.hip_cm ?? null,
    chest_cm: input.chest_cm ?? null,
    arm_cm: input.arm_cm ?? null,
    thigh_cm: input.thigh_cm ?? null,
    neck_cm: input.neck_cm ?? null,
    note: input.note ?? null,
  };
  const { data, error } = await supabase.from('body_metrics').insert(row).select('*').single();
  if (error) {
    console.error(error);
    return null;
  }
  return data as BodyMetric;
}

export async function deleteBodyMetric(id: string): Promise<boolean> {
  if (!hasSupabase) return false;
  const { error } = await supabase.from('body_metrics').delete().eq('id', id);
  if (error) {
    console.error(error);
    return false;
  }
  return true;
}

export interface AnalyzePhotoInput {
  file: File;
  weight_kg?: number | null;
  height_cm?: number | null;
  body_fat_pct?: number | null;
  date?: string;
  note?: string | null;
  history?: Array<{ date: string; weight_kg?: number | null; body_fat_pct?: number | null }>;
  previous_analysis?: BodyAiAnalysis | null;
}

export interface AnalyzePhotoResult {
  analysis: BodyAiAnalysis;
  metric_id: string;
}

export async function analyzeBodyPhoto(input: AnalyzePhotoInput): Promise<AnalyzePhotoResult> {
  if (!hasSupabase) throw new Error('supabase indisponível');
  const base64 = await fileToBase64(input.file);
  const { data, error } = await supabase.functions.invoke('analyze-body-photo', {
    body: {
      image_base64: base64,
      mime_type: input.file.type || 'image/jpeg',
      weight_kg: input.weight_kg ?? undefined,
      height_cm: normalizeHeightCm(input.height_cm ?? null) ?? undefined,
      body_fat_pct: input.body_fat_pct ?? undefined,
      date: input.date,
      note: input.note ?? undefined,
      history: input.history ?? [],
      previous_analysis: input.previous_analysis ?? null,
    },
  });
  if (error) throw error;
  if (!data?.analysis) throw new Error('IA não devolveu análise');
  return data as AnalyzePhotoResult;
}

export async function analyzeBodyProgress(metricId: string): Promise<BodyAiAnalysis | null> {
  if (!hasSupabase) return null;
  const { data, error } = await supabase.functions.invoke('analyze-body-progress', {
    body: { metric_id: metricId },
  });
  if (error) {
    console.error(error);
    return null;
  }
  return (data?.analysis as BodyAiAnalysis) ?? null;
}

export interface TargetSnapshot {
  target_weight_kg: number | null;
  target_weight_kg_max: number | null;
  target_body_fat_pct: number | null;
  target_date: string | null;
}

export async function saveTargetSnapshot(userId: string, t: TargetSnapshot): Promise<boolean> {
  if (!hasSupabase) return false;
  const { error } = await supabase.from('body_targets_history').insert({ user_id: userId, ...t });
  if (error) {
    console.error(error);
    return false;
  }
  return true;
}

// -------- derivações client-side ----------

export function bmi(weightKg: number | null, heightCm: number | null): number | null {
  if (!weightKg || !heightCm) return null;
  heightCm = normalizeHeightCm(heightCm);
  if (!heightCm) return null;
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export function normalizeHeightCm(height: number | null): number | null {
  if (!height || !Number.isFinite(height)) return null;
  if (height > 0 && height <= 3) return height * 100;
  return height;
}

export function waistHipRatio(waist: number | null, hip: number | null): number | null {
  if (!waist || !hip) return null;
  return waist / hip;
}

/**
 * Estimativa US Navy de %gordura corporal.
 * Fórmula simplificada (feminina). Retorna null se faltar dado.
 */
export function navyBodyFatEstimate(opts: {
  sex?: 'm' | 'f';
  waist_cm: number | null;
  neck_cm: number | null;
  height_cm: number | null;
  hip_cm?: number | null;
}): number | null {
  const { sex = 'f', waist_cm, neck_cm, height_cm, hip_cm } = opts;
  if (!waist_cm || !neck_cm || !height_cm) return null;
  if (sex === 'f' && !hip_cm) return null;
  const log10 = (n: number) => Math.log10(n);
  let bf: number;
  if (sex === 'f') {
    bf = 495 / (1.29579 - 0.35004 * log10(waist_cm + (hip_cm as number) - neck_cm) + 0.22100 * log10(height_cm)) - 450;
  } else {
    bf = 495 / (1.0324 - 0.19077 * log10(waist_cm - neck_cm) + 0.15456 * log10(height_cm)) - 450;
  }
  if (!Number.isFinite(bf) || bf <= 0 || bf >= 60) return null;
  return Math.round(bf * 10) / 10;
}

/**
 * Ritmo observado em kg/semana com base nas medidas dos últimos `days` dias.
 */
export function observedPace(metrics: BodyMetric[], days = 30): number | null {
  const withWeight = metrics.filter((m) => m.weight_kg != null);
  if (withWeight.length < 2) return null;
  const now = Date.now();
  const cutoff = now - days * 86400000;
  const recent = withWeight.filter((m) => new Date(m.date).getTime() >= cutoff);
  if (recent.length < 2) return null;
  const sorted = [...recent].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const dtDays = (new Date(last.date).getTime() - new Date(first.date).getTime()) / 86400000;
  if (dtDays <= 0) return null;
  return ((Number(last.weight_kg) - Number(first.weight_kg)) / dtDays) * 7;
}

/**
 * Ritmo necessário (kg/semana) para chegar no peso alvo até target_date.
 */
export function requiredPace(currentKg: number | null, targetKg: number | null, targetDate: string | null): number | null {
  if (!currentKg || !targetKg || !targetDate) return null;
  const days = (new Date(targetDate).getTime() - Date.now()) / 86400000;
  if (days <= 0) return null;
  return ((targetKg - currentKg) / days) * 7;
}

export function daysSince(dateIso: string | null | undefined): number | null {
  if (!dateIso) return null;
  return Math.floor((Date.now() - new Date(dateIso).getTime()) / 86400000);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf('base64,');
      resolve(idx >= 0 ? result.slice(idx + 7) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

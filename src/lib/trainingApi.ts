import { hasSupabase, supabase } from './supabase';
import type {
  DayOfWeek,
  GarminWorkout,
  TrainingDay,
  TrainingModality,
  TrainingPlan,
} from '../types';

export async function generateTrainingPlanWithAi({
  weekStartDate,
  assignments,
  generatedFrom,
}: {
  weekStartDate: string;
  assignments?: Partial<Record<DayOfWeek, (TrainingModality | 'rest')[]>>;
  generatedFrom: 'onboarding' | 'feedback' | 'manual';
}): Promise<TrainingPlan> {
  if (!hasSupabase) throw new Error('Supabase não configurado.');

  const { data, error } = await supabase.functions.invoke<{
    plan: TrainingPlan;
    plan_json: TrainingDay[];
  }>('generate-training-plan', {
    body: {
      week_start_date: weekStartDate,
      assignments,
      generated_from: generatedFrom,
    },
  });

  if (error) throw new Error(error.message);
  if (!data?.plan) throw new Error('Plano vazio retornado pela IA.');
  return data.plan;
}

export async function uploadFitAndEvaluate({
  userId,
  file,
  date,
  modality,
}: {
  userId: string;
  file: File;
  date: string;
  modality: TrainingModality;
}): Promise<{
  workout: GarminWorkout;
  parsed_data: Record<string, unknown>;
  ai_feedback: string;
}> {
  if (!hasSupabase) throw new Error('Supabase não configurado.');

  const safeName = file.name.toLowerCase().replace(/[^a-z0-9_.-]+/g, '-');
  const path = `${userId}/${date}-${Date.now()}-${safeName.endsWith('.fit') ? safeName : `${safeName}.fit`}`;

  const { data: uploaded, error: uploadError } = await supabase.storage
    .from('training-fit')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/octet-stream',
    });

  if (uploadError) throw new Error(uploadError.message);

  const { data, error } = await supabase.functions.invoke<{
    workout: GarminWorkout;
    parsed_data: Record<string, unknown>;
    ai_feedback: string;
  }>('evaluate-workout', {
    body: {
      file_path: uploaded.path,
      date,
      modality,
    },
  });

  if (error) throw new Error(error.message);
  if (!data?.workout) throw new Error('Avaliação vazia do treino.');
  return data;
}

// =====================================================================
// FULL RITUAL · helpers de carga (kg) para musculação
// Heurística que detecta se um exercício recebe carga externa e
// persistência local + Supabase (workout_loads).
// =====================================================================

import { hasSupabase, supabase } from './supabase';

// Movimentos que NÃO recebem carga externa por padrão (peso corporal,
// alongamento, mobilidade, isometria livre).
const BODYWEIGHT_TOKENS = [
  'prancha', 'plank', 'bird dog', 'bird-dog', 'dead bug', 'dead-bug',
  'mobilidade', 'mobility', 'alongamento', 'stretch',
  'cat cow', 'gato', 'camelo', 'cobra',
  'flexão de braço', 'flexao de braco', 'push up', 'push-up', 'flexão livre',
  'barra fixa', 'pull up', 'pull-up', 'paralela', 'dip ',
  'caminhada', 'corrida', 'trote',
  'foam roll', 'liberação miofascial', 'liberacao miofascial',
  'respiração', 'respiracao', 'breathwork',
  'aquecimento articular', 'glúteo ativo', 'ativação',
  'hollow', 'l-sit',
];

// Movimentos com carga (lista positiva para reforçar detecção).
const WEIGHTED_TOKENS = [
  'agachamento', 'squat',
  'levantamento terra', 'deadlift', 'terra',
  'supino', 'bench',
  'desenvolvimento', 'overhead press', 'ohp', 'push press',
  'remada', 'row',
  'puxada', 'pulldown',
  'rosca', 'curl',
  'tríceps', 'triceps',
  'leg press', 'cadeira', 'mesa flexora',
  'stiff', 'rdl',
  'afundo', 'lunge', 'búlgaro', 'bulgaro',
  'elevação lateral', 'elevacao lateral',
  'snatch', 'clean', 'jerk', 'arranco', 'arremesso',
  'kettlebell swing', 'swing',
  'farmer', 'farmers',
  'good morning',
  'hip thrust', 'glute bridge com carga',
];

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function exerciseTakesLoad(title: string): boolean {
  const t = norm(title);
  if (!t) return false;
  for (const bw of BODYWEIGHT_TOKENS) if (t.includes(norm(bw))) return false;
  for (const w of WEIGHTED_TOKENS) if (t.includes(norm(w))) return true;
  return false;
}

export function exerciseKey(title: string): string {
  return norm(title)
    .replace(/\s*—.*/u, '')   // descarta detalhes após o travessão
    .replace(/\s*-\s.*/u, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

export interface StoredLoad {
  load_kg: number;
  sets?: number;
  reps?: number;
  rpe?: number;
}

export async function fetchWorkoutLoad(args: {
  userId: string;
  date: string;
  title: string;
}): Promise<StoredLoad | null> {
  if (!hasSupabase) return null;
  const key = exerciseKey(args.title);
  if (!key) return null;

  const { data, error } = await supabase
    .from('workout_loads')
    .select('load_kg, sets, reps, rpe')
    .eq('user_id', args.userId)
    .eq('date', args.date)
    .eq('exercise_key', key)
    .maybeSingle();

  if (error) {
    console.error('fetchWorkoutLoad', error);
    return null;
  }

  return data as StoredLoad | null;
}

export async function upsertWorkoutLoad(args: {
  userId: string;
  date: string;
  title: string;
  load_kg: number;
}): Promise<void> {
  if (!hasSupabase) return;
  const key = exerciseKey(args.title);
  if (!key) return;
  try {
    await supabase.from('workout_loads').upsert({
      user_id: args.userId,
      date: args.date,
      exercise_key: key,
      exercise_name: args.title,
      load_kg: args.load_kg,
    }, { onConflict: 'user_id,date,exercise_key' });
  } catch (error) {
    console.error('upsertWorkoutLoad', error);
  }
}

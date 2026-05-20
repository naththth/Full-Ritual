// =====================================================================
// FULL RITUAL · TIPOS DE DADOS
// Espelha o schema do Supabase. Edite em sincronia com migrations/.
// =====================================================================

export type DimensionKey = 'skin' | 'body' | 'mind' | 'diet' | 'spirit';

export const DIMENSIONS: Record<DimensionKey, { label: string; color: string; glyph: string }> = {
  skin:   { label: 'Pele',     color: 'var(--skin)',   glyph: '◐' },
  body:   { label: 'Corpo',    color: 'var(--body)',   glyph: '◑' },
  mind:   { label: 'Mente',    color: 'var(--mind)',   glyph: '○' },
  diet:   { label: 'Dieta',    color: 'var(--diet)',   glyph: '◍' },
  spirit: { label: 'Espírito', color: 'var(--spirit)', glyph: '✦' },
};

// ---------- PERFIL ----------
export type SkinType = 'oleosa' | 'mista' | 'seca' | 'sensivel' | 'normal';
export type SportModality =
  | 'natacao' | 'ciclismo' | 'corrida' | 'forca'
  | 'yoga' | 'pilates' | 'mobilidade' | 'caminhada';
export type MusicPref = 'focus' | 'ambient' | 'classical' | 'brazilian' | 'electronic' | 'jazz' | 'silence';
export type ContentPref =
  | 'longevidade' | 'neurociencia' | 'filosofia'
  | 'performance' | 'literatura' | 'ciencia' | 'negocios' | 'arte';
export type SpiritTheme =
  | 'gratidao' | 'proposito' | 'ancestralidade'
  | 'presenca' | 'silencio' | 'natureza' | 'criatividade';

export interface Profile {
  id: string;                 // uuid · auth.user id
  name: string;
  photo_url: string | null;
  birthdate: string | null;   // ISO date
  skin_type: SkinType | null;

  cycle_tracking: boolean;
  cycle_start: string | null; // último ciclo, ISO date
  cycle_length: number | null;

  sport_modalities: SportModality[];
  music_prefs: MusicPref[];
  content_prefs: ContentPref[];
  spirit_themes: SpiritTheme[];

  ai_enabled: boolean;
  notifications_enabled: boolean;

  created_at: string;
  updated_at: string;
}

// ---------- PRODUTOS ----------
export type ProductCategory =
  | 'limpeza' | 'tonico' | 'serum' | 'hidratante'
  | 'protetor_solar' | 'tratamento' | 'esfoliante'
  | 'mascara' | 'olhos' | 'corpo';

export type ProductStep = 'manha' | 'noite' | 'ambos';
export type ProductFrequency = 'diaria' | 'alternada' | 'semanal' | 'quinzenal';

export interface Product {
  id: string;
  user_id: string;
  name: string;
  brand: string | null;
  category: ProductCategory;
  step: ProductStep;
  frequency: ProductFrequency;
  order_in_routine: number;
  notes: string | null;
  photo_url: string | null;
  active: boolean;
  created_at: string;
}

// ---------- LOGS DIMENSIONAIS ----------
export interface Checkin {
  id: string;
  user_id: string;
  date: string;             // ISO date
  energy: number;           // 0-10
  calm: number;             // 0-10
  skin_state: number;       // 0-10
  body_state: number;       // 0-10
  signals: string[];        // tags: cabeça pesada, fome, etc
  note: string | null;
  created_at: string;
}

export interface SleepLog {
  id: string;
  user_id: string;
  date: string;
  bedtime: string | null;     // ISO timestamp
  wake_time: string | null;
  duration_min: number | null;
  quality: number | null;     // 0-10
  notes: string | null;
}

export interface WaterLog {
  id: string;
  user_id: string;
  date: string;
  amount_ml: number;
  logged_at: string;
}

export type MealType = 'manha' | 'almoco' | 'lanche' | 'jantar' | 'ceia';
export interface MealLog {
  id: string;
  user_id: string;
  date: string;
  meal_type: MealType;
  photo_url: string | null;
  ingredients: string[];
  mood_after: number | null;
  notes: string | null;
  logged_at: string;
}

export interface WorkoutLog {
  id: string;
  user_id: string;
  date: string;
  modality: SportModality;
  duration_min: number;
  intensity: number;        // 0-10
  type: string | null;      // ex: "longão", "intervalado"
  notes: string | null;
}

export interface SkincareLog {
  id: string;
  user_id: string;
  date: string;
  time_of_day: 'manha' | 'noite';
  products_used: string[];  // product ids
  skin_signal: string | null;
  photo_url: string | null;
}

export interface MindLog {
  id: string;
  user_id: string;
  date: string;
  type: 'leitura' | 'foco' | 'som' | 'meditacao' | 'pausa';
  duration_min: number | null;
  content_ref: string | null;
  notes: string | null;
}

export interface SpiritLog {
  id: string;
  user_id: string;
  date: string;
  intention: string | null;
  gratitude: string[];
  mood: number | null;       // 0-10
  theme: SpiritTheme | null;
  notes: string | null;
}

export type CyclePhase = 'menstrual' | 'folicular' | 'ovulatoria' | 'lutea';
export interface CycleLog {
  id: string;
  user_id: string;
  date: string;
  phase: CyclePhase | null;
  flow: number | null;        // 0-4
  mood: number | null;
  symptoms: string[];
}

// ---------- INSIGHTS DA IA ----------
export interface Insight {
  id: string;
  user_id: string;
  date: string;
  type: 'daily' | 'weekly' | 'correlation' | 'suggestion';
  title: string;
  body: string;
  correlations: Record<string, unknown> | null;
  source: 'gemini' | 'rule' | 'user';
  created_at: string;
}

// ---------- SCORES DIÁRIOS (view materializada) ----------
export interface DailyScore {
  user_id: string;
  date: string;
  score_skin: number;
  score_body: number;
  score_mind: number;
  score_diet: number;
  score_spirit: number;
  score_total?: number;
}

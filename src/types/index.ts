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

// ---------- BIBLIOTECA / LEITURA ----------
export type ReadingStatus = 'reading' | 'want_to_read' | 'read' | 'paused' | 'abandoned';

export interface ReadingBook {
  id: string;
  user_id?: string;
  source: 'goodreads' | 'manual' | 'import';
  external_id: string | null;
  title: string;
  author: string;
  isbn: string | null;
  isbn13: string | null;
  publisher: string | null;
  pages: number | null;
  current_page: number;
  status: ReadingStatus;
  rating: number | null;
  date_read: string | null;
  date_added: string | null;
  shelves: string[];
  review: string | null;
  notes: string | null;
  cover_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReadingSession {
  id: string;
  user_id?: string;
  book_id: string;
  date: string;
  start_page: number | null;
  end_page: number | null;
  pages_read: number | null;
  minutes: number | null;
  feeling: string | null;
  notes: string | null;
  created_at: string;
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

// ---------- TREINO (Body) ----------
export type TrainingModality = 'corrida' | 'pedal' | 'musculacao' | 'lpo';
export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type PreferredTime = 'morning' | 'afternoon' | 'evening' | 'flexible';
export type TrainingGoal = 'fat_loss' | 'muscle_gain' | 'performance' | 'maintenance' | 'event';
export type ConsistencyBand = 'under_6m' | '6m_1y' | '1y_3y' | 'over_3y';
export type RunLocation = 'street' | 'treadmill' | 'both';
export type PedalType = 'roadbike' | 'mtb' | 'indoor';
export type StrengthLocation = 'gym' | 'home' | 'outdoor';
export type StrengthSplit = 'fullbody' | 'upper_lower' | 'ppl' | 'bro_split' | 'other';
export type LpoMovements = 'basics' | 'full_oly';
export type PlanSource = 'onboarding' | 'feedback' | 'manual';
export type IntensityLevel = 'easy' | 'moderate' | 'hard' | 'max';

export interface TrainingProfile {
  user_id: string;
  modalities: TrainingModality[];
  available_days: DayOfWeek[];
  preferred_time: PreferredTime;
  session_minutes: number;
  main_goal: TrainingGoal;
  consistency_band: ConsistencyBand | null;
  limitations: string | null;

  corrida_pace_min_per_km: string | null;
  corrida_max_distance_km: number | null;
  corrida_has_race: boolean;
  corrida_race_info: string | null;
  corrida_location: RunLocation | null;

  pedal_ftp_watts: number | null;
  pedal_type: PedalType | null;
  pedal_weekly_km: number | null;
  pedal_has_event: boolean;
  pedal_event_info: string | null;

  strength_location: StrengthLocation | null;
  strength_equipment: string | null;
  strength_split: StrengthSplit | null;

  lpo_saturday_9am: boolean;
  lpo_has_coach: boolean;
  lpo_movements: LpoMovements | null;

  created_at: string;
  updated_at: string;
}

export interface TrainingBlock {
  id: string;
  icon: string;
  title: string;
  content: string;
  duration?: string;
  modalityGroup?: string; // para dias com múltiplos treinos
}

export interface TrainingDay {
  day_index: number;
  date: string;
  modality: TrainingModality | 'rest';
  modalities: (TrainingModality | 'rest')[];
  title: string;
  details: string;           // string plana (backward compat / fallback)
  blocks: TrainingBlock[];   // blocos estruturados com checkboxes
  duration_min: number;
  intensity: IntensityLevel;
  notes?: string;
}

export interface TrainingPlan {
  id: string;
  user_id: string;
  week_start_date: string;   // segunda da semana
  plan_json: TrainingDay[];
  generated_at: string;
  generated_from: PlanSource;
  is_active: boolean;
}

export interface GarminWorkout {
  id: string;
  user_id: string;
  date: string;
  modality: TrainingModality;
  file_url: string | null;
  parsed_data: Record<string, unknown> | null;
  ai_feedback: string | null;
  created_at: string;
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

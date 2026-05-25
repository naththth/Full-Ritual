// Funções puras de cálculo nutricional — sem side-effects, 100% testáveis.

export interface FoodMacros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface MacroTotals extends FoodMacros {
  meals: number;
  foods: number;
}

export interface NutritionTargets {
  calories: number;
  protein: number;
  proteinPerKg: number;
  calorieFactor: number;
  label: string;
}

export interface DietFood {
  id: string;
  diet_meal_id: string;
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  notes?: string | null;
  position?: number;
}

export interface DietMeal {
  id: string;
  name: string;
  meal_time?: string | null;
  position: number;
  notes?: string | null;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
}

export type DayStatus =
  | 'sem_dados'
  | 'planejado'
  | 'em_andamento'
  | 'concluido'
  | 'parcial'
  | 'abaixo_da_meta'
  | 'acima_da_meta';

export function sumFoodMacros(foods: Pick<DietFood, 'calories' | 'protein' | 'carbs' | 'fat'>[]): FoodMacros {
  return foods.reduce(
    (acc, f) => ({
      calories: round2(acc.calories + f.calories),
      protein:  round2(acc.protein + f.protein),
      carbs:    round2(acc.carbs + f.carbs),
      fat:      round2(acc.fat + f.fat),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export function calcMealTotals(foods: Pick<DietFood, 'calories' | 'protein' | 'carbs' | 'fat'>[]): FoodMacros {
  return sumFoodMacros(foods);
}

export function calcDayTotals(meals: Pick<DietMeal, 'total_calories' | 'total_protein' | 'total_carbs' | 'total_fat'>[]): MacroTotals {
  const base = meals.reduce(
    (acc, m) => ({
      calories: round2(acc.calories + m.total_calories),
      protein:  round2(acc.protein + m.total_protein),
      carbs:    round2(acc.carbs + m.total_carbs),
      fat:      round2(acc.fat + m.total_fat),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
  return { ...base, meals: meals.length, foods: 0 };
}

export function calcDayTotalsFromFoods(
  meals: DietMeal[],
  foodsByMealId: Record<string, DietFood[]>,
): MacroTotals {
  let calories = 0, protein = 0, carbs = 0, fat = 0, totalFoods = 0;
  for (const meal of meals) {
    const foods = foodsByMealId[meal.id] ?? [];
    totalFoods += foods.length;
    for (const f of foods) {
      calories = round2(calories + f.calories);
      protein  = round2(protein + f.protein);
      carbs    = round2(carbs + f.carbs);
      fat      = round2(fat + f.fat);
    }
  }
  return { calories, protein, carbs, fat, meals: meals.length, foods: totalFoods };
}

export function calcDayStatus(params: {
  hasMeals: boolean;
  hasFoods: boolean;
  consumedCalories: number;
  targetCalories?: number;
  consumedWaterMl: number;
  targetWaterMl: number;
}): DayStatus {
  const { hasMeals, hasFoods, consumedCalories, targetCalories, consumedWaterMl, targetWaterMl } = params;

  if (!hasMeals && !hasFoods && consumedCalories === 0) return 'sem_dados';
  if (hasMeals && !hasFoods && consumedCalories === 0) return 'planejado';

  if (!targetCalories) {
    const waterPct = targetWaterMl > 0 ? consumedWaterMl / targetWaterMl : 0;
    if (waterPct >= 0.9) return 'concluido';
    if (waterPct >= 0.5) return 'em_andamento';
    return 'parcial';
  }

  const calPct = consumedCalories / targetCalories;
  if (calPct >= 0.9 && calPct <= 1.15) return 'concluido';
  if (calPct < 0.7) return 'abaixo_da_meta';
  if (calPct > 1.25) return 'acima_da_meta';
  if (calPct >= 0.7) return 'em_andamento';
  return 'parcial';
}

export function waterProgressPct(consumedMl: number, targetMl: number): number {
  if (targetMl <= 0) return 0;
  return Math.min(100, Math.round((consumedMl / targetMl) * 100));
}

export function addWaterMl(current: number, addMl: number): number {
  return Math.max(0, current + addMl);
}

export function estimateNutritionTargets(params: {
  weightKg?: number | null;
  goal?: string | null;
  objectiveDetails?: string | null;
}): NutritionTargets | null {
  const weight = params.weightKg;
  if (!weight || weight < 30 || weight > 300) return null;

  const goal = params.goal ?? '';
  const config = adjustTargetConfigForDetails(targetConfigForGoal(goal), params.objectiveDetails ?? '');
  return {
    calories: Math.round(weight * config.calorieFactor),
    protein: Math.round(weight * config.proteinPerKg),
    proteinPerKg: config.proteinPerKg,
    calorieFactor: config.calorieFactor,
    label: config.label,
  };
}

function targetConfigForGoal(goal: string) {
  switch (goal) {
    case 'performance':
      return { calorieFactor: 34, proteinPerKg: 1.8, label: 'performance e recuperação' };
    case 'composicao':
      return { calorieFactor: 28, proteinPerKg: 1.8, label: 'composição corporal' };
    case 'energia':
      return { calorieFactor: 32, proteinPerKg: 1.6, label: 'energia estável' };
    case 'longevidade':
      return { calorieFactor: 30, proteinPerKg: 1.6, label: 'longevidade e manutenção' };
    case 'condicao_especifica':
      return { calorieFactor: 30, proteinPerKg: 1.5, label: 'ponto de partida conservador' };
    case 'saude_geral':
    default:
      return { calorieFactor: 30, proteinPerKg: 1.6, label: 'saúde geral' };
  }
}

function adjustTargetConfigForDetails(
  config: { calorieFactor: number; proteinPerKg: number; label: string },
  details: string,
) {
  const text = normalizeText(details);
  if (!text) return config;

  if (matchesAny(text, ['emagrecer', 'perder gordura', 'perda de gordura', 'secar', 'definicao', 'definir', 'reduzir peso'])) {
    return {
      calorieFactor: Math.min(config.calorieFactor, 27),
      proteinPerKg: Math.max(config.proteinPerKg, 1.8),
      label: `${config.label} · ajuste para perda de gordura`,
    };
  }

  if (matchesAny(text, ['ganhar massa', 'hipertrofia', 'massa muscular', 'aumentar peso', 'bulk', 'superavit'])) {
    return {
      calorieFactor: Math.max(config.calorieFactor, 34),
      proteinPerKg: Math.max(config.proteinPerKg, 1.8),
      label: `${config.label} · ajuste para ganho de massa`,
    };
  }

  if (matchesAny(text, ['maratona', 'prova', 'corrida', 'pedal', 'endurance', 'performance', 'competicao'])) {
    return {
      calorieFactor: Math.max(config.calorieFactor, 34),
      proteinPerKg: Math.max(config.proteinPerKg, 1.7),
      label: `${config.label} · ajuste para demanda esportiva`,
    };
  }

  if (matchesAny(text, ['manter', 'manutencao', 'sem emagrecer', 'sem perder peso'])) {
    return {
      calorieFactor: Math.max(config.calorieFactor, 30),
      proteinPerKg: Math.max(config.proteinPerKg, 1.6),
      label: `${config.label} · ajuste para manutenção`,
    };
  }

  return config;
}

function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function matchesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(normalizeText(term)));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

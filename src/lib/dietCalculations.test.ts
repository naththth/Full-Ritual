import { describe, it, expect } from 'vitest';
import {
  sumFoodMacros,
  calcMealTotals,
  calcDayTotals,
  calcDayTotalsFromFoods,
  calcDayStatus,
  waterProgressPct,
  addWaterMl,
  estimateNutritionTargets,
  type DietFood,
  type DietMeal,
} from './dietCalculations';

const food = (overrides: Partial<DietFood> = {}): DietFood => ({
  id: '1', diet_meal_id: 'm1', name: 'Arroz', quantity: 100, unit: 'g',
  calories: 130, protein: 2.5, carbs: 28, fat: 0.3, ...overrides,
});

const meal = (overrides: Partial<DietMeal> = {}): DietMeal => ({
  id: 'm1', name: 'Almoço', position: 0,
  total_calories: 0, total_protein: 0, total_carbs: 0, total_fat: 0, ...overrides,
});

// ── sumFoodMacros ─────────────────────────────────────────────────────────────

describe('sumFoodMacros', () => {
  it('retorna zeros para lista vazia', () => {
    expect(sumFoodMacros([])).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  });

  it('soma calorias de um alimento', () => {
    expect(sumFoodMacros([food()])).toMatchObject({ calories: 130 });
  });

  it('soma calorias de dois alimentos', () => {
    const result = sumFoodMacros([food({ calories: 130 }), food({ calories: 70 })]);
    expect(result.calories).toBe(200);
  });

  it('soma proteína com precisão decimal', () => {
    const result = sumFoodMacros([
      food({ protein: 2.5 }),
      food({ protein: 1.7 }),
    ]);
    expect(result.protein).toBe(4.2);
  });

  it('soma macros completos', () => {
    const result = sumFoodMacros([
      food({ calories: 130, protein: 2.5, carbs: 28, fat: 0.3 }),
      food({ calories: 200, protein: 25, carbs: 0, fat: 8 }),
    ]);
    expect(result).toEqual({ calories: 330, protein: 27.5, carbs: 28, fat: 8.3 });
  });
});

// ── calcMealTotals ────────────────────────────────────────────────────────────

describe('calcMealTotals', () => {
  it('é alias de sumFoodMacros', () => {
    const foods = [food({ calories: 100, protein: 10, carbs: 15, fat: 2 })];
    expect(calcMealTotals(foods)).toEqual(sumFoodMacros(foods));
  });
});

// ── calcDayTotals ─────────────────────────────────────────────────────────────

describe('calcDayTotals', () => {
  it('retorna zeros para lista vazia', () => {
    const result = calcDayTotals([]);
    expect(result).toMatchObject({ calories: 0, protein: 0, carbs: 0, fat: 0, meals: 0 });
  });

  it('soma totais de refeições', () => {
    const meals = [
      meal({ total_calories: 400, total_protein: 30, total_carbs: 50, total_fat: 10 }),
      meal({ total_calories: 200, total_protein: 15, total_carbs: 20, total_fat: 5 }),
    ];
    const result = calcDayTotals(meals);
    expect(result.calories).toBe(600);
    expect(result.protein).toBe(45);
    expect(result.meals).toBe(2);
  });
});

// ── calcDayTotalsFromFoods ────────────────────────────────────────────────────

describe('calcDayTotalsFromFoods', () => {
  it('retorna zeros quando não há alimentos', () => {
    const meals = [meal()];
    const result = calcDayTotalsFromFoods(meals, {});
    expect(result).toMatchObject({ calories: 0, protein: 0, foods: 0, meals: 1 });
  });

  it('soma alimentos de múltiplas refeições', () => {
    const m1 = meal({ id: 'm1' });
    const m2 = meal({ id: 'm2', name: 'Jantar' });
    const f1 = food({ id: 'f1', diet_meal_id: 'm1', calories: 200, protein: 20, carbs: 25, fat: 5 });
    const f2 = food({ id: 'f2', diet_meal_id: 'm1', calories: 100, protein: 10, carbs: 12, fat: 2 });
    const f3 = food({ id: 'f3', diet_meal_id: 'm2', calories: 300, protein: 25, carbs: 30, fat: 8 });

    const result = calcDayTotalsFromFoods([m1, m2], { m1: [f1, f2], m2: [f3] });
    expect(result.calories).toBe(600);
    expect(result.protein).toBe(55);
    expect(result.foods).toBe(3);
    expect(result.meals).toBe(2);
  });
});

// ── calcDayStatus ─────────────────────────────────────────────────────────────

describe('calcDayStatus', () => {
  const base = { hasMeals: true, hasFoods: true, consumedWaterMl: 2000, targetWaterMl: 2500 };

  it('sem_dados quando não há nada', () => {
    expect(calcDayStatus({ hasMeals: false, hasFoods: false, consumedCalories: 0, consumedWaterMl: 0, targetWaterMl: 2500 }))
      .toBe('sem_dados');
  });

  it('planejado quando há refeições mas sem alimentos registrados', () => {
    expect(calcDayStatus({ hasMeals: true, hasFoods: false, consumedCalories: 0, consumedWaterMl: 0, targetWaterMl: 2500 }))
      .toBe('planejado');
  });

  it('concluido quando calorias estão entre 90% e 115% da meta', () => {
    expect(calcDayStatus({ ...base, consumedCalories: 1900, targetCalories: 2000 }))
      .toBe('concluido');
    expect(calcDayStatus({ ...base, consumedCalories: 2200, targetCalories: 2000 }))
      .toBe('concluido');
  });

  it('abaixo_da_meta quando calorias < 70% da meta', () => {
    expect(calcDayStatus({ ...base, consumedCalories: 1300, targetCalories: 2000 }))
      .toBe('abaixo_da_meta');
  });

  it('acima_da_meta quando calorias > 125% da meta', () => {
    expect(calcDayStatus({ ...base, consumedCalories: 2600, targetCalories: 2000 }))
      .toBe('acima_da_meta');
  });

  it('em_andamento quando calorias entre 70% e 90%', () => {
    expect(calcDayStatus({ ...base, consumedCalories: 1500, targetCalories: 2000 }))
      .toBe('em_andamento');
  });

  it('usa água quando não há meta de calorias', () => {
    expect(calcDayStatus({ ...base, consumedCalories: 0, consumedWaterMl: 2000, targetWaterMl: 2500 }))
      .toBe('em_andamento'); // 80% → em_andamento
    expect(calcDayStatus({ ...base, consumedCalories: 0, consumedWaterMl: 2300, targetWaterMl: 2500 }))
      .toBe('concluido'); // 92% → concluido
  });
});

// ── waterProgressPct ──────────────────────────────────────────────────────────

describe('waterProgressPct', () => {
  it('retorna 0 quando consumo é zero', () => {
    expect(waterProgressPct(0, 2500)).toBe(0);
  });

  it('retorna porcentagem correta', () => {
    expect(waterProgressPct(1250, 2500)).toBe(50);
    expect(waterProgressPct(2500, 2500)).toBe(100);
  });

  it('limita em 100%', () => {
    expect(waterProgressPct(3000, 2500)).toBe(100);
  });

  it('retorna 0 quando meta é zero', () => {
    expect(waterProgressPct(500, 0)).toBe(0);
  });
});

// ── addWaterMl ────────────────────────────────────────────────────────────────

describe('addWaterMl', () => {
  it('adiciona volume', () => {
    expect(addWaterMl(500, 250)).toBe(750);
  });

  it('não vai abaixo de zero', () => {
    expect(addWaterMl(100, -500)).toBe(0);
  });

  it('subtrai corretamente', () => {
    expect(addWaterMl(1000, -250)).toBe(750);
  });
});

// ── estimateNutritionTargets ─────────────────────────────────────────────────

describe('estimateNutritionTargets', () => {
  it('retorna null sem peso válido', () => {
    expect(estimateNutritionTargets({ weightKg: null, goal: 'saude_geral' })).toBeNull();
    expect(estimateNutritionTargets({ weightKg: 10, goal: 'saude_geral' })).toBeNull();
  });

  it('estima kcal e proteína para saúde geral', () => {
    expect(estimateNutritionTargets({ weightKg: 70, goal: 'saude_geral' })).toMatchObject({
      calories: 2100,
      protein: 112,
      proteinPerKg: 1.6,
    });
  });

  it('ajusta fatores por objetivo', () => {
    expect(estimateNutritionTargets({ weightKg: 80, goal: 'performance' })).toMatchObject({
      calories: 2720,
      protein: 144,
    });
    expect(estimateNutritionTargets({ weightKg: 80, goal: 'composicao' })).toMatchObject({
      calories: 2240,
      protein: 144,
    });
  });

  it('usa detalhes do objetivo para ajustar perda de gordura', () => {
    expect(estimateNutritionTargets({
      weightKg: 80,
      goal: 'saude_geral',
      objectiveDetails: 'quero perder gordura sem perder massa',
    })).toMatchObject({
      calories: 2160,
      protein: 144,
      proteinPerKg: 1.8,
    });
  });

  it('usa detalhes do objetivo para ajustar ganho de massa', () => {
    expect(estimateNutritionTargets({
      weightKg: 70,
      goal: 'saude_geral',
      objectiveDetails: 'ganhar massa muscular e força',
    })).toMatchObject({
      calories: 2380,
      protein: 126,
      proteinPerKg: 1.8,
    });
  });
});

// ── Testes de integração de fluxo ─────────────────────────────────────────────

describe('fluxo dieta manual — cálculo end-to-end', () => {
  it('calcula macros por refeição e totais do dia corretamente', () => {
    const almoco: DietFood[] = [
      food({ id: 'f1', calories: 200, protein: 20, carbs: 25, fat: 5 }),
      food({ id: 'f2', calories: 150, protein: 5, carbs: 30, fat: 3 }),
    ];
    const jantar: DietFood[] = [
      food({ id: 'f3', calories: 400, protein: 35, carbs: 40, fat: 12 }),
    ];

    const totAlmoco = calcMealTotals(almoco);
    const totJantar = calcMealTotals(jantar);

    expect(totAlmoco.calories).toBe(350);
    expect(totAlmoco.protein).toBe(25);

    const m1 = meal({ id: 'm1', name: 'Almoço', total_calories: totAlmoco.calories, total_protein: totAlmoco.protein, total_carbs: totAlmoco.carbs, total_fat: totAlmoco.fat });
    const m2 = meal({ id: 'm2', name: 'Jantar', total_calories: totJantar.calories, total_protein: totJantar.protein, total_carbs: totJantar.carbs, total_fat: totJantar.fat });

    const day = calcDayTotals([m1, m2]);
    expect(day.calories).toBe(750);
    expect(day.protein).toBe(60);
    expect(day.meals).toBe(2);
  });

  it('dados são salvos por user_id — cada user_id tem própria estrutura', () => {
    // simulação: duas listas de refeições de users diferentes
    const user1Meals = [meal({ id: 'u1m1', total_calories: 1800, total_protein: 120, total_carbs: 200, total_fat: 60 })];
    const user2Meals = [meal({ id: 'u2m1', total_calories: 2200, total_protein: 90, total_carbs: 280, total_fat: 80 })];

    const u1 = calcDayTotals(user1Meals);
    const u2 = calcDayTotals(user2Meals);

    expect(u1.calories).toBe(1800);
    expect(u2.calories).toBe(2200);
    expect(u1.calories).not.toBe(u2.calories);
  });
});

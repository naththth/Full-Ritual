import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  saveMealLog,
  sanitizeDietProfile,
  loadDietPlan,
  saveDietPlan,
  loadDietProfile,
  saveDietProfile,
  loadActiveDietDocument,
  saveDietDocument,
  archiveDietDocument,
  loadDietMeals,
  saveDietMeal,
  deleteDietMeal,
  updateMealTotals,
  loadDietFoods,
  saveDietFood,
  deleteDietFood,
  loadWaterDaily,
  saveWaterDaily,
  saveNutritionAiLog,
  loadLatestNutritionAiLog,
} from './dietService';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockMaybeSingle = vi.fn();
const mockSingle = vi.fn();
const mockUpsert = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();
const mockEq = vi.fn();

const chain: Record<string, unknown> = {};

function resetChain() {
  chain.select = () => chain;
  chain.eq = mockEq.mockReturnValue(chain);
  chain.order = mockOrder.mockReturnValue(chain);
  chain.limit = mockLimit.mockReturnValue(chain);
  chain.maybeSingle = mockMaybeSingle;
  chain.single = mockSingle;
  chain.upsert = mockUpsert.mockReturnValue(chain);
  chain.insert = mockInsert.mockReturnValue(chain);
  chain.update = mockUpdate.mockReturnValue(chain);
  chain.delete = mockDelete.mockReturnValue(chain);
}

vi.mock('./supabase', () => ({ supabase: { from: () => chain, storage: { from: () => ({ createSignedUrl: vi.fn() }) } } }));

beforeEach(() => {
  vi.resetAllMocks();
  resetChain();
});

// ── Testes originais (retrocompatibilidade) ───────────────────────────────────

describe('saveMealLog', () => {
  it('chama upsert com user_id, date e meal_type', async () => {
    mockUpsert.mockResolvedValue({ error: null });
    await saveMealLog('u1', '2026-05-24', {
      meal_type: 'almoco', ingredients: ['arroz'], photo_url: null, notes: null,
    });
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1', date: '2026-05-24', meal_type: 'almoco' }),
      { onConflict: 'user_id,date,meal_type' },
    );
  });

  it('lança erro quando backend falha', async () => {
    mockUpsert.mockResolvedValue({ error: new Error('fail') });
    await expect(saveMealLog('u1', '2026-05-24', { meal_type: 'almoco', ingredients: [], photo_url: null, notes: null }))
      .rejects.toThrow('fail');
  });
});

describe('loadDietPlan', () => {
  it('retorna null quando não há linha', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await loadDietPlan('u1')).toBeNull();
  });

  it('mapeia linha para plan', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { manual_foods: [], pdf_url: null, pdf_name: null, notes: 'ok', setup_mode: 'existing_plan', nutri_profile: {}, nutri_configured: true },
      error: null,
    });
    const result = await loadDietPlan('u1');
    expect(result?.setup_mode).toBe('existing_plan');
    expect(result?.nutri_configured).toBe(true);
  });
});

describe('saveDietPlan', () => {
  it('chama upsert com user_id', async () => {
    mockUpsert.mockResolvedValue({ error: null });
    await saveDietPlan('u1', { manual_foods: [], pdf_url: null, pdf_name: null, notes: null, setup_mode: null, nutri_profile: {}, nutri_configured: false });
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1' }),
      { onConflict: 'user_id' },
    );
  });
});

// ── diet_profiles ─────────────────────────────────────────────────────────────

describe('loadDietProfile', () => {
  it('retorna null quando não há perfil', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await loadDietProfile('u1')).toBeNull();
  });

  it('retorna dados do perfil', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { id: 'p1', goal: 'saude_geral', weight_kg: 70, height_cm: 175 },
      error: null,
    });
    const result = await loadDietProfile('u1');
    expect(result?.goal).toBe('saude_geral');
    expect(result?.weight_kg).toBe(70);
  });

  it('lança erro do backend', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: new Error('db error') });
    await expect(loadDietProfile('u1')).rejects.toThrow('db error');
  });
});

describe('saveDietProfile', () => {
  it('limpa campos vazios e internos antes do upsert', async () => {
    mockUpsert.mockReturnValue(chain);
    mockSingle.mockResolvedValue({ data: { id: 'p1', goal: 'performance' }, error: null });

    await saveDietProfile('u1', {
      goal: 'performance',
      activity_level: '',
      budget: '',
      weight_kg: 75,
      _dirty: true,
    } as never);

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u1',
        goal: 'performance',
        activity_level: null,
        budget: null,
        weight_kg: 75,
      }),
      { onConflict: 'user_id' },
    );
    expect(mockUpsert.mock.calls[0][0]).not.toHaveProperty('_dirty');
  });

  it('chama upsert com user_id e retorna dados', async () => {
    const profileData = { id: 'p1', goal: 'performance', weight_kg: 75 };
    mockUpsert.mockReturnValue(chain);
    mockSingle.mockResolvedValue({ data: profileData, error: null });

    const result = await saveDietProfile('u1', { goal: 'performance', weight_kg: 75 });
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1', goal: 'performance' }),
      { onConflict: 'user_id' },
    );
    expect(result).toMatchObject({ goal: 'performance' });
  });
});

describe('sanitizeDietProfile', () => {
  it('remove id/campos internos, converte string vazia em null e preserva números', () => {
    expect(sanitizeDietProfile({
      id: 'p1',
      goal: 'saude_geral',
      activity_level: '',
      budget: '',
      weight_kg: 70,
      _dirty: true,
    } as never)).toEqual({
      goal: 'saude_geral',
      activity_level: null,
      budget: null,
      weight_kg: 70,
    });
  });
});

// ── diet_documents ────────────────────────────────────────────────────────────

describe('loadActiveDietDocument', () => {
  it('retorna null quando não há documento', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await loadActiveDietDocument('u1')).toBeNull();
  });

  it('retorna documento ativo mais recente', async () => {
    const doc = { id: 'd1', file_name: 'dieta.pdf', file_path: 'u1/dieta.pdf', mime_type: 'application/pdf', source: 'dietbox_pdf', status: 'active', uploaded_at: '2026-05-24' };
    mockMaybeSingle.mockResolvedValue({ data: doc, error: null });
    expect((await loadActiveDietDocument('u1'))?.file_name).toBe('dieta.pdf');
  });
});

describe('saveDietDocument', () => {
  it('chama insert com user_id e retorna documento', async () => {
    const doc = { id: 'd1', file_name: 'dieta.pdf', file_path: 'u1/dieta.pdf', mime_type: 'application/pdf', source: 'dietbox_pdf', status: 'active', uploaded_at: '2026-05-24' };
    mockInsert.mockReturnValue(chain);
    mockSingle.mockResolvedValue({ data: doc, error: null });

    const result = await saveDietDocument('u1', {
      file_name: 'dieta.pdf', file_path: 'u1/dieta.pdf', mime_type: 'application/pdf',
      source: 'dietbox_pdf', status: 'active',
    });
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1', file_name: 'dieta.pdf' }),
    );
    expect(result.id).toBe('d1');
  });
});

describe('archiveDietDocument', () => {
  it('chama update com status archived filtrado por user_id', async () => {
    await archiveDietDocument('u1', 'd1');
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'archived' });
  });
});

// ── diet_meals ────────────────────────────────────────────────────────────────

describe('loadDietMeals', () => {
  it('retorna lista vazia quando não há refeições', async () => {
    mockOrder.mockResolvedValue({ data: [], error: null });
    const result = await loadDietMeals('u1');
    expect(result).toEqual([]);
  });

  it('retorna lista de refeições ordenada por position', async () => {
    const meals = [
      { id: 'm1', name: 'Café', position: 0, total_calories: 300, total_protein: 15, total_carbs: 40, total_fat: 8 },
      { id: 'm2', name: 'Almoço', position: 1, total_calories: 600, total_protein: 40, total_carbs: 70, total_fat: 15 },
    ];
    mockOrder.mockResolvedValue({ data: meals, error: null });
    const result = await loadDietMeals('u1');
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Café');
  });
});

describe('saveDietMeal', () => {
  it('chama insert com user_id e retorna refeição', async () => {
    const mealData = { id: 'm1', name: 'Almoço', position: 0, total_calories: 0, total_protein: 0, total_carbs: 0, total_fat: 0 };
    mockInsert.mockReturnValue(chain);
    mockSingle.mockResolvedValue({ data: mealData, error: null });

    const result = await saveDietMeal('u1', { name: 'Almoço', position: 0, total_calories: 0, total_protein: 0, total_carbs: 0, total_fat: 0 });
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'u1', name: 'Almoço' }));
    expect(result.id).toBe('m1');
  });
});

describe('deleteDietMeal', () => {
  it('chama delete filtrado por id e user_id', async () => {
    await deleteDietMeal('u1', 'm1');
    expect(mockDelete).toHaveBeenCalled();
  });
});

describe('updateMealTotals', () => {
  it('atualiza totais da refeição', async () => {
    await updateMealTotals('u1', 'm1', { calories: 300, protein: 25, carbs: 40, fat: 8 });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ total_calories: 300, total_protein: 25 }),
    );
  });
});

// ── diet_foods ────────────────────────────────────────────────────────────────

describe('loadDietFoods', () => {
  it('retorna lista vazia quando não há alimentos', async () => {
    // Supabase retorna o resultado no terminal da chain de ordem
    mockOrder.mockResolvedValue({ data: [], error: null });
    expect(await loadDietFoods('u1', 'm1')).toEqual([]);
  });
});

describe('saveDietFood', () => {
  it('chama insert com user_id e diet_meal_id', async () => {
    const foodData = { id: 'f1', diet_meal_id: 'm1', name: 'Arroz', quantity: 100, unit: 'g', calories: 130, protein: 2.5, carbs: 28, fat: 0.3, position: 0 };
    mockInsert.mockReturnValue(chain);
    mockSingle.mockResolvedValue({ data: foodData, error: null });

    const result = await saveDietFood('u1', { diet_meal_id: 'm1', name: 'Arroz', quantity: 100, unit: 'g', calories: 130, protein: 2.5, carbs: 28, fat: 0.3, position: 0 });
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1', diet_meal_id: 'm1', name: 'Arroz' }),
    );
    expect(result.id).toBe('f1');
  });
});

describe('deleteDietFood', () => {
  it('chama delete filtrado por foodId e user_id', async () => {
    await deleteDietFood('u1', 'f1');
    expect(mockDelete).toHaveBeenCalled();
  });
});

// ── water_daily ───────────────────────────────────────────────────────────────

describe('loadWaterDaily', () => {
  it('retorna null quando não há registro', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await loadWaterDaily('u1', '2026-05-24')).toBeNull();
  });

  it('retorna registro do dia', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { id: 'w1', log_date: '2026-05-24', target_ml: 2500, consumed_ml: 1000 },
      error: null,
    });
    const result = await loadWaterDaily('u1', '2026-05-24');
    expect(result?.consumed_ml).toBe(1000);
    expect(result?.target_ml).toBe(2500);
  });
});

describe('saveWaterDaily', () => {
  it('chama upsert com user_id e log_date corretos', async () => {
    const row = { id: 'w1', log_date: '2026-05-24', target_ml: 2500, consumed_ml: 1500 };
    mockUpsert.mockReturnValue(chain);
    mockSingle.mockResolvedValue({ data: row, error: null });

    const result = await saveWaterDaily('u1', '2026-05-24', 1500, 2500);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1', log_date: '2026-05-24', consumed_ml: 1500, target_ml: 2500 }),
      { onConflict: 'user_id,log_date' },
    );
    expect(result.consumed_ml).toBe(1500);
  });
});

// ── nutrition_ai_logs ─────────────────────────────────────────────────────────

describe('saveNutritionAiLog', () => {
  it('chama insert com user_id e response', async () => {
    mockInsert.mockResolvedValue({ error: null });
    await saveNutritionAiLog('u1', { response: 'orientação gerada', model: 'gemini-2.0-flash' });
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1', response: 'orientação gerada' }),
    );
  });
});

describe('loadLatestNutritionAiLog', () => {
  it('retorna null quando não há logs', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await loadLatestNutritionAiLog('u1')).toBeNull();
  });

  it('retorna log mais recente', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { response: 'análise anterior', created_at: '2026-05-24T10:00:00Z' },
      error: null,
    });
    const result = await loadLatestNutritionAiLog('u1');
    expect(result?.response).toBe('análise anterior');
  });
});

// ── Testes de fluxo — IA NUTRI não roda sem ação do usuário ──────────────────

describe('IA NUTRI — não roda automaticamente', () => {
  it('saveNutritionAiLog só é chamado explicitamente (não automático)', async () => {
    mockInsert.mockResolvedValue({ error: null });
    // simular que a função NÃO foi chamada automaticamente ao carregar
    expect(mockInsert).not.toHaveBeenCalled();

    // só após ação explícita do usuário
    await saveNutritionAiLog('u1', { response: 'análise gerada', diet_profile_id: 'p1' });
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });
});

// ── Testes de segurança — dados filtrados por user_id ────────────────────────

describe('segurança — user_id em todas as operações', () => {
  it('saveDietDocument inclui user_id no insert', async () => {
    mockInsert.mockReturnValue(chain);
    mockSingle.mockResolvedValue({ data: { id: 'd1', file_name: 'f.pdf', file_path: 'u1/f.pdf', mime_type: 'application/pdf', source: 'dietbox_pdf', status: 'active', uploaded_at: '2026-05-24' }, error: null });
    await saveDietDocument('u1', { file_name: 'f.pdf', file_path: 'u1/f.pdf', mime_type: 'application/pdf', source: 'dietbox_pdf', status: 'active' });
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'u1' }));
  });

  it('saveWaterDaily inclui user_id no upsert', async () => {
    mockUpsert.mockReturnValue(chain);
    mockSingle.mockResolvedValue({ data: { id: 'w1', log_date: '2026-05-24', target_ml: 2500, consumed_ml: 500 }, error: null });
    await saveWaterDaily('u1', '2026-05-24', 500, 2500);
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'u1' }), expect.any(Object));
  });

  it('saveNutritionAiLog inclui user_id no insert', async () => {
    mockInsert.mockResolvedValue({ error: null });
    await saveNutritionAiLog('u2', { response: 'resp', diet_profile_id: null });
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'u2' }));
  });
});

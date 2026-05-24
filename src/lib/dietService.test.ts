import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveMealLog, loadDietPlan, saveDietPlan } from './dietService';

const mockMaybeSingle = vi.fn();
const mockUpsert = vi.fn();

const chain: Record<string, unknown> = {
  select: () => chain,
  eq: () => chain,
  maybeSingle: mockMaybeSingle,
  upsert: mockUpsert,
};

vi.mock('./supabase', () => ({ supabase: { from: () => chain } }));

beforeEach(() => vi.clearAllMocks());

describe('saveMealLog', () => {
  it('calls upsert with user_id, date and meal_type', async () => {
    mockUpsert.mockResolvedValue({ error: null });
    await saveMealLog('u1', '2026-05-24', {
      meal_type: 'almoco', ingredients: ['arroz'], photo_url: null, notes: null,
    });
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1', date: '2026-05-24', meal_type: 'almoco' }),
      { onConflict: 'user_id,date,meal_type' },
    );
  });

  it('throws on error', async () => {
    mockUpsert.mockResolvedValue({ error: new Error('fail') });
    await expect(saveMealLog('u1', '2026-05-24', { meal_type: 'almoco', ingredients: [], photo_url: null, notes: null }))
      .rejects.toThrow('fail');
  });
});

describe('loadDietPlan', () => {
  it('returns null when no row', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await loadDietPlan('u1')).toBeNull();
  });

  it('maps row to plan', async () => {
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
  it('calls upsert with user_id', async () => {
    mockUpsert.mockResolvedValue({ error: null });
    await saveDietPlan('u1', { manual_foods: [], pdf_url: null, pdf_name: null, notes: null, setup_mode: null, nutri_profile: {}, nutri_configured: false });
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1' }),
      { onConflict: 'user_id' },
    );
  });
});

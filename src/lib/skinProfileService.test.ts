import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loadSkinProfile,
  saveSkinProfile,
  type SkinProfilePayload,
} from './skinProfileService';

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

const samplePayload: SkinProfilePayload = {
  skin_types: ['oleosa', 'sensivel'],
  sensitivity: 'alta',
  allergies: null,
  goals: ['hidratar', 'reduzir_vermelhidao'],
  morning_time: '5min',
  night_time: '10min',
  routine_preference: 'equilibrada',
  budget: 'intermediaria',
  uses_actives: false,
  uses_prescription: false,
  dermatology_followup: 'nunca',
  pregnancy_lactation_status: 'nao_se_aplica',
};

describe('loadSkinProfile', () => {
  it('returns null when no profile exists', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await loadSkinProfile('u1')).toBeNull();
  });

  it('returns profile data when row exists', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { ...samplePayload, id: 'p1', user_id: 'u1', created_at: '', updated_at: '' },
      error: null,
    });
    const result = await loadSkinProfile('u1');
    expect(result?.sensitivity).toBe('alta');
    expect(result?.skin_types).toContain('sensivel');
  });

  it('throws on Supabase error', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: new Error('db error') });
    await expect(loadSkinProfile('u1')).rejects.toThrow('db error');
  });
});

describe('saveSkinProfile', () => {
  it('calls upsert with user_id and all fields', async () => {
    mockUpsert.mockResolvedValue({ error: null });
    await saveSkinProfile('u1', samplePayload);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1', sensitivity: 'alta' }),
      { onConflict: 'user_id' },
    );
  });

  it('throws on Supabase error', async () => {
    mockUpsert.mockResolvedValue({ error: new Error('fail') });
    await expect(saveSkinProfile('u1', samplePayload)).rejects.toThrow('fail');
  });
});

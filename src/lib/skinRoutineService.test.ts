import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loadLatestSkinRoutine,
  toggleRoutineItemCheck,
  type SkinRoutineItem,
} from './skinRoutineService';

const mockMaybeSingle = vi.fn();

const chain: Record<string, unknown> = {
  select: () => chain,
  eq: () => chain,
  order: () => chain,
  limit: () => chain,
  maybeSingle: mockMaybeSingle,
  update: () => updateChain,
};

const updateChain: Record<string, unknown> = {
  eq: () => updateChain,
  select: () => updateChain,
  single: vi.fn(),
};

vi.mock('./supabase', () => ({ supabase: { from: () => chain } }));

beforeEach(() => {
  vi.clearAllMocks();
  (updateChain.single as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {}, error: null });
});

const sampleItem: SkinRoutineItem = {
  id: 'item1',
  routine_id: 'r1',
  user_id: 'u1',
  product_id: null,
  product_name: 'Protetor Solar',
  brand: 'ISDIN',
  category: 'protetor_solar',
  area: 'face',
  period: 'day',
  order_index: 5,
  frequency: 'todos os dias',
  instructions: 'Aplicar após hidratante.',
  safety_note: null,
  is_prescription: false,
  is_checked: false,
  checked_at: null,
  created_at: '',
  updated_at: '',
};

describe('loadLatestSkinRoutine', () => {
  it('returns null when no routine exists', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await loadLatestSkinRoutine('u1')).toBeNull();
  });

  it('returns routine with items when row exists', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: 'r1',
        user_id: 'u1',
        routine_json: {},
        risk_level: 'moderado',
        generated_by: 'ia_care',
        created_at: '',
        updated_at: '',
        skin_routine_items: [sampleItem],
      },
      error: null,
    });
    const result = await loadLatestSkinRoutine('u1');
    expect(result?.risk_level).toBe('moderado');
    expect(result?.skin_routine_items[0].product_name).toBe('Protetor Solar');
  });

  it('throws on Supabase error', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: new Error('db error') });
    await expect(loadLatestSkinRoutine('u1')).rejects.toThrow('db error');
  });
});

describe('toggleRoutineItemCheck', () => {
  it('calls update with is_checked true and checked_at when checking', async () => {
    (updateChain.single as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { ...sampleItem, is_checked: true }, error: null });
    const result = await toggleRoutineItemCheck('u1', 'item1', true);
    expect(result.is_checked).toBe(true);
  });

  it('calls update with is_checked false and null checked_at when unchecking', async () => {
    (updateChain.single as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { ...sampleItem, is_checked: false }, error: null });
    const result = await toggleRoutineItemCheck('u1', 'item1', false);
    expect(result.is_checked).toBe(false);
  });

  it('throws on Supabase error', async () => {
    (updateChain.single as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: new Error('fail') });
    await expect(toggleRoutineItemCheck('u1', 'item1', true)).rejects.toThrow('fail');
  });
});

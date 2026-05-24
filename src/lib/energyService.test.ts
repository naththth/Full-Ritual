import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadCheckin, saveCheckin, saveSleepLog, listSleepLogs } from './energyService';

const mockMaybeSingle = vi.fn();
const mockSingle = vi.fn();
const mockOrder = vi.fn();
const mockUpsert = vi.fn();

// Minimal chain builder
function makeChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    order: mockOrder,
    maybeSingle: mockMaybeSingle,
    single: mockSingle,
    upsert: mockUpsert,
    ...overrides,
  };
  return chain;
}

const chain = makeChain();
vi.mock('./supabase', () => ({
  supabase: { from: () => chain },
}));

beforeEach(() => {
  vi.clearAllMocks();
  // Default upsert returns chain with select/single
  mockUpsert.mockReturnValue({ select: () => ({ single: mockSingle }) });
});

describe('loadCheckin', () => {
  it('returns null when no row found', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await loadCheckin('u1', '2026-05-24')).toBeNull();
  });

  it('maps row to payload', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { energy: 8, calm: 6, skin_state: 7, body_state: 5, signals: ['fome'], note: 'ok' },
      error: null,
    });
    const result = await loadCheckin('u1', '2026-05-24');
    expect(result).toEqual({ energy: 8, calm: 6, skin_state: 7, body_state: 5, signals: ['fome'], note: 'ok' });
  });

  it('throws on error', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: new Error('fail') });
    await expect(loadCheckin('u1', '2026-05-24')).rejects.toThrow('fail');
  });
});

describe('saveCheckin', () => {
  it('upserts with user_id and date', async () => {
    mockUpsert.mockResolvedValue({ error: null });
    await saveCheckin('u1', '2026-05-24', {
      energy: 7, calm: 5, skin_state: 8, body_state: 6, signals: [], note: null,
    });
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1', date: '2026-05-24', energy: 7 }),
      { onConflict: 'user_id,date' },
    );
  });
});

describe('listSleepLogs', () => {
  it('returns array from supabase', async () => {
    mockOrder.mockResolvedValue({ data: [{ id: '1', date: '2026-05-24' }], error: null });
    const result = await listSleepLogs('u1', '2026-05-11');
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2026-05-24');
  });
});

describe('saveSleepLog', () => {
  it('returns saved log', async () => {
    mockSingle.mockResolvedValue({
      data: { id: 'abc', user_id: 'u1', date: '2026-05-24', duration_min: 480 },
      error: null,
    });
    const result = await saveSleepLog('u1', '2026-05-24', {
      bedtime: '2026-05-23T23:30:00',
      wake_time: '2026-05-24T07:30:00',
      duration_min: 480,
      quality: 8,
      notes: null,
    });
    expect(result.id).toBe('abc');
  });
});

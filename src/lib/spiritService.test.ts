import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadSpirit, saveSpirit } from './spiritService';

const mockMaybeSingle = vi.fn();
const mockUpsert = vi.fn();

vi.mock('./supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: mockMaybeSingle,
          }),
        }),
      }),
      upsert: mockUpsert,
    }),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadSpirit', () => {
  it('returns null when no row found', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    const result = await loadSpirit('user-1', '2026-05-24');
    expect(result).toBeNull();
  });

  it('returns mapped payload when row exists', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { intention: 'paz', gratitude: ['sol'], mood: 8, theme: 'presenca', notes: 'ok' },
      error: null,
    });
    const result = await loadSpirit('user-1', '2026-05-24');
    expect(result).toEqual({
      intention: 'paz',
      gratitude: ['sol'],
      mood: 8,
      theme: 'presenca',
      notes: 'ok',
    });
  });

  it('throws when supabase returns error', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: new Error('db error') });
    await expect(loadSpirit('user-1', '2026-05-24')).rejects.toThrow('db error');
  });
});

describe('saveSpirit', () => {
  it('calls upsert with user_id, date and payload', async () => {
    mockUpsert.mockResolvedValue({ error: null });
    await saveSpirit('user-1', '2026-05-24', {
      intention: 'paz',
      gratitude: ['sol'],
      mood: 8,
      theme: 'presenca',
      notes: null,
    });
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', date: '2026-05-24', intention: 'paz' }),
      { onConflict: 'user_id,date' },
    );
  });

  it('throws when upsert fails', async () => {
    mockUpsert.mockResolvedValue({ error: new Error('upsert error') });
    await expect(
      saveSpirit('user-1', '2026-05-24', { intention: null, gratitude: [], mood: 7, theme: null, notes: null }),
    ).rejects.toThrow('upsert error');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadReadingBooks, saveReadingBook, saveReadingSession } from './readingService';

const mockOrder = vi.fn();
const mockUpsert = vi.fn();
const mockInsert = vi.fn();
const mockEq = vi.fn();

const chain: Record<string, unknown> = {
  select: () => chain,
  eq: mockEq,
  order: mockOrder,
  upsert: mockUpsert,
  insert: mockInsert,
};
mockEq.mockReturnValue(chain);

vi.mock('./supabase', () => ({ supabase: { from: () => chain } }));

beforeEach(() => vi.clearAllMocks());

describe('loadReadingBooks', () => {
  it('returns books array', async () => {
    mockOrder.mockResolvedValue({ data: [{ id: 'b1', title: 'Duna' }], error: null });
    const result = await loadReadingBooks('u1');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Duna');
  });

  it('throws on error', async () => {
    mockOrder.mockResolvedValue({ data: null, error: new Error('fail') });
    await expect(loadReadingBooks('u1')).rejects.toThrow('fail');
  });
});

describe('saveReadingBook', () => {
  it('calls upsert with user_id', async () => {
    mockUpsert.mockResolvedValue({ error: null });
    await saveReadingBook('u1', { id: 'b1', title: 'Duna' } as never);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1', id: 'b1' }),
      { onConflict: 'user_id,id' },
    );
  });
});

describe('saveReadingSession', () => {
  it('calls insert with user_id', async () => {
    mockInsert.mockResolvedValue({ error: null });
    await saveReadingSession('u1', { id: 's1', book_id: 'b1' } as never);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1', id: 's1' }),
    );
  });
});

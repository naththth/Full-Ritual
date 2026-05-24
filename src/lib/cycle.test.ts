import { describe, expect, it } from 'vitest';
import { cycleInfo, fiveWeekCycle } from './cycle';

describe('cycle', () => {
  it('returns menstrual phase on the start date', () => {
    const info = cycleInfo('2026-05-24', 28, new Date(2026, 4, 24));
    expect(info.day).toBe(1);
    expect(info.phase).toBe('menstrual');
  });

  it('wraps around to day 1 after exactly one full cycle', () => {
    const info = cycleInfo('2026-05-01', 28, new Date(2026, 4, 29));
    expect(info.day).toBe(1);
    expect(info.phase).toBe('menstrual');
  });

  it('is in folicular phase mid-cycle', () => {
    const info = cycleInfo('2026-05-01', 28, new Date(2026, 4, 10));
    expect(info.day).toBe(10);
    expect(info.phase).toBe('folicular');
  });

  it('fiveWeekCycle returns 35 days', () => {
    const days = fiveWeekCycle('2026-05-01', 28);
    expect(days).toHaveLength(35);
    expect(days.filter((d) => d.isToday)).toHaveLength(1);
  });
});

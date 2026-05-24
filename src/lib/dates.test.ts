import { describe, expect, it } from 'vitest';
import {
  isoToday,
  addDays,
  dateFromIso,
  relativeDateLabel,
  weekDaysAround,
  diffMinutes,
  minutesToSleepLabel,
} from './dates';

describe('dates', () => {
  it('isoToday returns YYYY-MM-DD for a given local date', () => {
    const d = new Date(2026, 0, 15, 10, 0, 0);
    expect(isoToday(d)).toBe('2026-01-15');
  });

  it('addDays moves the date forward and backward', () => {
    const base = dateFromIso('2026-01-15');
    expect(isoToday(addDays(base, 1))).toBe('2026-01-16');
    expect(isoToday(addDays(base, -2))).toBe('2026-01-13');
  });

  it('relativeDateLabel returns hoje for today', () => {
    expect(relativeDateLabel(isoToday())).toBe('hoje');
  });

  it('weekDaysAround returns 7 sequential days starting Monday', () => {
    const days = weekDaysAround('2026-01-15');
    expect(days).toHaveLength(7);
    expect(days[0]).toBe('2026-01-12');
    expect(days[6]).toBe('2026-01-18');
  });

  it('diffMinutes handles cross-midnight ranges', () => {
    expect(diffMinutes('22:00', '06:00')).toBe(8 * 60);
    expect(diffMinutes('07:30', '08:00')).toBe(30);
    expect(diffMinutes('', '08:00')).toBeNull();
  });

  it('minutesToSleepLabel formats hours and minutes', () => {
    expect(minutesToSleepLabel(480)).toBe('8h00');
    expect(minutesToSleepLabel(495)).toBe('8h15');
    expect(minutesToSleepLabel(null)).toBe('—');
  });
});

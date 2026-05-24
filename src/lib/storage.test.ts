import { describe, expect, it, beforeEach } from 'vitest';
import { readJson, writeJson, scopedStorageKey, safeStringStorage } from './storage';

describe('storage', () => {
  beforeEach(() => localStorage.clear());

  it('writeJson then readJson roundtrips structured data', () => {
    writeJson('k', { a: 1, b: [2, 3] });
    expect(readJson('k', null)).toEqual({ a: 1, b: [2, 3] });
  });

  it('readJson returns fallback when key is missing', () => {
    expect(readJson('missing', 'fallback')).toBe('fallback');
  });

  it('scopedStorageKey isolates keys per user', () => {
    expect(scopedStorageKey('foo', 'user-1')).toBe('foo::user-1');
    expect(scopedStorageKey('foo', null)).toBe('foo::local');
    expect(scopedStorageKey('foo', 'user-2')).not.toBe(scopedStorageKey('foo', 'user-1'));
  });

  it('safeStringStorage round-trips raw strings', () => {
    safeStringStorage.setItem('x', 'hello');
    expect(safeStringStorage.getItem('x')).toBe('hello');
    safeStringStorage.removeItem('x');
    expect(safeStringStorage.getItem('x')).toBeNull();
  });
});

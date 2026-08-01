import { afterEach, describe, expect, it, vi } from 'vitest';
import { clamp, relativeTime, uid } from './utils';

afterEach(() => {
  vi.useRealTimers();
});

describe('clamp', () => {
  it('keeps values inside the requested range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe('relativeTime', () => {
  it('formats recent timestamps against the current time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-31T12:00:00Z'));

    expect(relativeTime(Date.now() - 20_000)).toBe('just now');
    expect(relativeTime(Date.now() - 15 * 60_000)).toBe('15m ago');
    expect(relativeTime(Date.now() - 3 * 60 * 60_000)).toBe('3h ago');
  });
});

describe('uid', () => {
  it('creates non-empty, distinct local identifiers', () => {
    const first = uid();
    const second = uid();

    expect(first).not.toBe('');
    expect(second).not.toBe(first);
  });
});

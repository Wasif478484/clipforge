import { describe, expect, it } from 'vitest';
import { clamp, formatClock, formatTime } from '../util';

describe('editor utility helpers', () => {
  it('clamps values to the requested range', () => {
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(4, 0, 10)).toBe(4);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it('formats timeline time consistently', () => {
    expect(formatTime(65.42)).toBe('01:05.42');
    expect(formatClock(65)).toBe('1:05');
  });
});

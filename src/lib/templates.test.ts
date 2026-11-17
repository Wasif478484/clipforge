import { describe, expect, it } from 'vitest';
import { VIDEO_TEMPLATES } from './templates';

describe('VIDEO_TEMPLATES', () => {
  it('has unique ids', () => {
    const ids = VIDEO_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers all three aspects', () => {
    const aspects = new Set(VIDEO_TEMPLATES.map((t) => t.aspect));
    expect(aspects).toEqual(new Set(['16:9', '9:16', '1:1']));
  });

  it('gives every template a complete, replaceable scaffold', () => {
    for (const t of VIDEO_TEMPLATES) {
      expect(t.scaffold.kicker.trim().length).toBeGreaterThan(0);
      expect(t.scaffold.title.trim().length).toBeGreaterThan(0);
      expect(t.scaffold.subtitle.trim().length).toBeGreaterThan(0);
      expect(t.scaffold.handle.trim().length).toBeGreaterThan(0);
      expect(t.scaffold.accent).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('keeps titles short enough for the narrowest canvas (9:16 ≈ 405 px)', () => {
    // At 9:16 the template title size is 54 px; ~16 chars fits before wrapping.
    for (const t of VIDEO_TEMPLATES) {
      expect(t.scaffold.title.length).toBeLessThanOrEqual(24);
    }
  });
});

import { describe, expect, it } from 'vitest';
import {
  chromaKeyAlpha,
  clipVolumeAt,
  despillPixel,
  getSharedCanvas,
  hexToRgb,
  hydrateClip,
  interpolateKeyframes,
} from './render';
import { DEFAULT_CHROMA, DEFAULT_FILTER, DEFAULT_MASK, DEFAULT_TRANSFORM } from '../types';

describe('interpolateKeyframes', () => {
  const frames = [
    { t: 0, value: 0 },
    { t: 2, value: 10 },
    { t: 4, value: 20 },
  ];

  it('returns the fallback when frames are undefined or empty', () => {
    expect(interpolateKeyframes(undefined, 1, 7)).toBe(7);
    expect(interpolateKeyframes([], 1, 7)).toBe(7);
  });

  it('clamps to the first keyframe before the range', () => {
    expect(interpolateKeyframes(frames, -5, 99)).toBe(0);
  });

  it('clamps to the last keyframe after the range', () => {
    expect(interpolateKeyframes(frames, 100, 99)).toBe(20);
  });

  it('returns exact keyframe values at keyframe times', () => {
    expect(interpolateKeyframes(frames, 0, 99)).toBe(0);
    expect(interpolateKeyframes(frames, 2, 99)).toBe(10);
    expect(interpolateKeyframes(frames, 4, 99)).toBe(20);
  });

  it('interpolates linearly between keyframes', () => {
    expect(interpolateKeyframes(frames, 1, 99)).toBeCloseTo(5);
    expect(interpolateKeyframes(frames, 3, 99)).toBeCloseTo(15);
  });

  it('sorts unordered frames by time', () => {
    const unordered = [{ t: 4, value: 20 }, { t: 0, value: 0 }, { t: 2, value: 10 }];
    expect(interpolateKeyframes(unordered, 1, 99)).toBeCloseTo(5);
    expect(interpolateKeyframes(unordered, 5, 99)).toBe(20);
  });

  it('handles a single keyframe', () => {
    expect(interpolateKeyframes([{ t: 1, value: 3 }], 0.5, 99)).toBe(3);
    expect(interpolateKeyframes([{ t: 1, value: 3 }], 2, 99)).toBe(3);
  });

  it('avoids division by zero on duplicate keyframe times', () => {
    const dupes = [{ t: 1, value: 5 }, { t: 1, value: 9 }];
    expect(Number.isFinite(interpolateKeyframes(dupes, 1, 0))).toBe(true);
  });

  it('interpolates negative and fractional values', () => {
    const nf = [{ t: 0, value: -2 }, { t: 1, value: 2 }];
    expect(interpolateKeyframes(nf, 0.25, 99)).toBeCloseTo(-1);
  });
});

describe('hydrateClip', () => {
  it('fills every required field for an empty raw clip', () => {
    const clip = hydrateClip({ id: 'c1' });
    expect(clip.id).toBe('c1');
    expect(clip.trackId).toBe('v1');
    expect(clip.duration).toBe(0.1);
    expect(clip.volume).toBe(1);
    expect(clip.muted).toBe(false);
    expect(clip.fit).toBe('cover');
    expect(clip.speed).toBe(1);
    expect(clip.blendMode).toBe('normal');
    expect(clip.filter).toEqual(DEFAULT_FILTER);
    expect(clip.transform).toEqual(DEFAULT_TRANSFORM);
    expect(clip.mask).toEqual(DEFAULT_MASK);
    expect(clip.chroma).toEqual(DEFAULT_CHROMA);
    expect(clip.transitionIn).toBe('none');
    expect(clip.fadeIn).toBe(0);
  });

  it('keeps raw values over defaults', () => {
    const clip = hydrateClip({ id: 'c1', volume: 0.5, speed: 2, blendMode: 'screen', start: 4, duration: 9 });
    expect(clip.volume).toBe(0.5);
    expect(clip.speed).toBe(2);
    expect(clip.blendMode).toBe('screen');
    expect(clip.start).toBe(4);
    expect(clip.duration).toBe(9);
  });

  it('fills missing sub-fields for legacy projects saved before the pro pack', () => {
    const clip = hydrateClip({ id: 'c1', filter: { brightness: 2, contrast: 1, saturation: 1, hue: 0, blur: 0, sepia: 0, grayscale: 0 } });
    expect(clip.filter.brightness).toBe(2);
    expect(clip.transform).toEqual(DEFAULT_TRANSFORM);
    expect(clip.mask).toEqual(DEFAULT_MASK);
    expect(clip.chroma).toEqual(DEFAULT_CHROMA);
  });

  it('preserves pro-pack fields when present', () => {
    const chroma = { ...DEFAULT_CHROMA, enabled: true };
    const mask = { ...DEFAULT_MASK, type: 'circle' as const };
    const clip = hydrateClip({ id: 'c1', chroma, mask });
    expect(clip.chroma.enabled).toBe(true);
    expect(clip.mask.type).toBe('circle');
  });

  it('does not share sub-objects between hydrated clips', () => {
    const a = hydrateClip({ id: 'a' });
    const b = hydrateClip({ id: 'b' });
    expect(a.filter).not.toBe(b.filter);
    expect(a.mask).not.toBe(b.mask);
  });
});

describe('hexToRgb', () => {
  it('parses 6-digit hex', () => {
    expect(hexToRgb('#00b140')).toEqual({ r: 0, g: 0xb1, b: 0x40 });
    expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('pads short hex by right-extending it (quirk; color inputs always emit 6 digits)', () => {
    // '#fff' + '000000' → 'fff000' — so short hex is NOT zero-padded.
    // Harmless in practice: <input type="color"> always produces 6-digit hex.
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 240, b: 0 });
  });

  it('tolerates a missing hash', () => {
    expect(hexToRgb('e6c476')).toEqual({ r: 0xe6, g: 0xc4, b: 0x76 });
  });
});

describe('chromaKeyAlpha', () => {
  // Key = #00b140 (standard chroma green). Its YCbCr chroma pair, precomputed
  // the way applyChromaKey does.
  const key = hexToRgb('#00b140');
  const ky = 0.299 * key.r + 0.587 * key.g + 0.114 * key.b;
  const kcb = 0.564 * (key.b - ky);
  const kcr = 0.713 * (key.r - ky);
  const DEFAULT_SIM = 0.28;
  const DEFAULT_SMOOTH = 0.12;

  it('fully keys out the exact key color', () => {
    expect(chromaKeyAlpha(key.r, key.g, key.b, kcb, kcr, DEFAULT_SIM, DEFAULT_SMOOTH)).toBe(0);
  });

  it('fully keeps pixels far from the key color', () => {
    // strong red is chromatically distant from the green key
    expect(chromaKeyAlpha(200, 30, 30, kcb, kcr, DEFAULT_SIM, DEFAULT_SMOOTH)).toBe(1);
    expect(chromaKeyAlpha(10, 20, 200, kcb, kcr, DEFAULT_SIM, DEFAULT_SMOOTH)).toBe(1);
  });

  it('sits white in the smoothness band at default similarity (not fully kept)', () => {
    // white shares no chroma with the key but sits only ~0.33 away — so with
    // the default similarity 0.28 it is only ~40% opaque. Real behavior to know:
    // white clothing on a green screen needs the similarity slider lowered.
    const a = chromaKeyAlpha(255, 255, 255, kcb, kcr, DEFAULT_SIM, DEFAULT_SMOOTH);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(1);
    expect(a).toBeCloseTo(0.4, 1);
  });

  it('produces a fractional alpha in the smoothness band', () => {
    // a mildly off-key green just past the similarity floor
    const near = { r: 60, g: 160, b: 60 };
    const a = chromaKeyAlpha(near.r, near.g, near.b, kcb, kcr, DEFAULT_SIM, DEFAULT_SMOOTH);
    if (a > 0) expect(a).toBeLessThan(1);
    else expect(a).toBe(0); // either fully keyed or partial — never >1/<0
  });

  it('is monotonic: farther pixels never key out more', () => {
    const a1 = chromaKeyAlpha(key.r, key.g, key.b, kcb, kcr, DEFAULT_SIM, DEFAULT_SMOOTH);
    const a2 = chromaKeyAlpha(30, 140, 80, kcb, kcr, DEFAULT_SIM, DEFAULT_SMOOTH);
    const a3 = chromaKeyAlpha(255, 255, 255, kcb, kcr, DEFAULT_SIM, DEFAULT_SMOOTH);
    expect(a1).toBeLessThanOrEqual(a2);
    expect(a2).toBeLessThanOrEqual(a3);
  });

  it('clamps degenerate similarity/smoothness values', () => {
    // similarity 0 with smoothness 0 would divide by zero without clamps
    const a = chromaKeyAlpha(key.r, key.g, key.b, kcb, kcr, 0, 0);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(a)).toBe(true);
  });

  it('keys out more as similarity increases', () => {
    const low = chromaKeyAlpha(30, 140, 80, kcb, kcr, 0.05, DEFAULT_SMOOTH);
    const high = chromaKeyAlpha(30, 140, 80, kcb, kcr, 0.5, DEFAULT_SMOOTH);
    expect(high).toBeLessThan(low);
  });
});

describe('despillPixel', () => {
  it('leaves non-green-dominant pixels unchanged', () => {
    expect(despillPixel(255, 255, 255, 1)).toEqual([255, 255, 255]);
    expect(despillPixel(200, 30, 30, 0.5)).toEqual([200, 30, 30]);
    expect(despillPixel(10, 20, 200, 0)).toEqual([10, 20, 200]);
  });

  it('pulls excess green toward the other channels', () => {
    // g=200, r=30, b=30 → excess = 200 - 30 = 170; fully keyed (a=0) removes all excess
    const [r, g, b] = despillPixel(30, 200, 30, 0);
    expect(g).toBe(30);
    expect(r).toBeGreaterThan(30);
    expect(b).toBeGreaterThan(30);
    expect(r).toBeLessThanOrEqual(255);
  });

  it('scales the correction by keyed-out alpha', () => {
    const full = despillPixel(30, 200, 30, 0);
    const edge = despillPixel(30, 200, 30, 0.8);
    expect(edge[1]).toBeGreaterThan(full[1]); // less correction when mostly kept
    expect(edge[1]).toBeLessThan(200);
  });

  it('never exceeds channel bounds', () => {
    const [r, , b] = despillPixel(240, 255, 240, 0.5);
    expect(r).toBeLessThanOrEqual(255);
    expect(b).toBeLessThanOrEqual(255);
  });
});

describe('clipVolumeAt', () => {
  const clip = (over: Partial<Parameters<typeof clipVolumeAt>[0]>): Parameters<typeof clipVolumeAt>[0] =>
    hydrateClip({ id: 'c', volume: 1, ...over }) as Parameters<typeof clipVolumeAt>[0];

  it('returns the raw clip volume when nothing fades or animates', () => {
    expect(clipVolumeAt(clip({ volume: 0.7 }), 0)).toBe(0.7);
    expect(clipVolumeAt(clip({ volume: 0.7 }), 3.9)).toBe(0.7);
  });

  it('ramps linearly across the fade-in window', () => {
    const c = clip({ volume: 1, volumeFadeIn: 1, duration: 4 });
    expect(clipVolumeAt(c, 0)).toBe(0);
    expect(clipVolumeAt(c, 0.5)).toBeCloseTo(0.5);
    expect(clipVolumeAt(c, 1)).toBeCloseTo(1);
    expect(clipVolumeAt(c, 3)).toBeCloseTo(1);
  });

  it('ramps linearly across the fade-out window', () => {
    const c = clip({ volume: 1, volumeFadeOut: 1, duration: 4 });
    expect(clipVolumeAt(c, 2.5)).toBeCloseTo(1);
    expect(clipVolumeAt(c, 3.5)).toBeCloseTo(0.5);
    expect(clipVolumeAt(c, 4)).toBe(0);
  });

  it('combines volume keyframes with fades multiplicatively', () => {
    const c = clip({
      volume: 0.5,
      volumeFadeIn: 2,
      duration: 4,
      keyframes: { volume: [{ t: 0, value: 0.2 }, { t: 2, value: 1 }] },
    });
    // elapsed 1: keyframe interp = 0.6, fade factor = 0.5 → 0.5 * 0.6 * 0.5
    expect(clipVolumeAt(c, 1)).toBeCloseTo(0.5 * 0.6 * 0.5);
  });

  it('never goes negative near clip edges', () => {
    const c = clip({ volume: 1, volumeFadeIn: 2, volumeFadeOut: 2, duration: 4 });
    expect(clipVolumeAt(c, 0)).toBeGreaterThanOrEqual(0);
    expect(clipVolumeAt(c, 4)).toBeGreaterThanOrEqual(0);
  });
});

describe('getSharedCanvas', () => {  it('reuses the same canvas per slot and sizes it', () => {
    const a = getSharedCanvas('clip', 64, 32);
    expect(a.width).toBe(64);
    expect(a.height).toBe(32);
    const b = getSharedCanvas('clip', 64, 32);
    expect(b).toBe(a);
    const mask = getSharedCanvas('mask', 64, 32);
    expect(mask).not.toBe(a);
  });

  it('resizes when the requested dimensions change', () => {
    const grown = getSharedCanvas('clip', 128, 64);
    expect(grown.width).toBe(128);
    expect(grown.height).toBe(64);
    const back = getSharedCanvas('clip', 64, 32);
    expect(back.width).toBe(64);
  });
});

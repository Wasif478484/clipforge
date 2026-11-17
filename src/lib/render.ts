// Pure render-pipeline helpers extracted from App.tsx so they can be unit
// tested without a real canvas. Canvas-dependent parts stay here too; tests
// cover the pure math (see render.test.ts).
import type { Clip, ClipMask, ChromaKey } from '../types';
import { DEFAULT_CHROMA, DEFAULT_FILTER, DEFAULT_MASK, DEFAULT_TRANSFORM } from '../types';

/** Fill in fields added after a project was saved, so old files stay loadable. */
export const hydrateClip = (raw: Partial<Clip>): Clip => {
  const base: Clip = {
    id: '', assetId: '', trackId: 'v1', name: '', start: 0, duration: 0.1,
    trimStart: 0, trimEnd: 0, volume: 1, muted: false, fit: 'cover',
    filter: { ...DEFAULT_FILTER }, transform: { ...DEFAULT_TRANSFORM },
    blendMode: 'normal', mask: { ...DEFAULT_MASK }, chroma: { ...DEFAULT_CHROMA },
    speed: 1, transitionIn: 'none', transitionOut: 'none',
    fadeIn: 0, fadeOut: 0, volumeFadeIn: 0, volumeFadeOut: 0,
  };
  return {
    ...base, ...raw,
    filter: raw.filter ?? base.filter,
    transform: raw.transform ?? base.transform,
    mask: raw.mask ?? base.mask,
    chroma: raw.chroma ?? base.chroma,
  };
};

/** Linear interpolation over `{ t, value }` keyframes; clamps outside the range. */
export function interpolateKeyframes(
  frames: { t: number; value: number }[] | undefined,
  t: number,
  fallback: number,
): number {
  if (!frames?.length) return fallback;
  const sorted = [...frames].sort((a, b) => a.t - b.t);
  if (t <= sorted[0].t) return sorted[0].value;
  const last = sorted[sorted.length - 1];
  if (t >= last.t) return last.value;
  const nextIndex = sorted.findIndex((frame) => frame.t >= t);
  const next = sorted[nextIndex];
  const prev = sorted[nextIndex - 1];
  const p = (t - prev.t) / Math.max(0.0001, next.t - prev.t);
  return prev.value + (next.value - prev.value) * p;
}

// Reused offscreen canvases for the chroma-key / mask render path
// (per-frame allocation would thrash the GC).
let sharedClipCanvas: HTMLCanvasElement | null = null;
let sharedMaskCanvas: HTMLCanvasElement | null = null;

export function getSharedCanvas(which: 'clip' | 'mask', w: number, h: number): HTMLCanvasElement {
  let canvas = which === 'clip' ? sharedClipCanvas : sharedMaskCanvas;
  if (!canvas) {
    canvas = document.createElement('canvas');
    if (which === 'clip') sharedClipCanvas = canvas;
    else sharedMaskCanvas = canvas;
  }
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return canvas;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = Number.parseInt((hex.replace('#', '') + '000000').slice(0, 6), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * Key alpha for one pixel: 0 = fully keyed out, 1 = fully kept. YCbCr
 * chroma distance against the key color, normalized to 0..1 with a
 * similarity floor and a smoothness ramp. `kcb`/`kcr` are the key color's
 * precomputed chroma values (see applyChromaKey).
 */
export function chromaKeyAlpha(
  r: number, g: number, b: number,
  kcb: number, kcr: number,
  similarity: number, smoothness: number,
): number {
  const sim = Math.max(0.01, similarity);
  const smooth = Math.max(0.02, smoothness);
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const dist = Math.hypot(0.564 * (b - y) - kcb, 0.713 * (r - y) - kcr) / 255;
  return Math.max(0, Math.min(1, (dist - sim) / smooth));
}

/** Reduce green spill on a keyed pixel's edge; returns unchanged rgb when clean. */export function despillPixel(r: number, g: number, b: number, alpha: number): [number, number, number] {
  const spill = Math.min(g, Math.max(r, b));
  const excess = g - spill;
  if (excess <= 0) return [r, g, b];
  // pull green toward the nearest other channel on keyed edges
  return [
    Math.min(255, r + excess * (1 - alpha) * 0.5),
    g - excess * (1 - alpha),
    Math.min(255, b + excess * (1 - alpha) * 0.5),
  ];
}

/**
 * Per-clip volume envelope `elapsed` seconds into the clip — same math as the
 * live playback path (applyGains): clip volume × volume keyframes × in/out
 * volume fades. Mute/track-mute filtering is the caller's job.
 */
export function clipVolumeAt(clip: Clip, elapsed: number): number {
  let vol = clip.volume;
  vol *= interpolateKeyframes(clip.keyframes?.volume, elapsed, 1);
  if (clip.volumeFadeIn > 0 && elapsed < clip.volumeFadeIn) {
    vol *= Math.max(0, elapsed / clip.volumeFadeIn);
  }
  const remaining = clip.duration - elapsed;
  if (clip.volumeFadeOut > 0 && remaining < clip.volumeFadeOut) {
    vol *= Math.max(0, remaining / clip.volumeFadeOut);
  }
  return vol;
}

/** Chroma-key the pixels of `ctx`'s canvas in place against `chroma.color` (YCbCr distance). */
export function applyChromaKey(ctx: CanvasRenderingContext2D, chroma: ChromaKey): void {
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const key = hexToRgb(chroma.color);
  const ky = 0.299 * key.r + 0.587 * key.g + 0.114 * key.b;
  const kcb = 0.564 * (key.b - ky);
  const kcr = 0.713 * (key.r - ky);
  for (let i = 0; i < d.length; i += 4) {
    const a0 = d[i + 3];
    if (a0 === 0) continue;
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const a = chromaKeyAlpha(r, g, b, kcb, kcr, chroma.similarity, chroma.smoothness);
    if (a >= 1) continue;
    if (chroma.despill) {
      const [nr, ng, nb] = despillPixel(r, g, b, a);
      d[i] = nr;
      d[i + 1] = ng;
      d[i + 2] = nb;
    }
    d[i + 3] = Math.round(a0 * a);
  }
  ctx.putImageData(img, 0, 0);
}

/** Apply `mask` to `buf` in place: destination-in/out against a feathered shape. */
export function applyClipMask(buf: HTMLCanvasElement, mask: ClipMask): void {
  const w = buf.width;
  const h = buf.height;
  const m = getSharedCanvas('mask', w, h);
  const mctx = m.getContext('2d');
  const bctx = buf.getContext('2d');
  if (!mctx || !bctx) return;
  mctx.clearRect(0, 0, w, h);
  mctx.filter = mask.feather > 0 && mask.type !== 'linear' ? `blur(${Math.max(1, mask.feather * Math.min(w, h) * 0.12)}px)` : 'none';
  mctx.fillStyle = '#fff';
  if (mask.type === 'circle') {
    mctx.beginPath();
    mctx.arc(w / 2, h / 2, Math.min(w, h) * 0.42, 0, Math.PI * 2);
    mctx.fill();
  } else if (mask.type === 'rect') {
    const iw = w * 0.7;
    const ih = h * 0.7;
    mctx.fillRect((w - iw) / 2, (h - ih) / 2, iw, ih);
  } else if (mask.type === 'linear') {
    // linear masks feather through the gradient itself, angle-controlled
    const rad = (mask.angle * Math.PI) / 180;
    const len = Math.hypot(w, h);
    const cx = w / 2;
    const cy = h / 2;
    const grad = mctx.createLinearGradient(
      cx - (Math.cos(rad) * len) / 2, cy - (Math.sin(rad) * len) / 2,
      cx + (Math.cos(rad) * len) / 2, cy + (Math.sin(rad) * len) / 2,
    );
    const e = Math.min(0.96, Math.max(0.04, mask.feather));
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.5 - e / 2, 'rgba(255,255,255,1)');
    grad.addColorStop(0.5 + e / 2, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    mctx.fillStyle = grad;
    mctx.fillRect(0, 0, w, h);
  }
  mctx.filter = 'none';
  bctx.save();
  bctx.globalCompositeOperation = mask.invert ? 'destination-out' : 'destination-in';
  bctx.drawImage(m, 0, 0);
  bctx.restore();
}

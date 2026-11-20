// The frame renderer: the deep compositor module. One call renders a whole
// frame (clips, transitions, keyframes, chroma/mask, text + captions) onto
// a canvas at time `t`. Shared state (filter cache, offscreen canvases) is
// module-private. Extracted from App.tsx's drawFrame - behavior identical.
import type { Caption, Clip, MediaAsset, TextOverlay, TrackSettingsMap } from '../types';
import { applyChromaKey, applyClipMask, getSharedCanvas, interpolateKeyframes } from './render';

interface FrameState {
  clips: Clip[];
  texts: TextOverlay[];
  captions: Caption[];
  assets: MediaAsset[];
  trackSettings: TrackSettingsMap;
}

export interface RenderFrameOptions {
  canvas: HTMLCanvasElement;
  t: number;
  state: FrameState;
  mediaEls: Map<string, HTMLAudioElement | HTMLImageElement | HTMLVideoElement>;
}

// Reused per filter string - canvas `filter` parsing is expensive.
const filterCache = new Map<string, string>();

/** Composite the whole timeline onto `canvas` at time `t`.
 *  Pure with respect to the passed state: no zustand, no refs. */
export function renderFrame(opts: RenderFrameOptions): void {
  const { canvas, state, mediaEls, t } = opts;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    const { clips: clipList, texts: textList, captions, assets: assetList } = state;
    const canvasBg = getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim() || 'black';
    ctx.fillStyle = canvasBg;
    ctx.fillRect(0, 0, W, H);
    const filterFor = (filter: Clip['filter']): string => {
      const filterKey = `${filter.brightness}|${filter.contrast}|${filter.saturation}|${filter.hue}|${filter.blur}|${filter.sepia}|${filter.grayscale}`;
      let filterValue = filterCache.get(filterKey);
      if (!filterValue) {
        filterValue = `brightness(${filter.brightness}) contrast(${filter.contrast}) saturate(${filter.saturation}) hue-rotate(${filter.hue}deg) blur(${filter.blur}px) sepia(${filter.sepia}) grayscale(${filter.grayscale})`;
        filterCache.set(filterKey, filterValue);
      }
      return filterValue;
    };
    // Composite `el` for `clip` onto ctx. `dx` = transition slide offset,
    // `elapsed` = seconds into the clip (drives scale keyframes).
    const drawRaw = (clip: Clip, el: HTMLVideoElement | HTMLImageElement, dx: number, elapsed: number) => {
      const ready = el instanceof HTMLImageElement
        ? el.complete && el.naturalWidth > 0
        : el instanceof HTMLVideoElement && el.readyState >= 2;
      if (!ready) return;
      const iw = el instanceof HTMLImageElement ? el.naturalWidth : el.videoWidth;
      const ih = el instanceof HTMLImageElement ? el.naturalHeight : el.videoHeight;
      if (!iw || !ih) return;
      const tr = clip.transform;
      const fitScale = clip.fit === 'cover' ? Math.max(W / iw, H / ih) : Math.min(W / iw, H / ih);
      const scale = fitScale * tr.scale * Math.max(0.01, interpolateKeyframes(clip.keyframes?.scale, elapsed, 1));
      const cx = W / 2 + tr.x * (W / 2) + dx;
      const cy = H / 2 + tr.y * (H / 2);
      const compose = (target: CanvasRenderingContext2D, img: CanvasImageSource, sw: number, sh: number, k: number) => {
        target.save();
        target.translate(cx, cy);
        if (tr.rotation) target.rotate((tr.rotation * Math.PI) / 180);
        target.scale(tr.flipH ? -k : k, k);
        target.filter = filterFor(clip.filter);
        target.drawImage(img, -sw / 2, -sh / 2, sw, sh);
        target.filter = 'none';
        target.restore();
      };
      // Blend mode is part of drawRaw's own save/restore so the caller's
      // globalAlpha and any transition ctx.clip() survive untouched.
      ctx.save();
      ctx.globalCompositeOperation = clip.blendMode === 'normal' ? 'source-over' : clip.blendMode;
      if (!clip.chroma.enabled && clip.mask.type === 'none') {
        // Fast path: straight onto the composite canvas.
        compose(ctx, el, iw, ih, scale);
        ctx.restore();
        return;
      }
      // Buffer path: chroma key and/or mask operate on the fitted frame in
      // source space on a shared offscreen canvas, then the result is
      // composed with the user transform. Grading happens at composite time
      // so the key is computed on ungraded pixels.
      const buf = getSharedCanvas('clip', W, H);
      const bctx = buf.getContext('2d');
      if (!bctx) { ctx.restore(); return; }
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.clearRect(0, 0, W, H);
      bctx.drawImage(el, (W - iw * fitScale) / 2, (H - ih * fitScale) / 2, iw * fitScale, ih * fitScale);
      if (clip.chroma.enabled) applyChromaKey(bctx, clip.chroma);
      if (clip.mask.type !== 'none') applyClipMask(buf, clip.mask);
      compose(ctx, buf, W, H, tr.scale);
      ctx.restore();
    };
    for (const trackId of ['v1', 'v2']) {
      const active = clipList
        .filter((c) => c.trackId === trackId && !state.trackSettings[c.trackId]?.hidden && t >= c.start && t < c.start + c.duration)
        .sort((a, b) => a.start - b.start);
      const drawn = new Set<string>();
      for (const clip of active) {
        if (drawn.has(clip.id)) continue;
        const asset = assetList.find((a) => a.id === clip.assetId);
        if (!asset) continue;
        const el = mediaEls.get(clip.assetId);
        if (!el || el instanceof HTMLAudioElement) continue;
        const pic = el as HTMLVideoElement | HTMLImageElement;
        const elapsed = t - clip.start;
        // Visual fade durations from the clip fields; 0 keeps the legacy 0.35s auto fade.
        const inDur = clip.fadeIn > 0 ? clip.fadeIn : 0.35;
        const outDur = clip.fadeOut > 0 ? clip.fadeOut : 0.35;
        // Crossfade: during the overlap window, dissolve the outgoing clip
        // (same track, started earlier, still covering t) out while the
        // incoming clip dissolves in.
        if ((clip.transitionIn === 'crossfade' || clip.transitionIn === 'dissolve') && elapsed < inDur) {
          const p = Math.max(0, elapsed / inDur);
          const outgoing = active.find(
            (c) => c.id !== clip.id && !drawn.has(c.id) && c.start < clip.start && c.start + c.duration > t,
          );
          if (outgoing) {
            const oAsset = assetList.find((a) => a.id === outgoing.assetId);
            const oEl = oAsset ? (mediaEls.get(outgoing.assetId) as HTMLVideoElement | HTMLImageElement | undefined) : undefined;
            if (oEl) {
              drawn.add(outgoing.id);
              ctx.save();
              ctx.globalAlpha = Math.max(0, 1 - p);
              drawRaw(outgoing, oEl, 0, t - outgoing.start);
              ctx.restore();
            }
          }
          drawn.add(clip.id);
          ctx.save();
          ctx.globalAlpha = Math.max(0, Math.min(1, p));
          drawRaw(clip, pic, 0, elapsed);
          ctx.restore();
          continue;
        }
        let alpha = 1;
        alpha *= Math.max(0, Math.min(1, interpolateKeyframes(clip.keyframes?.opacity, elapsed, 1)));
        if (clip.transitionIn === 'fade' || clip.transitionIn === 'slide' || clip.transitionIn === 'wipe-left' || clip.transitionIn === 'push-up' || clip.transitionIn === 'zoom-in') {
          if (elapsed < inDur) alpha *= Math.max(0, elapsed / inDur);
        }
        if (clip.transitionOut === 'fade') {
          if (clip.start + clip.duration - t < outDur) alpha *= Math.max(0, (clip.start + clip.duration - t) / outDur);
        }
        let dx = 0;
        let transform: { type: 'wipe' | 'push' | 'zoom'; p: number } | null = null;
        if (clip.transitionIn !== 'none' && elapsed < inDur) {
          const p = Math.max(0, elapsed / inDur);
          if (clip.transitionIn === 'slide') {
            dx = (1 - p) * (W * 0.12);
          } else if (clip.transitionIn === 'wipe-left') {
            transform = { type: 'wipe', p };
          } else if (clip.transitionIn === 'push-up') {
            transform = { type: 'push', p };
          } else if (clip.transitionIn === 'zoom-in') {
            transform = { type: 'zoom', p };
          }
        }
        drawn.add(clip.id);
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        if (transform) {
          if (transform.type === 'wipe') {
            // wipe-left: reveal from the right edge leftwards while sliding slightly
            const halfW = (W / 2) * transform.p;
            ctx.beginPath();
            ctx.rect(W / 2 - halfW, 0, halfW * 2, H);
            ctx.clip();
            dx = (1 - transform.p) * (W * 0.08);
          } else if (transform.type === 'push') {
            // push-up: incoming slides from the bottom, outgoing pushed up off-frame
            const outgoing = active.find(
              (c) => c.id !== clip.id && !drawn.has(c.id) && c.start < clip.start && c.start + c.duration > t,
            );
            if (outgoing) {
              const oAsset = assetList.find((a) => a.id === outgoing.assetId);
              const oEl = oAsset ? (mediaEls.get(outgoing.assetId) as HTMLVideoElement | HTMLImageElement | undefined) : undefined;
              if (oEl) {
                drawn.add(outgoing.id);
                const off = (1 - transform.p) * H * 0.25;
                ctx.save();
                ctx.globalAlpha = 1;
                ctx.translate(0, -off);
                drawRaw(outgoing, oEl, 0, t - outgoing.start);
                ctx.restore();
              }
            }
            ctx.save();
            ctx.globalAlpha = Math.min(1, alpha + transform.p); // stay opaque while moving
            ctx.globalAlpha = 1;
            const rise = (1 - transform.p) * H * 0.6;
            ctx.translate(0, rise);
            drawRaw(clip, pic, 0, elapsed);
            ctx.restore();
            continue;
          } else if (transform.type === 'zoom') {
            // zoom-in: scale 1.25 → 1 while fading in
            const s = 1 + (1 - transform.p) * 0.25;
            ctx.translate(W / 2, H / 2);
            ctx.scale(s, s);
            ctx.translate(-W / 2, -H / 2);
          }
        }
        drawRaw(clip, pic, dx, elapsed);
        ctx.restore();
      }
    }
    for (const overlay of textList) {
      if (t < overlay.start || t >= overlay.start + overlay.duration) continue;
      const progress = (t - overlay.start) / overlay.duration;
      const scale = H / 720;
      const size = overlay.size * scale;
      const lineHeight = size * 1.18;
      let x = overlay.x * W;
      let y = overlay.y * H;
      let alpha = 1;
      let textScale = 1;
      const anim = overlay.animation ?? 'none';
      if (anim === 'fade') {
        if (progress < 0.15) alpha = progress / 0.15;
        if (progress > 0.85) alpha = (1 - progress) / 0.15;
      } else if (anim === 'slide-up') {
        if (progress < 0.2) { const p = progress / 0.2; alpha = p; y += (1 - p) * 40; }
        if (progress > 0.85) alpha = (1 - progress) / 0.15;
      } else if (anim === 'slide-left') {
        if (progress < 0.2) { const p = progress / 0.2; alpha = p; x += (1 - p) * 60; }
        if (progress > 0.85) alpha = (1 - progress) / 0.15;
      } else if (anim === 'pop') {
        if (progress < 0.15) {
          const p = progress / 0.15;
          alpha = p;
          // overshoot: 0.6 → 1.1 → 1 across the window
          textScale = p < 0.6 ? 0.6 + (p / 0.6) * 0.5 : 1.1 - ((p - 0.6) / 0.4) * 0.1;
        }
        if (progress > 0.85) alpha = (1 - progress) / 0.15;
      } else if (anim === 'bounce') {
        if (progress < 0.25) { const p = progress / 0.25; alpha = Math.min(1, p * 2); y -= Math.sin(p * Math.PI) * 30; }
        if (progress > 0.85) alpha = (1 - progress) / 0.15;
      } else if (anim === 'scale-in') {
        if (progress < 0.2) { const p = progress / 0.2; alpha = p; textScale = 0.5 + p * 0.5; }
        if (progress > 0.85) alpha = (1 - progress) / 0.15;
      } else if (anim === 'glitch') {
        if (progress < 0.1) alpha = progress / 0.1;
        if (progress > 0.9) alpha = (1 - progress) / 0.1;
        x += (Math.random() - 0.5) * (progress < 0.3 ? 4 : 0);
      } else if (anim === 'neon-flicker') {
        if (progress < 0.3) alpha = Math.random() > 0.3 ? 1 : 0.3;
        else alpha = 1;
        if (progress > 0.9) alpha = (1 - progress) / 0.1;
      }
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      if (textScale !== 1) {
        ctx.translate(x, y);
        ctx.scale(textScale, textScale);
        ctx.translate(-x, -y);
      }
      ctx.font = `800 ${size}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(2, size * 0.16);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.62)';
      ctx.fillStyle = overlay.color;
      let displayText = overlay.text;
      if (anim === 'typewriter') {
        const chars = Math.floor(progress * overlay.text.length);
        displayText = overlay.text.slice(0, chars);
      } else if (anim === 'word-reveal') {
        const words = overlay.text.split(' ');
        const visibleWords = Math.floor(progress * words.length);
        displayText = words.slice(0, visibleWords).join(' ');
      }
      const displayLines = displayText.split('\n');
      displayLines.forEach((line: string, i: number) => {
        const ly = y + (i - (displayLines.length - 1) / 2) * lineHeight;
        ctx.strokeText(line, x, ly);
        ctx.fillText(line, x, ly);
      });
      ctx.restore();
    }
    for (const caption of captions) {
      if (t < caption.start || t >= caption.start + caption.duration) continue;
      const scale = H / 720;
      const lines = caption.text.split('\n');
      ctx.save();
      ctx.font = `700 ${Math.max(18, 30 * scale)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lineHeight = 38 * scale;
      const boxWidth = Math.min(W * 0.88, Math.max(...lines.map((line) => ctx.measureText(line).width)) + 36 * scale);
      const boxHeight = lines.length * lineHeight + 20 * scale;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
      ctx.fillRect((W - boxWidth) / 2, H - boxHeight - 36 * scale, boxWidth, boxHeight);
      ctx.fillStyle = '#fff';
      lines.forEach((line, index) => ctx.fillText(line, W / 2, H - boxHeight / 2 - 36 * scale + index * lineHeight));
      ctx.restore();
    }
}

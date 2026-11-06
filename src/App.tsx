import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TopBar, { type ExportQuality } from './components/TopBar';
import MediaPanel from './components/MediaPanel';
import Stage from './components/Stage';
import Inspector from './components/Inspector';
import Timeline from './components/Timeline';
import ImageEditor from './components/ImageEditor';
import ErrorBoundary from './components/ErrorBoundary';
import Dashboard, { VIDEO_TEMPLATES } from './components/Dashboard';
import LandingPage from './landing/LandingPage';
import { putRecentProject, type RecentProject } from './lib/recent';
import { loadSettings } from './lib/settings';
import { captureAssetThumb, createMediaElement, blobToDataURL, generateSampleImage, generateSampleVideo, probeAsset, revokeAssetUrl, revokeAllAssetUrls } from './media';
import { clamp, downloadBlob, pickSupportedMime, uid } from './util';
import type { Aspect, Clip, MediaAsset, MediaKind, Selection, TextOverlay } from './types';
import { CANVAS_SIZE, DEFAULT_FILTER } from './types';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { parseProjectData } from './lib/project';
import { getStorageDiagnostics, type StorageDiagnostics } from './lib/storage';

export default function App() {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [texts, setTexts] = useState<TextOverlay[]>([]);
  const [projectName, setProjectName] = useState('Untitled project');
  const [aspect, setAspect] = useState<Aspect>(() => loadSettings().defaultAspect);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pxPerSec, setPxPerSec] = useState(45);
  const [toast, setToast] = useState<string | null>(null);
  const [storageStatus, setStorageStatus] = useState<StorageDiagnostics | null>(null);
  const [generatingSample, setGeneratingSample] = useState(false);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [mp4Busy, setMp4Busy] = useState(false);
  const [waveforms, setWaveforms] = useState<Record<string, number[]>>({});
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  const [mode, setMode] = useState<'home' | 'video' | 'image' | 'dashboard'>('home');
  const [imageSource, setImageSource] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string>('image');


  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaEls = useRef(new Map<string, HTMLVideoElement | HTMLAudioElement | HTMLImageElement>());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const exportDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const sourceByAsset = useRef(new Map<string, MediaElementAudioSourceNode>());
  const gainByClip = useRef(new Map<string, GainNode>());
  const exportRecorderRef = useRef<MediaRecorder | null>(null);
  const exportCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const exportCancelledRef = useRef(false);
  const lastUiTimeRef = useRef(-1);
  const filterCacheRef = useRef(new Map<string, string>());
  const warnedBlurRef = useRef(new Set<string>());

  const rafRef = useRef(0);
  const startStampRef = useRef(0);
  const startOffsetRef = useRef(0);
  const currentTimeRef = useRef(0);
  const playingRef = useRef(false);

  const historyRef = useRef<{ past: string[]; present: string; future: string[] }>({ past: [], present: '', future: [] });
  const skipHistoryRef = useRef(false);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const clipboardRef = useRef<Clip[]>([]);
  const stateRef = useRef({ assets, clips, texts, duration: 0 });

  const interpolateKeyframes = (frames: { t: number; value: number }[] | undefined, t: number, fallback: number): number => {
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
  };


  const duration = useMemo(
    () => Math.max(0, ...clips.map((c) => c.start + c.duration), ...texts.map((t) => t.start + t.duration)),
    [clips, texts],
  );
  // Keep the shared snapshot outside render — callbacks read it via ref.
  useEffect(() => {
    stateRef.current = { assets, clips, texts, duration };
  });

  // Undo/redo history tracking.
  const snapshot = useCallback(() => JSON.stringify({
    projectName, aspect, clips, texts,
  }), [projectName, aspect, clips, texts]);

  useEffect(() => {
    if (skipHistoryRef.current) { skipHistoryRef.current = false; return; }
    const h = historyRef.current;
    const snap = snapshot();
    if (h.present && h.present !== snap) {
      h.past = [...h.past, h.present].slice(-60);
      h.present = snap;
      h.future = [];
    } else if (!h.present) {
      h.present = snap;
    }
  }, [clips, texts, projectName, aspect, snapshot]);

  const assetKindById = useMemo(() => {
    const map: Record<string, MediaKind | undefined> = {};
    for (const a of assets) map[a.id] = a.kind;
    return map;
  }, [assets]);

  useEffect(() => {
    let cancelled = false;
    for (const asset of assets) {
      if (asset.kind === 'audio' || thumbs[asset.id]) continue;
      void captureAssetThumb(asset).then((thumb) => {
        if (!cancelled && thumb) setThumbs((prev) => ({ ...prev, [asset.id]: thumb }));
      });
    }
    return () => { cancelled = true; };
  }, [assets, thumbs]);

  const showToast = useCallback((message: string) => setToast(message), []);

  // Decode audio waveforms for assets that may contain an audio track.
  useEffect(() => {
    const audioAssets = assets.filter((a) => a.kind === 'audio' || a.kind === 'video');
    if (audioAssets.length === 0) return;
    let cancelled = false;
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    (async () => {
      for (const asset of audioAssets) {
        if (waveforms[asset.id]) continue;
        try {
          const res = await fetch(asset.url);
          const buf = await res.arrayBuffer();
          const audioBuf = await ctx.decodeAudioData(buf);
          const data = audioBuf.getChannelData(0);
          const buckets = 80;
          const bucketSize = Math.floor(data.length / buckets);
          const peaks: number[] = [];
          for (let i = 0; i < buckets; i++) {
            let max = 0;
            for (let j = 0; j < bucketSize; j++) {
              const v = Math.abs(data[i * bucketSize + j] ?? 0);
              if (v > max) max = v;
            }
            peaks.push(max);
          }
          if (!cancelled) {
            setWaveforms((prev) => ({ ...prev, [asset.id]: peaks }));
          }
        } catch {
          // ignore decode errors
        }
      }
      await ctx.close();
    })();
    return () => { cancelled = true; };
  }, [assets, waveforms]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(id);
  }, [toast]);

  /* ------------------------------------------------ audio graph ------------------------------------------------ */

  const ensureAudioGraph = useCallback((): AudioContext => {
    if (!audioCtxRef.current) {
      const AC = window.AudioContext
        ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = 1;
      master.connect(ctx.destination);
      audioCtxRef.current = ctx;
      masterGainRef.current = master;
    }
    if (audioCtxRef.current.state === 'suspended') void audioCtxRef.current.resume();
    return audioCtxRef.current;
  }, []);

  /** Create/reuse one GainNode per clip, wired asset source → clip gain → master bus. */
  const syncAudioGraph = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const master = masterGainRef.current;
    if (!master) return;

    const seen = new Set<string>();
    for (const clip of stateRef.current.clips) {
      const asset = stateRef.current.assets.find((a) => a.id === clip.assetId);
      if (!asset || asset.kind === 'image') continue;
      const el = mediaEls.current.get(clip.assetId);
      if (!el || el instanceof HTMLImageElement) continue;

      let source = sourceByAsset.current.get(clip.assetId);
      if (!source) {
        source = ctx.createMediaElementSource(el);
        sourceByAsset.current.set(clip.assetId, source);
      }

      if (!gainByClip.current.has(clip.id)) {
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, ctx.currentTime);
        source.connect(gain);
        gain.connect(master);
        gainByClip.current.set(clip.id, gain);
      }
      seen.add(clip.id);
    }
    for (const [id, gain] of [...gainByClip.current]) {
      if (!seen.has(id)) {
        gain.disconnect();
        gainByClip.current.delete(id);
      }
    }
  }, []);

  const applyGains = useCallback((t: number) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const clip of stateRef.current.clips) {
      const gain = gainByClip.current.get(clip.id);
      if (!gain) continue;
      const active = t >= clip.start && t < clip.start + clip.duration;
      let vol = active && !clip.muted ? clip.volume : 0;
      if (active && !clip.muted) {
        const elapsed = t - clip.start;
        const remaining = clip.start + clip.duration - t;
        vol *= Math.max(0, interpolateKeyframes(clip.keyframes?.volume, elapsed, 1));
        if (clip.volumeFadeIn > 0 && elapsed < clip.volumeFadeIn) {
          vol *= Math.max(0, elapsed / clip.volumeFadeIn);
        }
        if (clip.volumeFadeOut > 0 && remaining < clip.volumeFadeOut) {
          vol *= Math.max(0, remaining / clip.volumeFadeOut);
        }
      }
      gain.gain.setTargetAtTime(vol, now, 0.03);
    }
  }, []);

  useEffect(() => {
    syncAudioGraph();
    applyGains(currentTimeRef.current);
  }, [clips, assets, syncAudioGraph, applyGains]);

  useEffect(() => {
    for (const clip of clips) {
      if (clip.filter.blur > 2 && !warnedBlurRef.current.has(clip.id)) {
        warnedBlurRef.current.add(clip.id);
        showToast('Blur above 2px may reduce preview and export performance.');
      }
    }
  }, [clips, showToast]);

  /* ------------------------------------------------ rendering ------------------------------------------------ */

  const drawFrame = useCallback((t: number) => {
    const canvas = exportCanvasRef.current ?? canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    const { clips: clipList, texts: textList, assets: assetList } = stateRef.current;

    const canvasBg = getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim() || 'black';
    ctx.fillStyle = canvasBg;
    ctx.fillRect(0, 0, W, H);

    const drawFitted = (el: HTMLVideoElement | HTMLImageElement, fit: Clip['fit'], filter: Clip['filter'], dx = 0) => {
      const iw = el instanceof HTMLImageElement ? el.naturalWidth : el.videoWidth;
      const ih = el instanceof HTMLImageElement ? el.naturalHeight : el.videoHeight;
      if (!iw || !ih) return;
      const scale = fit === 'cover' ? Math.max(W / iw, H / ih) : Math.min(W / iw, H / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      const filterKey = `${filter.brightness}|${filter.contrast}|${filter.saturation}|${filter.hue}|${filter.blur}|${filter.sepia}|${filter.grayscale}`;
      let filterValue = filterCacheRef.current.get(filterKey);
      if (!filterValue) {
        filterValue = `brightness(${filter.brightness}) contrast(${filter.contrast}) saturate(${filter.saturation}) hue-rotate(${filter.hue}deg) blur(${filter.blur}px) sepia(${filter.sepia}) grayscale(${filter.grayscale})`;
        filterCacheRef.current.set(filterKey, filterValue);
      }
      ctx.filter = filterValue;
      ctx.drawImage(el, (W - dw) / 2 + dx, (H - dh) / 2, dw, dh);
      ctx.filter = 'none';
    };

    const drawRaw = (clip: Clip, el: HTMLVideoElement | HTMLImageElement, dx: number) => {
      if (el instanceof HTMLImageElement) {
        if (el.complete && el.naturalWidth) drawFitted(el, clip.fit, clip.filter, dx);
      } else if (el instanceof HTMLVideoElement) {
        if (el.readyState >= 2) drawFitted(el, clip.fit, clip.filter, dx);
      }
    };

    for (const trackId of ['v1', 'v2']) {
      const active = clipList
        .filter((c) => c.trackId === trackId && t >= c.start && t < c.start + c.duration)
        .sort((a, b) => a.start - b.start);
      const drawn = new Set<string>();
      for (const clip of active) {
        if (drawn.has(clip.id)) continue;
        const asset = assetList.find((a) => a.id === clip.assetId);
        if (!asset) continue;
        const el = mediaEls.current.get(clip.assetId);
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
            const oEl = oAsset ? (mediaEls.current.get(outgoing.assetId) as HTMLVideoElement | HTMLImageElement | undefined) : undefined;
            if (oEl) {
              drawn.add(outgoing.id);
              ctx.save();
              ctx.globalAlpha = Math.max(0, 1 - p);
              drawRaw(outgoing, oEl, 0);
              ctx.restore();
            }
          }
          drawn.add(clip.id);
          ctx.save();
          ctx.globalAlpha = Math.max(0, Math.min(1, p));
          drawRaw(clip, pic, 0);
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
              const oEl = oAsset ? (mediaEls.current.get(outgoing.assetId) as HTMLVideoElement | HTMLImageElement | undefined) : undefined;
              if (oEl) {
                drawn.add(outgoing.id);
                const off = (1 - transform.p) * H * 0.25;
                ctx.save();
                ctx.globalAlpha = 1;
                ctx.translate(0, -off);
                drawRaw(outgoing, oEl, 0);
                ctx.restore();
              }
            }
            ctx.save();
            ctx.globalAlpha = Math.min(1, alpha + transform.p); // stay opaque while moving
            ctx.globalAlpha = 1;
            const rise = (1 - transform.p) * H * 0.6;
            ctx.translate(0, rise);
            drawRaw(clip, pic, 0);
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
        drawRaw(clip, pic, dx);
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
  }, []);

  const syncPlayback = useCallback((t: number, isPlaying: boolean) => {
    for (const clip of stateRef.current.clips) {
      const asset = stateRef.current.assets.find((a) => a.id === clip.assetId);
      if (!asset || asset.kind === 'image') continue;
      const el = mediaEls.current.get(clip.assetId);
      if (!el || el instanceof HTMLImageElement) continue;

      const active = t >= clip.start && t < clip.start + clip.duration;
      const target = clip.trimStart + (t - clip.start) * clip.speed;
      // never seek past the source media (speed may have been changed mid-trim)
      const maxTarget = Math.max(0, asset.duration - 0.05);
      const clampedTarget = Math.min(target, maxTarget);
      if (active) {
        if (Math.abs(el.currentTime - clampedTarget) > 0.35) el.currentTime = clampedTarget;
        if (isPlaying) { if (el.paused) void el.play().catch(() => undefined); }
        else if (!el.paused) el.pause();
      } else if (!el.paused) {
        el.pause();
      }
    }
  }, []);

  /* ------------------------------------------------ transport ------------------------------------------------ */

  const drawAndSync = useCallback((t: number, isPlaying: boolean) => {
    drawFrame(t);
    syncPlayback(t, isPlaying);
    applyGains(t);
  }, [drawFrame, syncPlayback, applyGains]);

  const finishPlayback = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    playingRef.current = false;
    setPlaying(false);
    drawAndSync(stateRef.current.duration, false);
    const recorder = exportRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }, [drawAndSync]);

  const tick = useCallback(function tick() {
    if (!canvasRef.current) { finishPlayback(); return; } // editor unmounted mid-export
    const dur = stateRef.current.duration;
    const elapsed = (performance.now() - startStampRef.current) / 1000;
    const t = Math.min(startOffsetRef.current + elapsed, dur);
    currentTimeRef.current = t;
    if (t >= dur || t - lastUiTimeRef.current >= 0.1) {
      lastUiTimeRef.current = t;
      setCurrentTime(t);
    }
    drawAndSync(t, true);
    if (exportDestRef.current && dur > 0) {
      setExportProgress((prev) => {
        const next = t / dur;
        return prev === null ? prev : Math.max(prev, next);
      });
    }
    if (t >= dur) {
      finishPlayback();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [drawAndSync, finishPlayback]);

  const seek = useCallback((t: number) => {
    const clamped = clamp(t, 0, stateRef.current.duration);
    currentTimeRef.current = clamped;
    setCurrentTime(clamped);
    if (playingRef.current) {
      cancelAnimationFrame(rafRef.current);
      startOffsetRef.current = clamped;
      startStampRef.current = performance.now();
      rafRef.current = requestAnimationFrame(tick);
    } else {
      drawAndSync(clamped, false);
    }
  }, [drawAndSync, tick]);

  const play = useCallback(() => {
    if (stateRef.current.duration <= 0) {
      showToast('Add something to the timeline first.');
      return;
    }
    ensureAudioGraph();
    syncAudioGraph();
    if (currentTimeRef.current >= stateRef.current.duration - 0.01) currentTimeRef.current = 0;
    startOffsetRef.current = currentTimeRef.current;
    startStampRef.current = performance.now();
    playingRef.current = true;
    setPlaying(true);
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }, [ensureAudioGraph, syncAudioGraph, showToast, tick]);

  const pause = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    playingRef.current = false;
    setPlaying(false);
    drawAndSync(currentTimeRef.current, false);
    const recorder = exportRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }, [drawAndSync]);

  const togglePlay = useCallback(() => {
    if (playingRef.current) pause();
    else play();
  }, [pause, play]);

  // Full teardown on unmount: RAF, recorder, audio graph, context, object URLs.
  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    const rec = exportRecorderRef.current;
    if (rec && rec.state !== 'inactive') { try { rec.stop(); } catch { /* already stopped */ } }
    for (const [, source] of sourceByAsset.current) { try { source.disconnect(); } catch { /* noop */ } }
    for (const [, gain] of gainByClip.current) { try { gain.disconnect(); } catch { /* noop */ } }
    sourceByAsset.current.clear();
    gainByClip.current.clear();
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    revokeAllAssetUrls(stateRef.current.assets);
  }, []);

  // Abort a running export when the editor unmounts (mode change away from video).
  useEffect(() => {
    if (mode === 'video') return;
    const rec = exportRecorderRef.current;
    if (rec && rec.state !== 'inactive') { try { rec.stop(); } catch { /* already stopped */ } }
    exportRecorderRef.current = null;
    exportDestRef.current = null;
    cancelAnimationFrame(rafRef.current);
    playingRef.current = false;
    setPlaying(false);
  }, [mode]);

  /* ------------------------------------------------ project reset ------------------------------------------------ */

  /**
   * Tear down all media + audio graph state and clear project state.
   * Used by openRecent and "New project" — createMediaElementSource can only
   * run once per element, so reopening a project must rebuild from scratch.
   */
  const resetProject = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    playingRef.current = false;
    setPlaying(false);
    const rec = exportRecorderRef.current;
    if (rec && rec.state !== 'inactive') { try { rec.stop(); } catch { /* already stopped */ } }
    exportRecorderRef.current = null;
    exportDestRef.current = null;
    // detach every gain + element source so the graph rebuilds cleanly
    for (const [, gain] of gainByClip.current) { try { gain.disconnect(); } catch { /* noop */ } }
    gainByClip.current.clear();
    for (const [, source] of sourceByAsset.current) { try { source.disconnect(); } catch { /* noop */ } }
    sourceByAsset.current.clear();
    mediaEls.current.clear();
    revokeAllAssetUrls(stateRef.current.assets);
    historyRef.current = { past: [], present: '', future: [] };
    setAssets([]);
    setClips([]);
    setTexts([]);
    setSelection(null);
    setWaveforms({});
    setProjectName('Untitled project');
    setAspect(loadSettings().defaultAspect);
    setCurrentTime(0);
    currentTimeRef.current = 0;
    setExportProgress(null);
    exportCanvasRef.current = null;
  }, []);

  /* ------------------------------------------------ project ops ------------------------------------------------ */

  const addAssets = useCallback((items: MediaAsset[]) => {
    for (const asset of items) mediaEls.current.set(asset.id, createMediaElement(asset));
    setAssets((prev) => [...prev, ...items]);
  }, []);

  /** Delete an asset: revoke its object URL, drop its element and any clips using it. */
  const handleDeleteAsset = useCallback((assetId: string) => {
    const dependentCount = stateRef.current.clips.filter((clip) => clip.assetId === assetId).length;
    if (dependentCount > 0 && !window.confirm(`Remove this media and its ${dependentCount} timeline clip${dependentCount === 1 ? '' : 's'}?`)) return;
    const asset = stateRef.current.assets.find((a) => a.id === assetId);
    if (asset) {
      revokeAssetUrl(asset);
      const source = sourceByAsset.current.get(assetId);
      if (source) { try { source.disconnect(); } catch { /* noop */ } sourceByAsset.current.delete(assetId); }
      mediaEls.current.delete(assetId);
    }
    setAssets((prev) => prev.filter((a) => a.id !== assetId));
    setClips((prev) => prev.filter((c) => {
      if (c.assetId !== assetId) return true;
      const gain = gainByClip.current.get(c.id);
      if (gain) { try { gain.disconnect(); } catch { /* noop */ } gainByClip.current.delete(c.id); }
      return false;
    }));
    setSelection((sel) => {
      if (sel?.type === 'clip') {
        const stillThere = stateRef.current.clips.some((c) => c.id === sel.id && c.assetId !== assetId);
        return stillThere ? sel : null;
      }
      return sel;
    });
    setWaveforms((prev) => {
      const next = { ...prev };
      delete next[assetId];
      return next;
    });
  }, []);

  const handleOpenVideo = useCallback(() => {
    resetProject();
    setMode('video');
  }, [resetProject]);
  const handleOpenImage = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      setImageSource(url);
      setImageName(file.name);
      setMode('image');
    };
    input.click();
  }, []);
  const handleImportImage = useCallback((files: FileList | File[]) => {
    const file = Array.from(files)[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImageSource(url);
    setImageName(file.name);
    setMode('image');
  }, []);

  const handleImportFiles = useCallback((files: FileList | File[]) => {
    void (async () => {
      const probed: MediaAsset[] = [];
      for (const file of Array.from(files)) {
        const supported = file.type.startsWith('video/') || file.type.startsWith('audio/') || file.type.startsWith('image/');
        if (!supported) {
          showToast(`Skipped unsupported file: ${file.name}`);
          continue;
        }
        if (file.size > 2 * 1024 * 1024 * 1024) {
          showToast(`Skipped ${file.name}: files larger than 2 GB are not supported.`);
          continue;
        }
        const asset = await probeAsset(file);
        if (asset) probed.push(asset);
        else console.warn('Skipped unreadable file:', file.name);
      }
      if (probed.length) {
        addAssets(probed);
        setMode('video');
        showToast(`Imported ${probed.length} file${probed.length === 1 ? '' : 's'}.`);
      } else {
        showToast('Could not read those files.');
      }
    })();
  }, [addAssets, showToast]);

  const handleGenerateSampleVideo = useCallback(() => {
    setGeneratingSample(true);
    generateSampleVideo()
      .then((sample) => addAssets([{ id: uid(), ...sample }]))
      .then(() => showToast('Sample video added — press + to put it on the timeline.'))
      .catch((err: unknown) => showToast(`Sample generation failed: ${err instanceof Error ? err.message : 'unknown error'}`))
      .finally(() => setGeneratingSample(false));
  }, [addAssets, showToast]);

  const handleGenerateSampleImage = useCallback(() => {
    generateSampleImage()
      .then((sample) => addAssets([{ id: uid(), ...sample }]))
      .then(() => showToast('Sample image added.'))
      .catch(() => showToast('Sample image generation failed.'));
  }, [addAssets, showToast]);

  const trackEnd = useCallback((trackId: string): number =>
    Math.max(0, ...clips.filter((c) => c.trackId === trackId).map((c) => c.start + c.duration)),
    [clips]);

  /** Shared clip-creation used by the + button and timeline drag-and-drop. */
  const createClipOnTrack = useCallback((asset: MediaAsset, trackId: string, start: number, push: (updater: (prev: Clip[]) => Clip[]) => void) => {
    const length = asset.kind === 'image' ? Math.min(5, asset.duration) : asset.duration;
    const clip: Clip = {
      id: uid(),
      assetId: asset.id,
      trackId,
      name: asset.name,
      start,
      // timeline length: source seconds / speed — at 2x the clip is half as long
      duration: Math.max(0.1, length / 1),
      trimStart: 0,
      trimEnd: Math.max(0, asset.duration - length),
      volume: 1,
      muted: false,
      fit: 'cover',
      filter: { ...DEFAULT_FILTER },
      speed: 1,
      transitionIn: 'none',
      transitionOut: 'none',
      fadeIn: 0,
      fadeOut: 0,
      volumeFadeIn: 0,
      volumeFadeOut: 0,
    };
    push((prev) => [...prev, clip]);
    setSelection({ type: 'clip', id: clip.id });
  }, []);

  const handleAddToTimeline = useCallback((assetId: string) => {
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) return;
    const trackId = asset.kind === 'audio' ? 'a1' : 'v1';
    const start = trackEnd(trackId);
    createClipOnTrack(asset, trackId, start, setClips);
  }, [assets, trackEnd, createClipOnTrack]);

  /** Create a clip for `asset` at `time` on `trackId` (drag-and-drop target). */
  const handleDropAsset = useCallback((assetId: string, trackId: string, time: number) => {
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) return;
    // track compatibility: audio only on A1, video on V1/V2, text on T1
    if (asset.kind === 'audio' && trackId !== 'a1') return;
    if (asset.kind !== 'audio' && trackId !== 'v1' && trackId !== 'v2') return;
    const start = Math.max(0, time);
    createClipOnTrack(asset, trackId, start, setClips);
  }, [assets, createClipOnTrack]);

  const handleAddText = useCallback(() => {
    const overlay: TextOverlay = {
      id: uid(),
      text: 'Your text here',
      x: 0.5,
      y: 0.82,
      size: 64,
      color: 'white',
      start: clamp(currentTimeRef.current, 0, Math.max(0, stateRef.current.duration)),
      duration: 3,
      animation: 'fade',
    };
    setTexts((prev) => [...prev, overlay]);
    setSelection({ type: 'text', id: overlay.id });
  }, []);

  const handleDeleteSelection = useCallback(() => {
    const ids = new Set(selectedIds);
    setSelection((sel) => {
      if (sel?.type === 'clip') ids.add(sel.id);
      if (ids.size > 0) {
        setClips((prev) => prev.filter((c) => {
          if (!ids.has(c.id)) return true;
          const gain = gainByClip.current.get(c.id);
          if (gain) { try { gain.disconnect(); } catch { /* noop */ } gainByClip.current.delete(c.id); }
          return false;
        }));
        if (sel?.type === 'text') setTexts((prev) => prev.filter((t) => t.id !== sel.id));
        return null;
      }
      if (sel?.type === 'text') {
        setTexts((prev) => prev.filter((t) => t.id !== sel.id));
        return null;
      }
      return null;
    });
    setSelectedIds([]);
  }, [selectedIds]);

  const handleSelect = useCallback((sel: Selection, shiftKey?: boolean) => {
    setSelection(sel);
    if (sel?.type === 'clip') {
      setSelectedIds((prev) => {
        if (!shiftKey) return [sel.id];
        return prev.includes(sel.id) ? prev.filter((id) => id !== sel.id) : [...prev, sel.id];
      });
    } else {
      setSelectedIds([]);
    }
  }, []);

  const cloneClips = useCallback((sources: Clip[], baseStart: number) => {
    if (sources.length === 0) return;
    const minStart = Math.min(...sources.map((c) => c.start));
    const clones: Clip[] = sources.map((c) => ({
      ...c,
      id: uid(),
      name: `${c.name} copy`,
      start: Math.max(0, baseStart + (c.start - minStart)),
    }));
    setClips((prev) => [...prev, ...clones]);
    setSelection(clones.length === 1 ? { type: 'clip', id: clones[0].id } : null);
    setSelectedIds(clones.map((c) => c.id));
  }, []);

  const copySelection = useCallback(() => {
    const ids = selectedIds.length > 0 ? selectedIds : selection?.type === 'clip' ? [selection.id] : [];
    const sources = stateRef.current.clips.filter((c) => ids.includes(c.id));
    if (sources.length === 0) return;
    clipboardRef.current = sources;
    showToast(`Copied ${sources.length} clip${sources.length === 1 ? '' : 's'}.`);
  }, [selectedIds, selection, showToast]);

  const pasteClipboard = useCallback(() => {
    const sources = clipboardRef.current;
    if (sources.length === 0) return;
    cloneClips(sources, currentTimeRef.current);
    showToast('Pasted at the playhead.');
  }, [cloneClips, showToast]);

  const duplicateSelection = useCallback(() => {
    const ids = selectedIds.length > 0 ? selectedIds : selection?.type === 'clip' ? [selection.id] : [];
    const sources = stateRef.current.clips.filter((c) => ids.includes(c.id));
    if (sources.length > 0) {
      cloneClips(sources, Math.min(...sources.map((c) => c.start + c.duration)));
      showToast(`Duplicated ${sources.length} clip${sources.length === 1 ? '' : 's'}.`);
    }
  }, [selectedIds, selection, cloneClips, showToast]);

  const patchClip = useCallback((id: string, patch: Partial<Clip>) => {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  /** Speed change: recompute timeline duration so the same source segment plays. */
  const handleSpeedChange = useCallback((clipId: string, speed: number) => {
    setClips((prev) => prev.map((c) => {
      if (c.id !== clipId) return c;
      const asset = stateRef.current.assets.find((a) => a.id === c.assetId);
      const srcSpan = Math.max(0.1, c.duration * c.speed);
      let dur = srcSpan / speed;
      if (asset && asset.kind !== 'image') {
        const maxSrc = Math.max(0.1, asset.duration - c.trimStart);
        dur = Math.min(dur, maxSrc / speed);
      }
      return { ...c, speed, duration: Math.max(0.1, dur) };
    }));
  }, []);

  const patchText = useCallback((id: string, patch: Partial<TextOverlay>) => {
    setTexts((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const undo = useCallback(() => {
    const h = historyRef.current;
    if (h.past.length === 0) return;
    skipHistoryRef.current = true;
    const prev = h.past[h.past.length - 1];
    h.past = h.past.slice(0, -1);
    h.future = [h.present, ...h.future];
    h.present = prev;
    const s = JSON.parse(prev) as { projectName: string; aspect: Aspect; clips: Clip[]; texts: TextOverlay[] };
    setProjectName(s.projectName);
    setAspect(s.aspect);
    setClips(s.clips.map((c) => ({ ...c, filter: c.filter ?? { ...DEFAULT_FILTER } })));
    setTexts(s.texts);
    showToast('Undo');
  }, [showToast]);

  const redo = useCallback(() => {
    const h = historyRef.current;
    if (h.future.length === 0) return;
    skipHistoryRef.current = true;
    const next = h.future[0];
    h.future = h.future.slice(1);
    h.past = [...h.past, h.present];
    h.present = next;
    const s = JSON.parse(next) as { projectName: string; aspect: Aspect; clips: Clip[]; texts: TextOverlay[] };
    setProjectName(s.projectName);
    setAspect(s.aspect);
    setClips(s.clips.map((c) => ({ ...c, filter: c.filter ?? { ...DEFAULT_FILTER } })));
    setTexts(s.texts);
    showToast('Redo');
  }, [showToast]);

  const handleSaveProject = useCallback(async () => {
    const { clips: clipList, texts: textList, assets: assetList } = stateRef.current;
    showToast('Packing project file…');
    const stored: Array<{ id: string; name: string; kind: MediaKind; duration: number; width?: number | undefined; height?: number | undefined; mime: string; dataUrl: string }> = [];
    for (const a of assetList) {
      try {
        const blob = await (await fetch(a.url)).blob();
        stored.push({ id: a.id, name: a.name, kind: a.kind, duration: a.duration, width: a.width, height: a.height, mime: blob.type, dataUrl: await blobToDataURL(blob) });
      } catch {
        stored.push({ id: a.id, name: a.name, kind: a.kind, duration: a.duration, width: a.width, height: a.height, mime: '', dataUrl: '' });
      }
    }
    const totalBytes = stored.reduce((n, s) => n + (s.dataUrl?.length ?? 0) * 0.75, 0);
    if (totalBytes > 50 * 1024 * 1024 && !window.confirm(
      `This project embeds about ${(totalBytes / 1_000_000).toFixed(0)} MB of media and will produce a large file. Save anyway?`,
    )) {
      showToast('Save cancelled.');
      return;
    }
    const data = JSON.stringify({ version: 2, name: projectName, aspect, clips: clipList, texts: textList, assets: stored }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    downloadBlob(blob, `${projectName.trim().replace(/[\\/:*?"<>|]+/g, '-') || 'clipforge'}.clipforge.json`);
    showToast('Project saved with embedded media.');
  }, [projectName, aspect, showToast]);

  const handleLoadProject = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = parseProjectData(JSON.parse(String(reader.result)));
        resetProject();
        setProjectName(data.name);
        setAspect(data.aspect);
        const newClips = data.clips.map((c) => ({ ...c, filter: c.filter ?? { ...DEFAULT_FILTER } }));
        setTexts(data.texts);
        setClips(newClips);
        const embedded = data.assets.filter((a) => typeof a.dataUrl === 'string' && a.dataUrl.startsWith('data:'));
        const missing = newClips.filter((c) => !embedded.some((a) => a.id === c.assetId)).length;
        if (embedded.length > 0) {
          void (async () => {
            const restored: MediaAsset[] = [];
            for (const a of embedded) {
              try {
                const blob = await (await fetch(a.dataUrl as string)).blob();
                restored.push({ id: a.id, name: a.name, kind: a.kind, url: URL.createObjectURL(blob), duration: a.duration, width: a.width, height: a.height });
              } catch { /* skip unreadable asset */ }
            }
            addAssets(restored);
            setMode('video');
            showToast(`Project loaded — ${restored.length} media file${restored.length === 1 ? '' : 's'} restored.${missing > 0 ? ` ${missing} clip(s) reference media that was not embedded; re-import those files.` : ''}`);
          })();
        } else {
          setMode('video');
          showToast(missing > 0
            ? `Project loaded. ${missing} clip(s) reference media that is not embedded — re-import those files.`
            : 'Project loaded.');
        }
      } catch {
        showToast('Could not read project file.');
      }
    };
    reader.readAsText(file);
  }, [addAssets, resetProject, showToast]);

  const selectedClip = selection?.type === 'clip' ? clips.find((c) => c.id === selection.id) ?? null : null;
  const selectedText = selection?.type === 'text' ? texts.find((t) => t.id === selection.id) ?? null : null;
  const time = currentTime;
  const canSplit = Boolean(
    selectedClip && time > selectedClip.start + 0.01 && time < selectedClip.start + selectedClip.duration - 0.01,
  );

  const handleSplit = useCallback(() => {
    const t = currentTimeRef.current;
    setClips((prev) => {
      const clip = prev.find((c) => c.id === selection?.id);
      if (!clip) return prev;
      if (t <= clip.start + 0.01 || t >= clip.start + clip.duration - 0.01) return prev;
      const leftDuration = t - clip.start;
      const rightClip: Clip = {
        ...clip,
        id: uid(),
        name: `${clip.name} (2)`,
        start: t,
        duration: clip.duration - leftDuration,
        trimStart: clip.trimStart + leftDuration * clip.speed,
      };
      const updated: Clip = { ...clip, duration: leftDuration };
      setSelection({ type: 'clip', id: rightClip.id });
      return prev.flatMap((c) => (c.id === clip.id ? [updated, rightClip] : [c]));
    });
  }, [selection?.id]);

  const saveToRecent = useCallback(async () => {
    const { clips: clipList, texts: textList, assets } = stateRef.current;
    const name = projectName;
    const asp = aspect;
    try {
      // thumbnail from current canvas
      let thumbnail: string | undefined;
      try {
        const canvas = canvasRef.current;
        if (canvas) {
          const thumb = document.createElement('canvas');
          thumb.width = 320; thumb.height = Math.round((canvas.height / canvas.width) * 320);
          const tctx = thumb.getContext('2d');
          if (tctx) {
            tctx.drawImage(canvas, 0, 0, thumb.width, thumb.height);
            thumbnail = thumb.toDataURL('image/jpeg', loadSettings().thumbnailQuality);
          }
        }
      } catch { /* no thumbnail */ }

      // store media blobs so the project can be fully reopened later
      const storedAssets = await Promise.all(assets.map(async (a) => {
        try {
          const res = await fetch(a.url);
          const blob = await res.blob();
          return { id: a.id, name: a.name, kind: a.kind, duration: a.duration, width: a.width, height: a.height, blob };
        } catch {
          return { id: a.id, name: a.name, kind: a.kind, duration: a.duration, width: a.width, height: a.height, blob: new Blob([], { type: 'application/octet-stream' }) };
        }
      }));

      const entry: RecentProject = {
        id: crypto.randomUUID(),
        name,
        kind: 'video',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        thumbnail,
        videoJson: JSON.stringify({ version: 1, name, aspect: asp, clips: clipList, texts: textList }),
        assets: storedAssets,
      };
      await putRecentProject(entry);
      showToast('Saved to dashboard — reopen anytime.');
    } catch (err) {
      console.error(err);
      showToast('Could not save to dashboard.');
    }
  }, [showToast, projectName, aspect]);

  const openRecent = useCallback(async (entry: RecentProject) => {
    if (entry.kind === 'video' && entry.videoJson) {
      try {
        const parsed = JSON.parse(entry.videoJson) as { name: string; aspect: Aspect; clips: Clip[]; texts: TextOverlay[] };
        resetProject();
        setProjectName(parsed.name);
        setAspect(parsed.aspect);
        // historyRef was cleared by resetProject; re-seed with the loaded project
        historyRef.current = { past: [], present: JSON.stringify({ projectName: parsed.name, aspect: parsed.aspect, clips: parsed.clips, texts: parsed.texts }), future: [] };
        setSelection(null);
        setCurrentTime(0);
        const hydratedAssets: MediaAsset[] = [];
        const newMediaEls: Array<[string, HTMLVideoElement | HTMLAudioElement | HTMLImageElement]> = [];
        for (const a of entry.assets ?? []) {
          const url = URL.createObjectURL(a.blob);
          const m: MediaAsset = { id: a.id, name: a.name, kind: a.kind, url, duration: a.duration, width: a.width, height: a.height };
          hydratedAssets.push(m);
          const el = a.kind === 'image' ? new Image() : document.createElement(a.kind);
          el.src = url;
          (el as HTMLVideoElement).preload = 'auto';
          newMediaEls.push([a.id, el]);
        }
        mediaEls.current.clear();
        newMediaEls.forEach(([id, el]) => mediaEls.current.set(id, el));
        setAssets(hydratedAssets);
        setClips(parsed.clips);
        setTexts(parsed.texts);
        setMode('video');
        showToast('Opened from dashboard.');
      } catch (err) {
        console.error(err);
        showToast('Could not restore that project.');
      }
      return;
    }
    if (entry.kind === 'image' && entry.imageBlob) {
      setImageSource(URL.createObjectURL(entry.imageBlob));
      setImageName(entry.name);
      setMode('image');
      showToast('Opened from dashboard.');
      return;
    }
    showToast('That recent project is incomplete — please try saving again.');
  }, [showToast, resetProject, setSelection]);

  const applyTemplate = useCallback((template: typeof VIDEO_TEMPLATES[number]) => {
    const mkText = (text: string, y: number, size: number, color = 'white'): TextOverlay => ({
      id: uid(), text, x: 0.5, y, size, color, start: 0, duration: 4, animation: 'fade',
    });
    const clips: Clip[] = [];
    const texts = [
      mkText(template.name, 0.18, 88, 'white'),
      mkText('Replace with your footage — press Save to pin it to the dashboard', 0.84, 30, 'white'),
    ];
    setProjectName(template.name);
    setAspect(template.aspect);
    setClips(clips);
    setTexts(texts);
    setSelection(null);
    setCurrentTime(0);
    setMode('video');
    showToast('Template applied — add your media to make it yours.');
  }, [showToast]);

  const saveImageToRecent = useCallback(async (name: string, blob: Blob) => {
    try {
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = 320;
      const img = await createImageBitmap(blob);
      thumbCanvas.height = Math.max(1, Math.round((img.height / img.width) * 320));
      const tctx = thumbCanvas.getContext('2d');
      if (tctx) {
        tctx.drawImage(img, 0, 0, thumbCanvas.width, thumbCanvas.height);
      }
      img.close();
      const thumbnail = thumbCanvas.toDataURL('image/jpeg', 0.6);
      await putRecentProject({
        id: crypto.randomUUID(),
        name,
        kind: 'image',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        thumbnail,
        imageBlob: blob,
      });
      showToast('Image saved to dashboard — reopen anytime.');
    } catch (err) {
      console.error(err);
      showToast('Could not save image to dashboard.');
    }
  }, [showToast]);

  const prepareExportCanvas = useCallback((quality: ExportQuality) => {
    if (quality === '720p') return canvasRef.current;
    const base = CANVAS_SIZE[aspect];
    const height = quality === '4K' ? 2160 : 1080;
    const canvas = document.createElement('canvas');
    canvas.height = height;
    canvas.width = Math.round(height * base.w / base.h);
    exportCanvasRef.current = canvas;
    return canvas;
  }, [aspect]);

  const handleExport = useCallback((quality: ExportQuality, bitrate: number) => {
    const dur = stateRef.current.duration;
    if (dur <= 0) {
      showToast('Nothing to export yet.');
      return;
    }
    if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
      showToast('This browser does not support video export. Try the desktop app or a Chromium-based browser.');
      return;
    }
    const ctx = ensureAudioGraph();
    exportCancelledRef.current = false;
    syncAudioGraph();
    cancelAnimationFrame(rafRef.current);
    playingRef.current = false;
    setPlaying(false);
    currentTimeRef.current = 0;
    setCurrentTime(0);
    const canvas = prepareExportCanvas(quality);
    if (!canvas) return;
    drawFrame(0);
    const videoStream = canvas.captureStream(30);
    const dest = ctx.createMediaStreamDestination();
    masterGainRef.current?.connect(dest);
    exportDestRef.current = dest;

    const combined = new MediaStream([...videoStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const mime = pickSupportedMime(['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']);
    const recorder = new MediaRecorder(
      combined,
      mime ? { mimeType: mime, videoBitsPerSecond: bitrate } : undefined,
    );
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      masterGainRef.current?.disconnect(dest);
      exportDestRef.current = null;
      setExportProgress(null);
      if (exportCancelledRef.current) {
        showToast('Export cancelled.');
        return;
      }
      const type = recorder.mimeType || 'video/webm';
      const extension = type.includes('mp4') ? 'mp4' : 'webm';
      const blob = new Blob(chunks, { type });
      const base = projectName.trim().replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80) || 'clipforge';
      downloadBlob(blob, `${base}.${extension}`);
      showToast(`Exported ${(blob.size / 1_000_000).toFixed(1)} MB — check your downloads folder.`);
    };

    exportRecorderRef.current = recorder;
    recorder.start(250);
    setExportProgress(0);
    showToast('Exporting in real time — the preview will play through once.');
    play();
  }, [drawFrame, ensureAudioGraph, syncAudioGraph, play, prepareExportCanvas, projectName, showToast]);

  const handleExportMp4 = useCallback(async (quality: ExportQuality, bitrate: number) => {
    const dur = stateRef.current.duration;
    if (dur <= 0) { showToast('Nothing to export yet.'); return; }
    if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
      showToast('This browser does not support video export. Try the desktop app or a Chromium-based browser.');
      return;
    }
    setMp4Busy(true);
    exportCancelledRef.current = false;
    const ctx = ensureAudioGraph();
    syncAudioGraph();
    cancelAnimationFrame(rafRef.current);
    playingRef.current = false;
    setPlaying(false);
    currentTimeRef.current = 0;
    setCurrentTime(0);
    const canvas = prepareExportCanvas(quality);
    if (!canvas) { setMp4Busy(false); return; }
    drawFrame(0);
    showToast('Recording timeline…');
    const videoStream = canvas.captureStream(30);
    const dest = ctx.createMediaStreamDestination();
    masterGainRef.current?.connect(dest);
    // progress plumbing — finishPlayback sets exportProgress via the tick loop
    exportDestRef.current = dest;
    const combined = new MediaStream([...videoStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const mime = pickSupportedMime(['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) ?? 'video/webm';
    const recorder = new MediaRecorder(combined, { mimeType: mime, videoBitsPerSecond: bitrate });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const webmBlob: Blob = await new Promise((resolve) => {
      recorder.onstop = () => {
        masterGainRef.current?.disconnect(dest);
        exportDestRef.current = null;
        exportCanvasRef.current = null;
        resolve(new Blob(chunks, { type: mime }));
      };
      exportRecorderRef.current = recorder;
      recorder.start(250);
      setExportProgress(0);
      // No manual wait loop: the playback tick calls finishPlayback() at the
      // end of the timeline, which stops exportRecorderRef exactly once.
      play();
    });
    setExportProgress(null);
    if (exportCancelledRef.current) {
      setMp4Busy(false);
      showToast('Export cancelled.');
      return;
    }
    showToast('Transcoding to MP4 (this may take a moment)…');
    try {
      if (!ffmpegRef.current) {
        const ffmpeg = new FFmpeg();
        ffmpegRef.current = ffmpeg;
        const baseURL = `${window.location.origin}${import.meta.env.BASE_URL}ffmpeg`;
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
      }
      const ffmpeg = ffmpegRef.current;
      await ffmpeg.writeFile('input.webm', await fetchFile(webmBlob));
      await ffmpeg.exec(['-i', 'input.webm', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-c:a', 'aac', '-movflags', '+faststart', 'output.mp4']);
      if (exportCancelledRef.current) return;
      const data = await ffmpeg.readFile('output.mp4') as Uint8Array;
      const mp4Blob = new Blob([data.buffer as ArrayBuffer], { type: 'video/mp4' });
      const base = projectName.trim().replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80) || 'clipforge';
      downloadBlob(mp4Blob, `${base}.mp4`);
      showToast(`Exported MP4 ${(mp4Blob.size / 1_000_000).toFixed(1)} MB — check your downloads.`);
    } catch (err) {
      console.error(err);
      showToast('MP4 transcode failed — try WebM export instead.');
    } finally {
      setExportProgress(null);
      setMp4Busy(false);
    }
  }, [drawFrame, ensureAudioGraph, syncAudioGraph, play, prepareExportCanvas, projectName, showToast]);

  const cancelExport = useCallback(() => {
    exportCancelledRef.current = true;
    cancelAnimationFrame(rafRef.current);
    playingRef.current = false;
    setPlaying(false);
    const recorder = exportRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    exportRecorderRef.current = null;
    setExportProgress(null);
    setMp4Busy(false);
    showToast('Export cancelled.');
  }, [showToast]);

  /* ------------------------------------------------ keyboard ------------------------------------------------ */

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target?.closest('input, textarea, select, [contenteditable="true"]');
      if (typing) return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        void saveToRecent();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteSelection();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        copySelection();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        pasteClipboard();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        duplicateSelection();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        if (canSplit) handleSplit();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePlay, handleDeleteSelection, handleSplit, canSplit, undo, redo, saveToRecent, copySelection, pasteClipboard, duplicateSelection]);

  /* ------------------------------------------------ frame draw on state changes ------------------------------------------------ */

  useEffect(() => {
    if (!playingRef.current) drawAndSync(currentTime, false);
  }, [currentTime, aspect, clips, texts, drawAndSync]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const next = await getStorageDiagnostics();
      if (active) setStorageStatus(next);
    })();
    return () => { active = false; };
  }, []);

  const hasContent = clips.length + texts.length > 0;

  if (mode === 'home') {
    return (
      <LandingPage
        onLaunchEditor={() => setMode('video')}
        onOpenProjects={() => setMode('dashboard')}
      />
    );
  }

  if (mode === 'dashboard') {
    return (
      <Dashboard
        onNewVideo={handleOpenVideo}
        onNewImage={handleOpenImage}
        onImportVideo={handleImportFiles}
        onImportImage={handleImportImage}
        onApplyTemplate={applyTemplate}
        onOpenRecent={openRecent}
      />
    );
  }

  if (mode === 'image' && imageSource) {
    return (
      <ErrorBoundary fallback={<div className="error-state">The image editor could not render. Return to the dashboard and try again.</div>}>
        <ImageEditor
          initialImage={imageSource}
          initialName={imageName}
          onClose={() => setMode('dashboard')}
          onExportRecent={saveImageToRecent}
        />
      </ErrorBoundary>
    );
  }

  return (
    <div className="app">
      <TopBar
        projectName={projectName}
        onProjectNameChange={setProjectName}
        aspect={aspect}
        onAspectChange={setAspect}
        onExport={handleExport}
        onExportMp4={handleExportMp4}
        onCancelExport={cancelExport}
        onAddText={handleAddText}
        onHome={() => setMode('home')}
        onUndo={undo}
        onRedo={redo}
        onSaveProject={handleSaveProject}
        onSaveToRecent={saveToRecent}
        onLoadProject={handleLoadProject}
        exportProgress={exportProgress}
        mp4Busy={mp4Busy}
        canExport={duration > 0}
        defaultExportFormat={loadSettings().defaultExportFormat}
        storageStatus={storageStatus}
      />
      <main className="workspace">
        <MediaPanel
          assets={assets}
          onImportFiles={handleImportFiles}
          onGenerateSampleVideo={handleGenerateSampleVideo}
          onGenerateSampleImage={handleGenerateSampleImage}
          onAddToTimeline={handleAddToTimeline}
          onDeleteAsset={handleDeleteAsset}
          generatingSample={generatingSample}
        />
        <Stage
          ref={canvasRef}
          aspect={aspect}
          playing={playing}
          currentTime={currentTime}
          duration={duration}
          onTogglePlay={togglePlay}
          onSeekStart={() => seek(0)}
          hasContent={hasContent}
        />
        <Inspector
          selection={selection}
          clip={selectedClip}
          text={selectedText}
          canSplit={canSplit}
          showHints={loadSettings().showInterfaceHints}
          onChangeClip={patchClip}
          onSpeedChange={handleSpeedChange}
          currentTime={currentTime}
          onChangeText={patchText}
          onDeleteSelection={handleDeleteSelection}
          onSplit={handleSplit}
        />
      </main>
      <Timeline
        clips={clips}
        texts={texts}
        assetKindById={assetKindById}
        waveforms={waveforms}
        thumbs={thumbs}
        duration={duration}
        currentTime={currentTime}
        playing={playing}
        pxPerSec={pxPerSec}
        onPxPerSecChange={setPxPerSec}
        selection={selection}
        selectedIds={selectedIds}
        onSelect={handleSelect}
        onSeek={seek}
        onPatchClip={patchClip}
        onPatchText={patchText}
        onDropAsset={handleDropAsset}
      />
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

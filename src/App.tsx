import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import TopBar, { type ExportQuality } from './components/TopBar';
import MediaPanel from './components/MediaPanel';
import Stage from './components/Stage';
import Inspector from './components/Inspector';
import Timeline from './components/Timeline';
import ImageEditor from './components/ImageEditor';
import ErrorBoundary from './components/ErrorBoundary';
import Dashboard from './components/Dashboard';
import { VIDEO_TEMPLATES } from './lib/templates';
import LandingPage from './landing/LandingPage';
import { putRecentProject, type RecentProject } from './lib/recent';
import { cloudProjectsEnabled, fetchProjectAssets, saveCloudProject, syncProjectAssets } from './lib/cloudProjects';
import { loadSettings } from './lib/settings';
import { captureAssetThumb, createMediaElement, blobToDataURL, generateSampleImage, generateSampleVideo, probeAsset, revokeAssetUrl, revokeAllAssetUrls } from './media';
import { clamp, downloadBlob, pickSupportedMime, uid } from './util';
import type { Aspect, Clip, MediaAsset, MediaKind, Selection, TextOverlay, TimelineMarker, TrackSettingsMap } from './types';
import { CANVAS_SIZE, DEFAULT_CHROMA, DEFAULT_FILTER, DEFAULT_MASK, DEFAULT_TRANSFORM } from './types';
import { clipVolumeAt, hydrateClip, interpolateKeyframes } from './lib/render';
import { renderFrame } from './lib/frameRenderer';
import { exportTimelineMp4 } from './lib/exporter';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { parseProjectData } from './lib/project';
import { getStorageDiagnostics, type StorageDiagnostics } from './lib/storage';
import { useEditorStore } from './store/editorStore';
import { parseCaptions, serializeCaptions } from './lib/captions';
import type { Caption } from './types';
import { whisperChunksToCaptions } from './lib/transcribe';
import { publishShare } from './lib/share';
import { supabase } from './lib/supabase';
import ShareView from './components/ShareView';
import AuthGate from './components/AuthGate';

export default function App() {
  const { assets, clips, texts, projectName, aspect, selection, setAssets, setClips, setTexts, setProjectName, setAspect, setSelection } = useEditorStore();
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pxPerSec, setPxPerSec] = useState(45);
  const [toast, setToast] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'unsaved' | 'failed'>('saved');
  const [commandOpen, setCommandOpen] = useState(false);
  const [collapsedPanels, setCollapsedPanels] = useState({ media: false, inspector: false, timeline: false });
  const [storageStatus, setStorageStatus] = useState<StorageDiagnostics | null>(null);
  const [generatingSample, setGeneratingSample] = useState(false);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [mp4Busy, setMp4Busy] = useState(false);
  const [waveforms, setWaveforms] = useState<Record<string, number[]>>({});
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [markers, setMarkers] = useState<TimelineMarker[]>([]);
  const [inPoint, setInPoint] = useState<number | null>(null);
  const [outPoint, setOutPoint] = useState<number | null>(null);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [autoCaptioning, setAutoCaptioning] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [trackSettings, setTrackSettings] = useState<TrackSettingsMap>({});
  const [rippleEnabled, setRippleEnabled] = useState(false);

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
  /** Cloud row id for the currently open project (updates the same row on re-save). */
  const cloudProjectIdRef = useRef<string | undefined>(undefined);
  const stateRef = useRef({ assets, clips, texts, duration: 0, trackSettings });


  const duration = useMemo(
    () => Math.max(0, ...clips.map((c) => c.start + c.duration), ...texts.map((t) => t.start + t.duration)),
    [clips, texts],
  );
  // Keep the shared snapshot outside render — callbacks read it via ref.
  useEffect(() => {
    stateRef.current = { assets, clips, texts, duration, trackSettings };
  });

  // Undo/redo history tracking.
  const snapshot = useCallback(() => JSON.stringify({
    projectName, aspect, clips, texts, captions, markers, inPoint, outPoint, trackSettings,
  }), [projectName, aspect, clips, texts, captions, markers, inPoint, outPoint, trackSettings]);

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
  useEffect(() => {
    if (historyRef.current.present) setSaveState('unsaved');
  }, [clips, texts, projectName, aspect, captions, markers, inPoint, outPoint]);

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

  useEffect(() => {
    const onCommandKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === 'Escape') setCommandOpen(false);
    };
    window.addEventListener('keydown', onCommandKey);
    return () => window.removeEventListener('keydown', onCommandKey);
  }, []);

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
      let vol = active && !clip.muted && !stateRef.current.trackSettings[clip.trackId]?.muted ? clip.volume : 0;
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

  /** Marshals the renderer options; the caller still owns the canvas choice. */
  const frameOptions = useCallback((canvas: HTMLCanvasElement, t: number) => ({
    canvas,
    t,
    mediaEls: mediaEls.current,
    state: {
      clips: stateRef.current.clips,
      texts: stateRef.current.texts,
      captions,
      assets: stateRef.current.assets,
      trackSettings: stateRef.current.trackSettings,
    },
  }), [captions]);


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
    if (canvasRef.current) renderFrame(frameOptions(canvasRef.current, t));
    syncPlayback(t, isPlaying);
    applyGains(t);
  }, [frameOptions, syncPlayback, applyGains]);

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
    cloudProjectIdRef.current = undefined;
    setAssets([]);
    setClips([]);
    setTexts([]);
    setCaptions([]);
    setMarkers([]);
    setInPoint(null);
    setOutPoint(null);
    setTrackSettings({});
    setRippleEnabled(false);
    setSelection(null);
    setWaveforms({});
    setProjectName('Untitled project');
    setAspect(loadSettings().defaultAspect);
    setCurrentTime(0);
    currentTimeRef.current = 0;
    setExportProgress(null);
    exportCanvasRef.current = null;
  }, [setProjectName, setAspect, setTexts, setClips, setSelection, setAssets]);

  /* ------------------------------------------------ project ops ------------------------------------------------ */

  const addAssets = useCallback((items: MediaAsset[]) => {
    for (const asset of items) mediaEls.current.set(asset.id, createMediaElement(asset));
    setAssets((prev) => [...prev, ...items]);
  }, [setAssets]);

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
  }, [setAssets, setClips, setSelection]);

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
      transform: { ...DEFAULT_TRANSFORM },
      blendMode: 'normal',
      mask: { ...DEFAULT_MASK },
      chroma: { ...DEFAULT_CHROMA },
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
  }, [setSelection]);

  const handleAddToTimeline = useCallback((assetId: string) => {
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) return;
    const trackId = asset.kind === 'audio' ? 'a1' : 'v1';
    const start = trackEnd(trackId);
    createClipOnTrack(asset, trackId, start, setClips);
  }, [assets, trackEnd, createClipOnTrack, setClips]);

  /** Create a clip for `asset` at `time` on `trackId` (drag-and-drop target). */
  const handleDropAsset = useCallback((assetId: string, trackId: string, time: number) => {
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) return;
    // track compatibility: audio only on A1, video on V1/V2, text on T1
    if (asset.kind === 'audio' && trackId !== 'a1') return;
    if (asset.kind !== 'audio' && trackId !== 'v1' && trackId !== 'v2') return;
    const start = Math.max(0, time);
    createClipOnTrack(asset, trackId, start, setClips);
  }, [assets, createClipOnTrack, setClips]);

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
  }, [setTexts, setSelection]);

  /** Emoji stickers are TextOverlays with no background at large size. */
  const handleAddSticker = useCallback((emoji: string) => {
    const overlay: TextOverlay = {
      id: uid(),
      text: emoji,
      x: 0.5,
      y: 0.5,
      size: 96,
      color: 'white',
      start: clamp(currentTimeRef.current, 0, Math.max(0, stateRef.current.duration)),
      duration: 3,
      animation: 'pop',
    };
    setTexts((prev) => [...prev, overlay]);
    setSelection({ type: 'text', id: overlay.id });
    showToast(`Sticker ${emoji} added at the playhead.`);
  }, [showToast, setTexts, setSelection]);

  /**
   * On-demand beat detection: decodes the first sound-bearing clip's asset
   * and drops a marker on each energy onset. The 80-bucket waveform preview
   * is too coarse for this, so the analysis runs here at full sample rate.
   */
  const handleDetectBeats = useCallback(async () => {
    const { clips: clipList, assets: assetList, trackSettings: settings } = stateRef.current;
    const soundClip = clipList
      .filter((c) => {
        const kind = assetList.find((a) => a.id === c.assetId)?.kind;
        return (kind === 'audio' || kind === 'video') && !settings[c.trackId]?.muted;
      })
      .sort((a, b) => a.start - b.start)[0];
    const asset = soundClip && assetList.find((a) => a.id === soundClip.assetId);
    if (!soundClip || !asset) {
      showToast('Add an audio or video clip first — beats are detected from its sound.');
      return;
    }
    showToast('Detecting beats…');
    try {
      const res = await fetch(asset.url);
      const buf = await res.arrayBuffer();
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const audioBuf = await ctx.decodeAudioData(buf);
      void ctx.close();
      const data = audioBuf.getChannelData(0);
      const rate = audioBuf.sampleRate;
      // Energy envelope: RMS per ~11.6ms hop.
      const hop = 512;
      const envelope: number[] = [];
      for (let i = 0; i + hop <= data.length; i += hop) {
        let sum = 0;
        for (let j = 0; j < hop; j++) { const v = data[i + j] ?? 0; sum += v * v; }
        envelope.push(Math.sqrt(sum / hop));
      }
      // Onset = local energy peak clearly above the ~0.25s neighbourhood mean.
      const windowLen = Math.max(1, Math.round(0.25 / (hop / rate)));
      const gapSamples = Math.round(0.25 * rate / hop);
      const beats: number[] = [];
      let lastIdx = -Infinity;
      for (let i = 2; i < envelope.length - 2; i++) {
        const e = envelope[i] ?? 0;
        if (e <= 0.005) continue;
        if (e <= (envelope[i - 2] ?? 0) || e < (envelope[i + 2] ?? 0)) continue;
        let mean = 0;
        let n = 0;
        for (let j = Math.max(0, i - windowLen); j < Math.min(envelope.length, i + windowLen); j++) { mean += envelope[j] ?? 0; n++; }
        if (n === 0 || e < 1.35 * (mean / n)) continue;
        if (i - lastIdx < gapSamples) continue;
        lastIdx = i;
        beats.push((i * hop) / rate);
      }
      // Map asset time → timeline time and keep beats inside the clip.
      const mapped = beats
        .map((assetT) => soundClip.start + (assetT - soundClip.trimStart) / soundClip.speed)
        .filter((timelineT) => timelineT >= soundClip.start && timelineT < soundClip.start + soundClip.duration)
        .slice(0, 128);
      if (mapped.length === 0) {
        showToast('No clear beats found in that clip.');
        return;
      }
      setMarkers((previous) => [
        ...previous,
        ...mapped.map((time) => ({ id: uid(), time, label: '♪', color: '#e6c476' })),
      ].sort((a, b) => a.time - b.time));
      showToast(`${mapped.length} beat${mapped.length === 1 ? '' : 's'} marked from ${soundClip.name}.`);
    } catch (err) {
      console.error(err);
      showToast('Beat detection failed — the audio could not be decoded.');
    }
  }, [showToast]);

  /**
   * Auto-captions: transcribe the first unmuted audio-capable clip in-browser
   * with Whisper (multilingual tiny, ~44 MB, one-time download to the Cache
   * Storage — nothing ever leaves this machine).
   */
  const handleAutoCaptions = useCallback(async () => {
    if (autoCaptioning) return;
    const { clips: clipList, assets: assetList, trackSettings: settings } = stateRef.current;
    const soundClip = clipList
      .filter((c) => {
        const kind = assetList.find((a) => a.id === c.assetId)?.kind;
        return (kind === 'audio' || kind === 'video') && !settings[c.trackId]?.muted;
      })
      .sort((a, b) => a.start - b.start)[0];
    const asset = soundClip && assetList.find((a) => a.id === soundClip.assetId);
    if (!soundClip || !asset) {
      showToast('Add an audio or video clip first — captions are transcribed from its sound.');
      return;
    }
    setAutoCaptioning(true);
    showToast('Transcribing locally — the first run downloads the Whisper model (~44 MB)…');
    try {
      const res = await fetch(asset.url);
      const raw = await res.arrayBuffer();
      const decodeCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const audioBuf = await decodeCtx.decodeAudioData(raw);
      void decodeCtx.close();
      // Whisper expects 16 kHz mono.
      const resample = new OfflineAudioContext(1, Math.ceil(audioBuf.duration * 16000), 16000);
      const source = resample.createBufferSource();
      source.buffer = audioBuf;
      source.connect(resample.destination);
      source.start();
      const mono16k = await resample.startRendering();
      const samples = mono16k.getChannelData(0);

      const { pipeline, env } = await import('@xenova/transformers');
      env.allowLocalModels = false;
      // Self-hosted ONNX runtime WASM (defaults to jsdelivr CDN, which our CSP forbids).
      env.backends.onnx.wasm.wasmPaths = `${import.meta.env.BASE_URL}whisper/`;
      const asr = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny');
      const result = await asr(samples, { return_timestamps: true, chunk_length_s: 30, stride_length_s: 5 }) as {
        text: string;
        chunks?: { text: string; timestamp: [number, number | null] }[];
      };
      const mapped = whisperChunksToCaptions(result.chunks ?? [], result.text, soundClip);
      if (mapped.length === 0) {
        showToast('Whisper heard silence — no captions added.');
        return;
      }
      setCaptions((prev) => [...prev, ...mapped]);
      showToast(`${mapped.length} caption${mapped.length === 1 ? '' : 's'} added from ${soundClip.name}.`);
    } catch (err) {
      console.error(err);
      showToast('Transcription failed — the audio could not be decoded or the model download was blocked.');
    } finally {
      setAutoCaptioning(false);
    }
  }, [autoCaptioning, showToast]);

  const handleDeleteSelection = useCallback(() => {
    const ids = new Set(selectedIds);
    setSelection((sel) => {
      if (sel?.type === 'clip') ids.add(sel.id);
      if (ids.size > 0) {
        const removed = stateRef.current.clips.filter((clip) => ids.has(clip.id) && !trackSettings[clip.trackId]?.locked);
        setClips((prev) => prev.filter((c) => {
          if (!ids.has(c.id) || trackSettings[c.trackId]?.locked) return true;
          const gain = gainByClip.current.get(c.id);
          if (gain) { try { gain.disconnect(); } catch { /* noop */ } gainByClip.current.delete(c.id); }
          return false;
        }).map((clip) => {
          if (!rippleEnabled) return clip;
          const shift = removed
            .filter((item) => item.trackId === clip.trackId && item.start < clip.start)
            .reduce((total, item) => total + item.duration, 0);
          return shift > 0 ? { ...clip, start: Math.max(0, clip.start - shift) } : clip;
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
  }, [selectedIds, rippleEnabled, trackSettings, setSelection, setClips, setTexts]);

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
  }, [setSelection]);

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
  }, [setClips, setSelection]);

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
  }, [setClips]);

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
  }, [setClips]);

  const patchText = useCallback((id: string, patch: Partial<TextOverlay>) => {
    setTexts((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, [setTexts]);

  const undo = useCallback(() => {
    const h = historyRef.current;
    if (h.past.length === 0) return;
    skipHistoryRef.current = true;
    const prev = h.past[h.past.length - 1];
    h.past = h.past.slice(0, -1);
    h.future = [h.present, ...h.future];
    h.present = prev;
    const s = JSON.parse(prev) as { projectName: string; aspect: Aspect; clips: Clip[]; texts: TextOverlay[]; captions?: Caption[]; markers?: TimelineMarker[]; inPoint?: number | null; outPoint?: number | null; trackSettings?: TrackSettingsMap };
    setProjectName(s.projectName);
    setAspect(s.aspect);
    setClips(s.clips.map(hydrateClip));
    setTexts(s.texts);
    setCaptions(s.captions ?? []);
    setMarkers(s.markers ?? []);
    setInPoint(s.inPoint ?? null);
    setOutPoint(s.outPoint ?? null);
    setTrackSettings(s.trackSettings ?? {});
    showToast('Undo');
  }, [showToast, setProjectName, setAspect, setClips, setTexts, setCaptions, setMarkers, setInPoint, setOutPoint, setTrackSettings]);

  const redo = useCallback(() => {
    const h = historyRef.current;
    if (h.future.length === 0) return;
    skipHistoryRef.current = true;
    const next = h.future[0];
    h.future = h.future.slice(1);
    h.past = [...h.past, h.present];
    h.present = next;
    const s = JSON.parse(next) as { projectName: string; aspect: Aspect; clips: Clip[]; texts: TextOverlay[]; captions?: Caption[]; markers?: TimelineMarker[]; inPoint?: number | null; outPoint?: number | null; trackSettings?: TrackSettingsMap };
    setProjectName(s.projectName);
    setAspect(s.aspect);
    setClips(s.clips.map(hydrateClip));
    setTexts(s.texts);
    setCaptions(s.captions ?? []);
    setMarkers(s.markers ?? []);
    setInPoint(s.inPoint ?? null);
    setOutPoint(s.outPoint ?? null);
    setTrackSettings(s.trackSettings ?? {});
    showToast('Redo');
  }, [showToast, setProjectName, setAspect, setClips, setTexts, setCaptions, setMarkers, setInPoint, setOutPoint, setTrackSettings]);

  const handleSaveProject = useCallback(async () => {
    setSaveState('saving');
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
      setSaveState('unsaved');
      return;
    }
    const data = JSON.stringify({ version: 2, name: projectName, aspect, clips: clipList, texts: textList, captions, markers, inPoint, outPoint, trackSettings, assets: stored }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    downloadBlob(blob, `${projectName.trim().replace(/[\\/:*?"<>|]+/g, '-') || 'clipforge'}.clipforge.json`);
    showToast('Project saved with embedded media.');
    setSaveState('saved');
  }, [projectName, aspect, captions, markers, inPoint, outPoint, trackSettings, showToast]);

  const handleLoadProject = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = parseProjectData(JSON.parse(String(reader.result)));
        resetProject();
        setProjectName(data.name);
        setAspect(data.aspect);
        const newClips = data.clips.map(hydrateClip);
        setTexts(data.texts);
        setCaptions(data.captions ?? []);
        setMarkers(data.markers ?? []);
        setInPoint(data.inPoint ?? null);
        setOutPoint(data.outPoint ?? null);
        setTrackSettings(data.trackSettings ?? {});
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
        setSaveState('failed');
        showToast('Could not read project file.');
      }
    };
    reader.readAsText(file);
  }, [addAssets, resetProject, showToast, setProjectName, setClips, setAspect, setTexts]);

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
  }, [selection?.id, setClips, setSelection]);

  const saveToRecent = useCallback(async () => {
    setSaveState('saving');
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
        videoJson: JSON.stringify({ version: 2, name, aspect: asp, clips: clipList, texts: textList, captions, markers, inPoint, outPoint, trackSettings }),
        assets: storedAssets,
      };
      await putRecentProject(entry);

      // Opt-in cloud sync (VITE_SUPABASE_CLOUD_PROJECTS=true + signed-in user).
      // Snapshots are cheap; media files upload incrementally (missing ids only).
      let cloudNote = '';
      if (cloudProjectsEnabled) {
        try {
          const cloudInput: Parameters<typeof saveCloudProject>[0] = {
            name,
            aspect: asp,
            snapshot: { version: 2, name, aspect: asp, clips: clipList, texts: textList, captions, markers, inPoint, outPoint, trackSettings },
            ...(thumbnail ? { thumbnail } : {}),
          };
          if (cloudProjectIdRef.current) cloudInput.id = cloudProjectIdRef.current;
          const saved = await saveCloudProject(cloudInput);
          cloudProjectIdRef.current = saved.id;
          cloudNote = ' Synced to cloud.';
          const cloudAssets = storedAssets.filter((a) => a.blob.size > 0);
          if (cloudAssets.length > 0) {
            showToast('Syncing media to cloud…');
            const { uploaded } = await syncProjectAssets(saved.id, cloudAssets);
            if (uploaded > 0) cloudNote = ` Synced to cloud (${uploaded} media file${uploaded === 1 ? '' : 's'} uploaded).`;
          }
        } catch (err) {
          console.error(err);
          cloudNote = ' Cloud sync failed — saved locally only.';
        }
      }

      setSaveState('saved');
      showToast(`Saved to dashboard — reopen anytime.${cloudNote}`);
    } catch (err) {
      console.error(err);
      setSaveState('failed');
      showToast('Could not save to dashboard.');
    }
  }, [showToast, projectName, aspect, captions, markers, inPoint, outPoint, trackSettings]);

  const openRecent = useCallback(async (entry: RecentProject) => {
    if (entry.kind === 'video' && entry.videoJson) {
      try {
        const parsed = JSON.parse(entry.videoJson) as { name: string; aspect: Aspect; clips: Clip[]; texts: TextOverlay[]; captions?: Caption[]; markers?: TimelineMarker[]; inPoint?: number | null; outPoint?: number | null; trackSettings?: TrackSettingsMap };
        resetProject();
        // Re-saving a project opened from the cloud updates the same cloud row.
        cloudProjectIdRef.current = entry.cloudId;

        // Cloud entries carry no blobs locally — fetch the stored media.
        let assets = entry.assets;
        if (!assets?.some((a) => a.blob.size > 0) && entry.cloudId && cloudProjectsEnabled) {
          showToast('Downloading media from cloud…');
          try {
            assets = await fetchProjectAssets(entry.cloudId);
          } catch (err) {
            console.error(err);
            showToast('Cloud media could not be downloaded — clips will need re-importing.');
            assets = [];
          }
        }

        setProjectName(parsed.name);
        setAspect(parsed.aspect);
        // historyRef was cleared by resetProject; re-seed with the loaded project
        historyRef.current = { past: [], present: JSON.stringify({ projectName: parsed.name, aspect: parsed.aspect, clips: parsed.clips, texts: parsed.texts }), future: [] };
        setSelection(null);
        setCaptions(parsed.captions ?? []);
        setMarkers(parsed.markers ?? []);
        setInPoint(parsed.inPoint ?? null);
        setOutPoint(parsed.outPoint ?? null);
        setTrackSettings(parsed.trackSettings ?? {});
        setCurrentTime(0);
        const hydratedAssets: MediaAsset[] = [];
        const newMediaEls: Array<[string, HTMLVideoElement | HTMLAudioElement | HTMLImageElement]> = [];
        for (const a of assets ?? []) {
          if (a.blob.size === 0) continue;
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
        setClips(parsed.clips.map(hydrateClip));
        setTexts(parsed.texts);
        setMode('video');
        const missing = parsed.clips.filter((c) => !hydratedAssets.some((a) => a.id === c.assetId)).length;
        showToast(`Opened from dashboard.${missing > 0 ? ` ${missing} clip(s) need media re-import.` : ''}`);
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
  }, [showToast, resetProject, setSelection, setProjectName, setClips, setAspect, setTexts, setAssets]);

  const applyTemplate = useCallback((template: typeof VIDEO_TEMPLATES[number]) => {
    const mkText = (text: string, y: number, size: number, color: string, animation: TextOverlay['animation']): TextOverlay => ({
      id: uid(), text, x: 0.5, y, size, color, start: 0, duration: 6, animation,
    });
    const s = template.scaffold;
    const titleSize = template.aspect === '16:9' ? 88 : template.aspect === '1:1' ? 66 : 54;
    const texts = [
      mkText(s.kicker, 0.295, 20, s.accent, 'fade'),
      mkText(s.title, 0.44, titleSize, '#ffffff', 'scale-in'),
      mkText(s.subtitle, 0.59, 25, '#d8d8d8', 'fade'),
      mkText(s.handle.toUpperCase(), 0.92, 16, s.accent, 'none'),
    ];
    setProjectName(template.name);
    setAspect(template.aspect);
    setClips([]);
    setTexts(texts);
    setSelection(null);
    setCurrentTime(0);
    setMode('video');
    showToast('Template applied — replace the sample copy and drop in your media.');
  }, [showToast, setProjectName, setAspect, setClips, setTexts, setSelection]);

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

  /* ---------------------------------------- offline (WebCodecs) MP4 export ---------------------------------------- */

  /** Seek every active video element to its exact source time for `t`, then composite. */
  const seekAndDraw = useCallback(async (t: number) => {
    const { clips: clipList, assets: assetList } = stateRef.current;
    const seeks: Promise<void>[] = [];
    for (const clip of clipList) {
      if (t < clip.start || t >= clip.start + clip.duration) continue;
      const asset = assetList.find((a) => a.id === clip.assetId);
      if (!asset || asset.kind === 'image') continue;
      const el = mediaEls.current.get(clip.assetId);
      if (!(el instanceof HTMLVideoElement)) continue;
      if (!el.paused) el.pause();
      const target = Math.min(clip.trimStart + (t - clip.start) * clip.speed, Math.max(0, asset.duration - 0.05));
      if (Math.abs(el.currentTime - target) < 0.002) continue;
      seeks.push(new Promise<void>((resolve) => {
        const done = () => { el.removeEventListener('seeked', done); clearTimeout(timer); resolve(); };
        // A stuck element must not hang the export; draw whatever it shows.
        const timer = setTimeout(done, 2000);
        el.addEventListener('seeked', done);
        el.currentTime = target;
      }));
    }
    await Promise.all(seeks);
    const canvas = exportCanvasRef.current ?? canvasRef.current;
    if (canvas) renderFrame(frameOptions(canvas, t));
  }, [frameOptions]);

  /** Render the full timeline audio offline (decode + mix + envelopes). */
  const renderAudioOffline = useCallback(async (): Promise<AudioBuffer | null> => {
    const { clips: clipList, assets: assetList, trackSettings } = stateRef.current;
    const audible = clipList.filter((c) => !c.muted && !trackSettings[c.trackId]?.muted);
    if (audible.length === 0) return null;
    const decodeCtx = new AudioContext({ sampleRate: 48000 });
    try {
      const buffers = new Map<string, AudioBuffer | null>();
      await Promise.all(audible.map(async (clip) => {
        if (buffers.has(clip.assetId)) return;
        const asset = assetList.find((a) => a.id === clip.assetId);
        if (!asset) { buffers.set(clip.assetId, null); return; }
        try {
          const res = await fetch(asset.url);
          buffers.set(clip.assetId, await decodeCtx.decodeAudioData(await res.arrayBuffer()));
        } catch {
          buffers.set(clip.assetId, null); // video with no audio track, or unsupported codec
        }
      }));
      if (!audible.some((c) => buffers.get(c.assetId))) return null;

      const dur = stateRef.current.duration;
      const off = new OfflineAudioContext(2, Math.ceil(Math.max(dur, 0.1) * 48000), 48000);
      for (const clip of audible) {
        const buffer = buffers.get(clip.assetId);
        if (!buffer) continue;
        const src = off.createBufferSource();
        src.buffer = buffer;
        // shortcut: speed ≠ 1 resamples the audio (pitch shifts); live preview scrubs instead — only differs for retimed clips
        src.playbackRate.value = clip.speed;
        const gain = off.createGain();
        const envelope = (elapsed: number) => Math.max(0, clipVolumeAt(clip, elapsed));
        // 100 ms linear ramps approximate the keyframe/fade envelope; a constant
        // clip gets a single point (no staircase, no per-sample events).
        gain.gain.setValueAtTime(envelope(0), clip.start);
        if (clip.volumeFadeIn > 0 || clip.volumeFadeOut > 0 || clip.keyframes?.volume?.length) {
          for (let s = 0.1; s < clip.duration; s += 0.1) {
            gain.gain.linearRampToValueAtTime(envelope(s), clip.start + s);
          }
          gain.gain.linearRampToValueAtTime(envelope(clip.duration), clip.start + clip.duration);
        }
        src.connect(gain).connect(off.destination);
        src.start(clip.start, Math.min(clip.trimStart, Math.max(0, buffer.duration - 0.05)), clip.duration * clip.speed);
      }
      return await off.startRendering();
    } finally {
      void decodeCtx.close().catch(() => undefined);
    }
  }, []);

  /** Render the timeline to an MP4 Blob via the offline WebCodecs path (no download). */
  const renderOfflineMp4 = useCallback(async (quality: ExportQuality, bitrate: number) => {
    const dur = stateRef.current.duration;
    const canvas = prepareExportCanvas(quality);
    if (!canvas) return { status: 'unsupported' as const };
    try {
      setExportProgress(0);
      const result = await exportTimelineMp4({
        canvas,
        width: canvas.width,
        height: canvas.height,
        duration: dur,
        fps: 30,
        bitrate,
        seekAndDraw,
        renderAudio: renderAudioOffline,
        isCancelled: () => exportCancelledRef.current,
        onProgress: (p) => setExportProgress(p),
      });
      setExportProgress(null);
      exportCanvasRef.current = null;
      drawAndSync(currentTimeRef.current, false);
      if (result.status === 'done') return { status: 'done' as const, blob: result.blob };
      return result; // 'unsupported' | 'cancelled'
    } catch (err) {
      if (exportCancelledRef.current) return { status: 'cancelled' as const };
      console.error(err);
      setExportProgress(null);
      exportCanvasRef.current = null;
      drawAndSync(currentTimeRef.current, false);
      return { status: 'failed' as const };
    }
  }, [prepareExportCanvas, seekAndDraw, renderAudioOffline, drawAndSync]);

  /** Try the offline WebCodecs MP4 export. true = handled (done/cancelled), false = unsupported/failed → fallback. */
  const tryOfflineMp4Export = useCallback(async (quality: ExportQuality, bitrate: number): Promise<boolean> => {
    showToast('Rendering MP4 as fast as your machine allows…');
    const result = await renderOfflineMp4(quality, bitrate);
    if (result.status === 'done') {
      const base = projectName.trim().replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80) || 'clipforge';
      downloadBlob(result.blob, `${base}.mp4`);
      showToast(`Exported MP4 ${(result.blob.size / 1_000_000).toFixed(1)} MB — check your downloads.`);
      return true;
    }
    if (result.status === 'cancelled') return true; // cancelExport already toasted
    if (result.status === 'failed') {
      showToast('Fast MP4 export failed — falling back to the classic recorder…');
      return false;
    }
    return false; // unsupported → caller falls back to the recorder + ffmpeg path
  }, [renderOfflineMp4, projectName, showToast]);

  /** Share link: render 720p MP4 via the offline path and publish to the public bucket. */
  const handleShare = useCallback(async () => {
    if (sharing) return;
    if (!cloudProjectsEnabled || !supabase) {
      showToast('Share links need a Supabase-backed deployment with cloud projects enabled.');
      return;
    }
    if (stateRef.current.duration <= 0) { showToast('Add something to the timeline first.'); return; }
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { showToast('Sign in from the gate to create a share link — local-mode projects stay on this device.'); return; }
    setSharing(true);
    exportCancelledRef.current = false;
    cancelAnimationFrame(rafRef.current);
    playingRef.current = false;
    setPlaying(false);
    for (const [, el] of mediaEls.current) { if (!(el instanceof HTMLImageElement) && !el.paused) el.pause(); }
    showToast('Rendering the share video (MP4, 720p)…');
    const render = await renderOfflineMp4('720p', 8_000_000);
    if (render.status === 'cancelled') { setSharing(false); return; } // cancelExport already toasted
    if (render.status !== 'done') {
      setSharing(false);
      showToast('Could not render the share video — export an MP4 instead and upload it manually.');
      return;
    }
    showToast('Publishing the share video…');
    const result = await publishShare(render.blob);
    setSharing(false);
    if (result.status === 'unsupported') { showToast('Sign in from the gate to create a share link.'); return; }
    if (result.status === 'failed') { showToast(result.message); return; }
    try {
      await navigator.clipboard.writeText(result.url);
      showToast('Share link copied to clipboard.');
    } catch {
      showToast(`Share link ready: ${result.url}`);
    }
  }, [sharing, renderOfflineMp4, showToast]);


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
    renderFrame(frameOptions(canvas, 0));
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
  }, [frameOptions, ensureAudioGraph, syncAudioGraph, play, prepareExportCanvas, projectName, showToast]);

  const handleExportMp4 = useCallback(async (quality: ExportQuality, bitrate: number) => {
    const dur = stateRef.current.duration;
    if (dur <= 0) { showToast('Nothing to export yet.'); return; }
    if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
      showToast('This browser does not support video export. Try the desktop app or a Chromium-based browser.');
      return;
    }
    setMp4Busy(true);
    exportCancelledRef.current = false;
    // Freeze preview playback: the offline path drives the same media elements.
    cancelAnimationFrame(rafRef.current);
    playingRef.current = false;
    setPlaying(false);
    for (const [, el] of mediaEls.current) { if (!(el instanceof HTMLImageElement) && !el.paused) el.pause(); }
    try {
      if (await tryOfflineMp4Export(quality, bitrate)) { setMp4Busy(false); return; }
    } catch (err) {
      console.error(err);
      if (exportCancelledRef.current) { setMp4Busy(false); return; }
      showToast('Fast export failed — falling back to the classic recorder…');
    }
    setExportProgress(null);
    const ctx = ensureAudioGraph();
    syncAudioGraph();
    currentTimeRef.current = 0;
    setCurrentTime(0);
    const canvas = prepareExportCanvas(quality);
    if (!canvas) { setMp4Busy(false); return; }
    renderFrame(frameOptions(canvas, 0));
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
  }, [frameOptions, ensureAudioGraph, syncAudioGraph, play, prepareExportCanvas, projectName, showToast, tryOfflineMp4Export]);

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

  useEffect(() => {
    const unsubscribe = window.clipforge?.onMenuAction((action) => {
      if (action === 'save-project') void handleSaveProject();
      if (action === 'open-project') showToast('Use Load in the top bar to choose a project file.');
      if (action === 'import-media') showToast('Use Import in the media panel to choose media files.');
    });
    return () => unsubscribe?.();
  }, [handleSaveProject, showToast]);

  const hasContent = clips.length + texts.length > 0;
  const importCaptions = useCallback((file: File) => {
    void file.text().then((text) => {
      const imported = parseCaptions(text);
      if (imported.length === 0) {
        showToast('No valid SRT/VTT captions were found.');
        return;
      }
      setCaptions(imported);
      showToast(`Imported ${imported.length} caption${imported.length === 1 ? '' : 's'}.`);
    }).catch((error) => {
      console.error(error);
      showToast('Could not read the caption file.');
    });
  }, [showToast]);
  const exportCaptions = useCallback((format: 'srt' | 'vtt') => {
    if (captions.length === 0) {
      showToast('There are no captions to export.');
      return;
    }
    downloadBlob(new Blob([serializeCaptions(captions, format)], { type: 'text/plain;charset=utf-8' }), `${projectName || 'clipforge'}.${format}`);
    showToast(`Exported ${format.toUpperCase()} captions.`);
  }, [captions, projectName, showToast]);
  const addMarker = useCallback(() => {
    setMarkers((previous) => [...previous, { id: uid(), time: currentTimeRef.current, label: `M${previous.length + 1}` }].sort((a, b) => a.time - b.time));
  }, []);
  const setInPointAtPlayhead = useCallback(() => {
    const time = currentTimeRef.current;
    setInPoint(time);
    setOutPoint((previous) => previous !== null && previous < time ? null : previous);
  }, []);
  const setOutPointAtPlayhead = useCallback(() => {
    const time = currentTimeRef.current;
    setOutPoint(time);
    setInPoint((previous) => previous !== null && previous > time ? null : previous);
  }, []);

  /* ------------------------------------------------ share link route ------------------------------------------------ */

  // Any `#/share/...` hash routes to the public viewer; ShareView classifies
  // well-formed vs malformed links itself.
  if (typeof window !== 'undefined' && window.location.hash.startsWith('#/share')) {
    return <ShareView />;
  }

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
      <AuthGate>
        <Dashboard
          onNewVideo={handleOpenVideo}
          onNewImage={handleOpenImage}
          onImportVideo={handleImportFiles}
          onImportImage={handleImportImage}
          onApplyTemplate={applyTemplate}
          onOpenRecent={openRecent}
        />
      </AuthGate>
    );
  }

  if (mode === 'image' && imageSource) {
    return (
      <AuthGate>
        <ErrorBoundary fallback={<div className="error-state">The image editor could not render. Return to the dashboard and try again.</div>}>
          <ImageEditor
            initialImage={imageSource}
            initialName={imageName}
            onClose={() => setMode('dashboard')}
            onExportRecent={saveImageToRecent}
          />
        </ErrorBoundary>
      </AuthGate>
    );
  }

  return (
    <AuthGate>
      <motion.div
        className="app"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 0.8, 0.26, 1] }}
      >
      <TopBar
        projectName={projectName}
        onProjectNameChange={setProjectName}
        aspect={aspect}
        onAspectChange={setAspect}
        onExport={handleExport}
        onExportMp4={handleExportMp4}
        onCancelExport={cancelExport}
        onAddText={handleAddText}
        onAddSticker={handleAddSticker}
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
        onImportCaptions={importCaptions}
        onExportCaptions={exportCaptions}
        saveState={saveState}
        onCommandPalette={() => setCommandOpen(true)}
        onShare={() => void handleShare()}
        shareBusy={sharing}
      />
      <main className={`workspace${collapsedPanels.media ? ' media-collapsed' : ''}${collapsedPanels.inspector ? ' inspector-collapsed' : ''}`}>
        {!collapsedPanels.media && <MediaPanel
          assets={assets}
          onImportFiles={handleImportFiles}
          onGenerateSampleVideo={handleGenerateSampleVideo}
          onGenerateSampleImage={handleGenerateSampleImage}
          onAddToTimeline={handleAddToTimeline}
          onDeleteAsset={handleDeleteAsset}
          generatingSample={generatingSample}
        />}
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
        {!collapsedPanels.inspector && <Inspector
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
        />}
      </main>
      {!collapsedPanels.timeline && <Timeline
        clips={clips}
        texts={[...texts, ...captions.map((caption) => ({ id: caption.id, text: caption.text, x: 0.5, y: 0.86, size: 30, color: 'white', start: caption.start, duration: caption.duration, animation: 'none' as const }))]}
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
        snapEnabled={snapEnabled}
        onSnapEnabledChange={setSnapEnabled}
        markers={markers}
        onAddMarker={addMarker}
        onRemoveMarker={(id) => setMarkers((previous) => previous.filter((marker) => marker.id !== id))}
        inPoint={inPoint}
        outPoint={outPoint}
        onSetInPoint={setInPointAtPlayhead}
        onSetOutPoint={setOutPointAtPlayhead}
        onClearRange={() => { setInPoint(null); setOutPoint(null); }}
        trackSettings={trackSettings}
        onTrackSettingsChange={setTrackSettings}
        rippleEnabled={rippleEnabled}
        onRippleEnabledChange={setRippleEnabled}
        onDetectBeats={() => void handleDetectBeats()}
        onAutoCaptions={() => void handleAutoCaptions()}
        autoCaptioning={autoCaptioning}
      />}
      <div className="workspace-dock" aria-label="Workspace panels">
        <button className="btn ghost small" onClick={() => setCollapsedPanels((p) => ({ ...p, media: !p.media }))}>{collapsedPanels.media ? 'Show media' : 'Hide media'}</button>
        <button className="btn ghost small" onClick={() => setCollapsedPanels((p) => ({ ...p, inspector: !p.inspector }))}>{collapsedPanels.inspector ? 'Show inspector' : 'Hide inspector'}</button>
        <button className="btn ghost small" onClick={() => setCollapsedPanels((p) => ({ ...p, timeline: !p.timeline }))}>{collapsedPanels.timeline ? 'Show timeline' : 'Hide timeline'}</button>
      </div>
      <AnimatePresence>
        {toast && (
          <motion.div
            className="toast"
            role="status"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.25, ease: [0.22, 0.8, 0.26, 1] }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {commandOpen && (
          <motion.div
            className="modal-backdrop"
            role="presentation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onMouseDown={(e) => { if (e.target === e.currentTarget) setCommandOpen(false); }}
          >
            <motion.section
              className="modal command-palette"
              role="dialog"
              aria-modal="true"
              aria-labelledby="command-title"
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 6 }}
              transition={{ duration: 0.22, ease: [0.22, 0.8, 0.26, 1] }}
            >
            <h2 id="command-title">Command palette</h2>
            <p className="muted-note">Searchless quick actions for the editor.</p>
            <div className="command-list">
              <button onClick={() => { handleAddText(); setCommandOpen(false); }}>Add text <span>Text</span></button>
              <button onClick={() => { addMarker(); setCommandOpen(false); }}>Add marker <span>M</span></button>
              <button onClick={() => { setInPointAtPlayhead(); setCommandOpen(false); }}>Set in point <span>I</span></button>
              <button onClick={() => { setOutPointAtPlayhead(); setCommandOpen(false); }}>Set out point <span>O</span></button>
              <button onClick={() => { setSnapEnabled((value) => !value); setCommandOpen(false); }}>Toggle snapping <span>Snap</span></button>
              <button onClick={() => { void saveToRecent(); setCommandOpen(false); }}>Save to recents <span>Ctrl+S</span></button>
              <button onClick={() => { setCommandOpen(false); setTimeout(() => document.querySelector<HTMLButtonElement>('.topbar .btn:not(.ghost)')?.click(), 0); }}>Open export <span>Export</span></button>
            </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
      </motion.div>
    </AuthGate>
  );
}

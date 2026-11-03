import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TopBar from './components/TopBar';
import MediaPanel from './components/MediaPanel';
import Stage from './components/Stage';
import Inspector from './components/Inspector';
import Timeline from './components/Timeline';
import { createMediaElement, generateSampleImage, generateSampleVideo, probeAsset } from './media';
import { clamp, downloadBlob, pickSupportedMime, uid } from './util';
import type { Aspect, Clip, MediaAsset, MediaKind, Selection, TextOverlay } from './types';

export default function App() {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [texts, setTexts] = useState<TextOverlay[]>([]);
  const [projectName, setProjectName] = useState('Untitled project');
  const [aspect, setAspect] = useState<Aspect>('16:9');
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [pxPerSec, setPxPerSec] = useState(45);
  const [toast, setToast] = useState<string | null>(null);
  const [generatingSample, setGeneratingSample] = useState(false);
  const [exportProgress, setExportProgress] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaEls = useRef(new Map<string, HTMLVideoElement | HTMLAudioElement | HTMLImageElement>());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const exportDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const sourceByAsset = useRef(new Map<string, MediaElementAudioSourceNode>());
  const gainByClip = useRef(new Map<string, GainNode>());
  const exportRecorderRef = useRef<MediaRecorder | null>(null);

  const rafRef = useRef(0);
  const startStampRef = useRef(0);
  const startOffsetRef = useRef(0);
  const currentTimeRef = useRef(0);
  const playingRef = useRef(false);

  const stateRef = useRef({ assets, clips, texts, duration: 0 });

  const duration = useMemo(
    () => Math.max(0, ...clips.map((c) => c.start + c.duration), ...texts.map((t) => t.start + t.duration)),
    [clips, texts],
  );
  // Keep the shared snapshot outside render — callbacks read it via ref.
  useEffect(() => {
    stateRef.current = { assets, clips, texts, duration };
  });

  const assetKindById = useMemo(() => {
    const map: Record<string, MediaKind | undefined> = {};
    for (const a of assets) map[a.id] = a.kind;
    return map;
  }, [assets]);

  const showToast = useCallback((message: string) => setToast(message), []);

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
      const target = active && !clip.muted ? clip.volume : 0;
      gain.gain.setTargetAtTime(target, now, 0.03);
    }
  }, []);

  useEffect(() => {
    syncAudioGraph();
    applyGains(currentTimeRef.current);
  }, [clips, assets, syncAudioGraph, applyGains]);

  /* ------------------------------------------------ rendering ------------------------------------------------ */

  const drawFrame = useCallback((t: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    const { clips: clipList, texts: textList, assets: assetList } = stateRef.current;

    ctx.fillStyle = '#050506';
    ctx.fillRect(0, 0, W, H);

    const drawFitted = (el: HTMLVideoElement | HTMLImageElement, fit: Clip['fit']) => {
      const iw = el instanceof HTMLImageElement ? el.naturalWidth : el.videoWidth;
      const ih = el instanceof HTMLImageElement ? el.naturalHeight : el.videoHeight;
      if (!iw || !ih) return;
      const scale = fit === 'cover' ? Math.max(W / iw, H / ih) : Math.min(W / iw, H / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      ctx.drawImage(el, (W - dw) / 2, (H - dh) / 2, dw, dh);
    };

    for (const trackId of ['v1', 'v2']) {
      for (const clip of clipList) {
        if (clip.trackId !== trackId) continue;
        if (t < clip.start || t >= clip.start + clip.duration) continue;
        const asset = assetList.find((a) => a.id === clip.assetId);
        if (!asset) continue;
        const el = mediaEls.current.get(clip.assetId);
        if (!el) continue;
        if (el instanceof HTMLImageElement) {
          if (el.complete && el.naturalWidth) drawFitted(el, clip.fit);
        } else if (el instanceof HTMLVideoElement) {
          if (el.readyState >= 2) drawFitted(el, clip.fit);
        }
      }
    }

    for (const overlay of textList) {
      if (t < overlay.start || t >= overlay.start + overlay.duration) continue;
      const scale = H / 720;
      const size = overlay.size * scale;
      const lines = overlay.text.split('\n');
      const lineHeight = size * 1.18;
      const x = overlay.x * W;
      const y = overlay.y * H;
      ctx.save();
      ctx.font = `800 ${size}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(2, size * 0.16);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.62)';
      ctx.fillStyle = overlay.color;
      lines.forEach((line, i) => {
        const ly = y + (i - (lines.length - 1) / 2) * lineHeight;
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
      const target = clip.trimStart + (t - clip.start);
      if (active) {
        if (Math.abs(el.currentTime - target) > 0.35) el.currentTime = target;
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
    const dur = stateRef.current.duration;
    const elapsed = (performance.now() - startStampRef.current) / 1000;
    const t = Math.min(startOffsetRef.current + elapsed, dur);
    currentTimeRef.current = t;
    setCurrentTime(t);
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

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  /* ------------------------------------------------ project ops ------------------------------------------------ */

  const addAssets = useCallback((items: MediaAsset[]) => {
    for (const asset of items) mediaEls.current.set(asset.id, createMediaElement(asset));
    setAssets((prev) => [...prev, ...items]);
  }, []);

  const handleImportFiles = useCallback((files: FileList | File[]) => {
    void (async () => {
      const probed: MediaAsset[] = [];
      for (const file of Array.from(files)) {
        const asset = await probeAsset(file);
        if (asset) probed.push(asset);
        else console.warn('Skipped unreadable file:', file.name);
      }
      if (probed.length) {
        addAssets(probed);
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

  const handleAddToTimeline = useCallback((assetId: string) => {
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) return;
    const trackId = asset.kind === 'audio' ? 'a1' : 'v1';
    const start = trackEnd(trackId);
    const length = asset.kind === 'image' ? Math.min(5, asset.duration) : asset.duration;
    const clip: Clip = {
      id: uid(),
      assetId,
      trackId,
      name: asset.name,
      start,
      duration: Math.max(0.1, length),
      trimStart: 0,
      trimEnd: Math.max(0, asset.duration - length),
      volume: 1,
      muted: false,
      fit: 'cover',
    };
    setClips((prev) => [...prev, clip]);
    setSelection({ type: 'clip', id: clip.id });
  }, [assets, trackEnd]);

  const handleAddText = useCallback(() => {
    const overlay: TextOverlay = {
      id: uid(),
      text: 'Your text here',
      x: 0.5,
      y: 0.82,
      size: 64,
      color: '#ffffff',
      start: clamp(currentTimeRef.current, 0, Math.max(0, stateRef.current.duration)),
      duration: 3,
    };
    setTexts((prev) => [...prev, overlay]);
    setSelection({ type: 'text', id: overlay.id });
  }, []);

  const handleDeleteSelection = useCallback(() => {
    setSelection((sel) => {
      if (!sel) return sel;
      if (sel.type === 'clip') setClips((prev) => prev.filter((c) => c.id !== sel.id));
      else setTexts((prev) => prev.filter((t) => t.id !== sel.id));
      return null;
    });
  }, []);

  const patchClip = useCallback((id: string, patch: Partial<Clip>) => {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const patchText = useCallback((id: string, patch: Partial<TextOverlay>) => {
    setTexts((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

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
        trimStart: clip.trimStart + leftDuration,
      };
      const updated: Clip = { ...clip, duration: leftDuration };
      setSelection({ type: 'clip', id: rightClip.id });
      return prev.flatMap((c) => (c.id === clip.id ? [updated, rightClip] : [c]));
    });
  }, [selection?.id]);

  /* ------------------------------------------------ export ------------------------------------------------ */

  const handleExport = useCallback(() => {
    const dur = stateRef.current.duration;
    if (dur <= 0) {
      showToast('Nothing to export yet.');
      return;
    }
    const ctx = ensureAudioGraph();
    syncAudioGraph();
    cancelAnimationFrame(rafRef.current);
    playingRef.current = false;
    setPlaying(false);
    currentTimeRef.current = 0;
    setCurrentTime(0);
    drawFrame(0);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const videoStream = canvas.captureStream(30);
    const dest = ctx.createMediaStreamDestination();
    masterGainRef.current?.connect(dest);
    exportDestRef.current = dest;

    const combined = new MediaStream([...videoStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const mime = pickSupportedMime(['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']);
    const recorder = new MediaRecorder(
      combined,
      mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000 } : undefined,
    );
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      masterGainRef.current?.disconnect(dest);
      exportDestRef.current = null;
      setExportProgress(null);
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
  }, [drawFrame, ensureAudioGraph, syncAudioGraph, play, projectName, showToast]);

  /* ------------------------------------------------ keyboard ------------------------------------------------ */

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target?.closest('input, textarea, select, [contenteditable="true"]');
      if (typing) return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteSelection();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        if (canSplit) handleSplit();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePlay, handleDeleteSelection, handleSplit, canSplit]);

  /* ------------------------------------------------ frame draw on state changes ------------------------------------------------ */

  useEffect(() => {
    if (!playingRef.current) drawAndSync(currentTime, false);
  }, [currentTime, aspect, clips, texts, drawAndSync]);

  const hasContent = clips.length + texts.length > 0;

  return (
    <div className="app">
      <TopBar
        projectName={projectName}
        onProjectNameChange={setProjectName}
        aspect={aspect}
        onAspectChange={setAspect}
        onExport={handleExport}
        onAddText={handleAddText}
        exportProgress={exportProgress}
        canExport={duration > 0}
      />
      <main className="workspace">
        <MediaPanel
          assets={assets}
          onImportFiles={handleImportFiles}
          onGenerateSampleVideo={handleGenerateSampleVideo}
          onGenerateSampleImage={handleGenerateSampleImage}
          onAddToTimeline={handleAddToTimeline}
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
          onChangeClip={patchClip}
          onChangeText={patchText}
          onDeleteSelection={handleDeleteSelection}
          onSplit={handleSplit}
        />
      </main>
      <Timeline
        clips={clips}
        texts={texts}
        assetKindById={assetKindById}
        duration={duration}
        currentTime={currentTime}
        pxPerSec={pxPerSec}
        onPxPerSecChange={setPxPerSec}
        selection={selection}
        onSelect={setSelection}
        onSeek={seek}
        onPatchClip={patchClip}
        onPatchText={patchText}
      />
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

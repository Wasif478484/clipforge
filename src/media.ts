import { uid } from './util';
import type { MediaAsset, MediaKind } from './types';

export function probeAsset(file: File): Promise<MediaAsset | null> {
  const kind: MediaKind = file.type.startsWith('video/')
    ? 'video'
    : file.type.startsWith('audio/')
      ? 'audio'
      : file.type.startsWith('image/')
        ? 'image'
        : 'video';
  const url = URL.createObjectURL(file);

  return new Promise((resolve) => {
    if (kind === 'image') {
      const img = new Image();
      img.onload = () =>
        resolve({ id: uid(), name: file.name, kind, url, duration: 5, width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
      return;
    }
    const el = document.createElement(kind === 'video' ? 'video' : 'audio');
    el.preload = 'metadata';
    const done = () => {
      const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 5;
      resolve({
        id: uid(), name: file.name, kind, url, duration,
        width: kind === 'video' ? (el as HTMLVideoElement).videoWidth : undefined,
        height: kind === 'video' ? (el as HTMLVideoElement).videoHeight : undefined,
      });
    };
    el.onloadedmetadata = done;
    el.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    el.src = url;
  });
}

/** Create the backing DOM element for an asset (kept off-screen). */
export function createMediaElement(asset: MediaAsset): HTMLVideoElement | HTMLAudioElement | HTMLImageElement {
  if (asset.kind === 'image') {
    const img = new Image();
    img.src = asset.url;
    return img;
  }
  const el = document.createElement(asset.kind === 'video' ? 'video' : 'audio');
  el.src = asset.url;
  el.preload = 'auto';
  el.loop = false;
  (el as HTMLVideoElement).playsInline = true;
  el.load();
  return el;
}

export interface SampleResult {
  name: string;
  kind: MediaKind;
  url: string;
  duration: number;
  width?: number;
  height?: number;
}

/**
 * Generate a ~6 s sample clip entirely in the browser:
 * animated background + bouncing ball on a canvas, with a soft two-tone chime.
 * Returns an object URL for the resulting WebM.
 */
export function generateSampleVideo(onProgress?: (frac: number) => void): Promise<SampleResult> {
  return new Promise((resolve, reject) => {
    const duration = 6;
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return reject(new Error('Canvas 2D unavailable'));

    const stream = canvas.captureStream(30);

    let audio: AudioContext | null = null;
    let audioDest: MediaStreamAudioDestinationNode | null = null;
    try {
      audio = new AudioContext();
      audioDest = audio.createMediaStreamDestination();
      const master = audio.createGain();
      master.gain.value = 0.08;
      master.connect(audioDest);
      [220, 330, 440].forEach((freq, i) => {
        const o = audio!.createOscillator();
        o.type = i === 2 ? 'triangle' : 'sine';
        o.frequency.value = freq;
        const g = audio!.createGain();
        g.gain.setValueAtTime(0.0001, 0);
        // simple arpeggio
        const t0 = i * 0.7;
        g.gain.exponentialRampToValueAtTime(0.9, t0 + 0.05);
        g.gain.setValueAtTime(0.9, t0 + 0.45);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.65);
        o.connect(g);
        g.connect(master);
        o.start(t0);
        o.stop(t0 + 0.7);
      });
    } catch {
      audio = null;
      audioDest = null;
    }

    const tracks = [...stream.getVideoTracks(), ...(audioDest ? audioDest.stream.getAudioTracks() : [])];
    const combined = new MediaStream(tracks);
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) =>
      MediaRecorder.isTypeSupported(m),
    );
    const recorder = new MediaRecorder(combined, mime ? { mimeType: mime, videoBitsPerSecond: 4_000_000 } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

    const started = performance.now();
    const draw = (): boolean => {
      const t = (performance.now() - started) / 1000;
      const f = t / duration;
      onProgress?.(Math.min(1, f));
      // animated background
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grad.addColorStop(0, `hsl(${(t * 40) % 360} 60% 18%)`);
      grad.addColorStop(1, `hsl(${(t * 40 + 120) % 360} 60% 32%)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // grid
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
      for (let y = 0; y < canvas.height; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
      // bouncing ball
      const bx = (Math.sin(t * 1.7) * 0.5 + 0.5) * (canvas.width - 120) + 60;
      const by = (1 - Math.abs(Math.sin(t * 3.1))) * (canvas.height - 400) + 80;
      const ball = ctx.createRadialGradient(bx - 12, by - 12, 10, bx, by, 52);
      ball.addColorStop(0, '#8ffbe0');
      ball.addColorStop(1, '#0f8f77');
      ctx.fillStyle = ball;
      ctx.beginPath();
      ctx.arc(bx, by, 52, 0, Math.PI * 2);
      ctx.fill();
      // title text
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = '800 72px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CLIPFORGE', canvas.width / 2, canvas.height - 180);
      ctx.font = '500 30px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.fillText('sample clip · generated locally', canvas.width / 2, canvas.height - 130);
      return t < duration;
    };

    recorder.onstop = () => {
      void audio?.close().catch(() => undefined);
      const type = recorder.mimeType || 'video/webm';
      const blob = new Blob(chunks, { type });
      resolve({ name: 'clipforge-sample.webm', kind: 'video', url: URL.createObjectURL(blob), duration, width: 1280, height: 720 });
    };
    recorder.onerror = () => reject(new Error('MediaRecorder failed'));
    recorder.start(250);
    const tick = () => { if (draw()) requestAnimationFrame(tick); else recorder.stop(); };
    requestAnimationFrame(tick);
  });
}

/** Instant sample image: poster generated via canvas → PNG blob. */
export function generateSampleImage(): Promise<SampleResult> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return reject(new Error('Canvas 2D unavailable'));
    const grad = ctx.createLinearGradient(0, 0, 1280, 720);
    grad.addColorStop(0, '#0f2027');
    grad.addColorStop(0.5, '#203a43');
    grad.addColorStop(1, '#2c5364');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1280, 720);
    ctx.fillStyle = '#35e0c0';
    ctx.beginPath();
    ctx.moveTo(960, 120);
    ctx.lineTo(1160, 600);
    ctx.lineTo(760, 600);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '800 84px system-ui, sans-serif';
    ctx.fillText('TITLE CARD', 90, 300);
    ctx.font = '500 34px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('sample image · generated locally', 90, 360);
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('toBlob failed'));
      resolve({ name: 'clipforge-poster.png', kind: 'image', url: URL.createObjectURL(blob), duration: 5, width: 1280, height: 720 });
    }, 'image/png');
  });
}

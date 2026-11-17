// Offline (faster-than-real-time) MP4 export via WebCodecs, driven by
// Mediabunny (https://mediabunny.dev). The editor keeps decoding frames by
// seeking its <video> elements (same math as live playback); this module
// composites + encodes them as fast as the machine allows, instead of
// recording in real time and re-transcoding with ffmpeg.wasm.
import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
} from 'mediabunny';

export type OfflineMp4Result =
  | { status: 'done'; blob: Blob }
  | { status: 'unsupported' }
  | { status: 'cancelled' };

export interface OfflineMp4Options {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  /** Timeline duration in seconds. */
  duration: number;
  fps: number;
  bitrate: number;
  /** Seek media elements to `t` and draw the composited frame onto `canvas`. */
  seekAndDraw: (t: number) => Promise<void>;
  /** Mix all timeline audio offline; null = no audible audio. */
  renderAudio: () => Promise<AudioBuffer | null>;
  isCancelled: () => boolean;
  /** 0..1 progress of the video frame loop. */
  onProgress: (progress: number) => void;
}

/** Export the timeline straight to MP4 (H.264 + AAC) without real-time capture. */
export async function exportTimelineMp4(opts: OfflineMp4Options): Promise<OfflineMp4Result> {
  if (typeof VideoEncoder === 'undefined') return { status: 'unsupported' };

  // H.264 first for player compatibility; VP9-in-MP4 as the software fallback.
  const videoCodec = await getFirstEncodableVideoCodec(['avc', 'vp9'], {
    width: opts.width,
    height: opts.height,
    frameRate: opts.fps,
  });
  if (!videoCodec) return { status: 'unsupported' };

  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new BufferTarget(),
  });

  const videoSource = new CanvasSource(opts.canvas, {
    codec: videoCodec,
    quality: new Quality({ bitrate: opts.bitrate }),
  });
  output.addVideoTrack(videoSource, { frameRate: opts.fps });

  // Audio is mixed/decoded while video frames render; the buffer is appended
  // once ready (AudioBufferSource always appends at the track's tail).
  const audioPromise = opts.renderAudio().catch(() => null);
  let audioBuffer: AudioBuffer | null = null;
  try {
    audioBuffer = await audioPromise;
  } catch {
    audioBuffer = null;
  }
  let audioSource: AudioBufferSource | null = null;
  if (audioBuffer) {
    const audioCodec = await getFirstEncodableAudioCodec(['aac', 'opus'], {
      numberOfChannels: audioBuffer.numberOfChannels,
      sampleRate: audioBuffer.sampleRate,
    });
    if (audioCodec) {
      audioSource = new AudioBufferSource({
        codec: audioCodec,
        quality: new Quality({ bitrate: 160_000 }),
      });
      output.addAudioTrack(audioSource);
    }
  }

  await output.start();

  if (audioSource && audioBuffer) {
    await audioSource.add(audioBuffer);
    audioSource.close();
  }

  const frameDur = 1 / opts.fps;
  const totalFrames = Math.max(1, Math.ceil(opts.duration * opts.fps));
  try {
    for (let i = 0; i < totalFrames; i++) {
      if (opts.isCancelled()) {
        await output.cancel();
        return { status: 'cancelled' };
      }
      const t = Math.min(i * frameDur, Math.max(0, opts.duration - 1e-3));
      await opts.seekAndDraw(t);
      await videoSource.add(t, frameDur);
      opts.onProgress((i + 1) / totalFrames);
    }
    videoSource.close();
    await output.finalize();
  } catch (err) {
    if (output.state === 'started') await output.cancel().catch(() => undefined);
    throw err;
  }

  const buffer = output.target.buffer;
  if (!buffer) throw new Error('MP4 output produced no data.');
  return { status: 'done', blob: new Blob([buffer], { type: 'video/mp4' }) };
}

// Whisper transcription → timeline captions. The model itself runs in
// App.tsx via @xenova/transformers (dynamic import, WASM); this module holds
// the pure timestamp math so it can be unit tested without a model.
import { clamp, uid } from '../util';
import type { Caption } from '../types';

export interface WhisperChunk {
  text?: string;
  /** [startSeconds, endSecondsOrNull] in source-media time. */
  timestamp?: [number, number | null];
}

export interface CaptionSourceClip {
  start: number;
  duration: number;
  trimStart: number;
  speed: number;
}

/**
 * Map Whisper's source-media timestamps onto the timeline for `clip`.
 * Chunks that END before the clip's trim-in are dropped; chunks straddling
 * the trim-in keep their text and start at clip.start; times past the clip's
 * end are clamped; sub-0.4 s captions are stretched a little so they remain
 * readable. Output is sorted by timeline start.
 */
export function whisperChunksToCaptions(
  chunks: WhisperChunk[],
  fallbackText: string,
  clip: CaptionSourceClip,
): Caption[] {
  const clipEnd = clip.start + clip.duration;
  const toTimeline = (sourceT: number): number =>
    clip.start + (sourceT - clip.trimStart) / Math.max(0.01, clip.speed);

  const out: Caption[] = [];
  for (const chunk of chunks) {
    const text = (chunk.text ?? '').trim();
    if (!text) continue;
    const [rawStart, rawEnd] = chunk.timestamp ?? [];
    if (rawStart == null) continue;
    // Drop chunks fully before the trim-in; keep straddlers clamped to clip.start.
    if (rawEnd != null && rawEnd <= clip.trimStart) continue;
    const start = clamp(toTimeline(Math.max(rawStart, clip.trimStart)), clip.start, Math.max(clip.start, clipEnd - 0.05));
    const end = rawEnd == null
      ? clipEnd
      : clamp(toTimeline(rawEnd), start + 0.4, clipEnd);
    out.push({ id: uid(), text, start, duration: end - start });
  }

  if (out.length === 0) {
    // Audio shorter than the model's minimum window yields a bare transcript
    // without chunks — caption the whole clip with it.
    const text = fallbackText.trim();
    if (text) out.push({ id: uid(), text, start: clip.start, duration: clip.duration });
  }

  return out.sort((a, b) => a.start - b.start);
}

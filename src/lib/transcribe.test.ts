import { describe, expect, it } from 'vitest';
import { whisperChunksToCaptions, type WhisperChunk } from './transcribe';

const clip = { start: 2, duration: 10, trimStart: 1, speed: 1 };

describe('whisperChunksToCaptions', () => {
  it('maps source timestamps onto the timeline honoring trim-in and clip placement', () => {
    const chunks = [{ text: ' hello ', timestamp: [1, 3] as [number, number] }];
    const [caption] = whisperChunksToCaptions(chunks, '', clip);
    // source 1s == trim-in == timeline 2s; source 3s == timeline 4s
    expect(caption.start).toBeCloseTo(2);
    expect(caption.duration).toBeCloseTo(2);
    expect(caption.text).toBe('hello');
  });

  it('applies playback speed to source→timeline mapping', () => {
    const fast = { ...clip, speed: 2 };
    const chunks = [{ text: 'speedy', timestamp: [1, 3] as [number, number] }];
    const [caption] = whisperChunksToCaptions(chunks, '', fast);
    // source span 2s at 2x speed == 1 timeline second
    expect(caption.start).toBeCloseTo(2);
    expect(caption.duration).toBeCloseTo(1);
  });

  it('drops empty chunks and chunks before the trim-in', () => {
    const chunks: WhisperChunk[] = [
      { text: '   ', timestamp: [1, 2] as [number, number] },
      { text: 'gone', timestamp: [null as unknown as number, null] as [number, null] },
      { text: 'earliest', timestamp: [0.5, 0.9] as [number, number] },
      { text: 'straddle', timestamp: [0.5, 1.5] as [number, number] },
      { text: 'kept', timestamp: [2, 4] },
    ];
    const captions = whisperChunksToCaptions(chunks, '', clip);
    expect(captions.map((c) => c.text)).toEqual(['straddle', 'kept']);
    expect(captions[0].start).toBe(2); // straddler clamps at the trim-in → clip.start
  });

  it('clamps captions that overshoot the clip end', () => {
    const chunks = [{ text: 'tail', timestamp: [9, 99] as [number, number] }];
    const [caption] = whisperChunksToCaptions(chunks, '', clip);
    expect(caption.start + caption.duration).toBeLessThanOrEqual(12.001);
  });

  it('stretches sub-0.4 s captions to stay readable', () => {
    const chunks = [{ text: 'blip', timestamp: [2, 2.05] as [number, number] }];
    const [caption] = whisperChunksToCaptions(chunks, '', clip);
    expect(caption.duration).toBeCloseTo(0.4);
  });

  it('handles a null end timestamp by running to the clip end', () => {
    const chunks = [{ text: 'open ended', timestamp: [1, null] as [number, null] }];
    const [caption] = whisperChunksToCaptions(chunks, '', clip);
    expect(caption.start + caption.duration).toBeLessThanOrEqual(12.001);
  });

  it('falls back to the full transcript when the model returns no chunks', () => {
    const captions = whisperChunksToCaptions([], 'The quick brown fox.', clip);
    expect(captions).toHaveLength(1);
    expect(captions[0].text).toBe('The quick brown fox.');
    expect(captions[0].start).toBe(2);
    expect(captions[0].duration).toBe(10);
  });

  it('returns an empty list for silent audio with no text', () => {
    expect(whisperChunksToCaptions([], '', clip)).toEqual([]);
  });
});

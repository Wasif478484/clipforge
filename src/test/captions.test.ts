import { describe, expect, it } from 'vitest';
import { parseCaptions, serializeCaptions } from '../lib/captions';

describe('caption interchange', () => {
  it('parses SRT and preserves multiline text', () => {
    const captions = parseCaptions('1\n00:00:01,000 --> 00:00:03,500\nHello\nworld\n');
    expect(captions).toHaveLength(1);
    expect(captions[0]).toMatchObject({ start: 1, duration: 2.5, text: 'Hello\nworld' });
  });

  it('parses VTT timestamps and serializes valid VTT', () => {
    const captions = parseCaptions('WEBVTT\n\n00:00:00.500 --> 00:00:02.000\nWelcome\n');
    expect(serializeCaptions(captions, 'vtt')).toContain('WEBVTT');
    expect(serializeCaptions(captions, 'vtt')).toContain('00:00:00.500 --> 00:00:02.000');
  });
});

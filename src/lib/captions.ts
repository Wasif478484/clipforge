import type { Caption } from '../types';

const timestamp = (value: string): number => {
  const match = value.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!match) return NaN;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
};

const formatTimestamp = (seconds: number): string => {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const s = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const m = totalMinutes % 60;
  const h = Math.floor(totalMinutes / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
};

export function parseCaptions(text: string): Caption[] {
  const blocks = text.replace(/^\uFEFF/, '').trim().split(/\r?\n\s*\r?\n/);
  const result: Caption[] = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const timingIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingIndex < 0) continue;
    const [startValue, endValue] = lines[timingIndex].split('-->').map((part) => part.trim().split(/\s+/)[0]);
    const start = timestamp(startValue);
    const end = timestamp(endValue);
    const content = lines.slice(timingIndex + 1).join('\n').trim();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !content) continue;
    result.push({ id: crypto.randomUUID(), start, duration: end - start, text: content });
  }
  return result.sort((a, b) => a.start - b.start);
}

export function serializeCaptions(captions: Caption[], format: 'srt' | 'vtt'): string {
  const body = captions
    .filter((caption) => caption.duration > 0 && caption.text.trim())
    .sort((a, b) => a.start - b.start)
    .map((caption, index) => {
      const end = caption.start + caption.duration;
      const separator = format === 'vtt' ? '.' : ',';
      const start = formatTimestamp(caption.start).replace(',', separator);
      const finish = formatTimestamp(end).replace(',', separator);
      return `${index + 1}\n${start} --> ${finish}\n${caption.text.trim()}`;
    });
  return `${format === 'vtt' ? 'WEBVTT\n\n' : ''}${body.join('\n\n')}\n`;
}

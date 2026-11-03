export type Aspect = '16:9' | '9:16' | '1:1';
export type TrackKind = 'video' | 'audio' | 'text';
export type MediaKind = 'video' | 'audio' | 'image';

export interface Track {
  id: string;
  name: string;
  kind: TrackKind;
}

export interface MediaAsset {
  id: string;
  name: string;
  kind: MediaKind;
  url: string;
  duration: number;
  width?: number;
  height?: number;
}

export interface Clip {
  id: string;
  assetId: string;
  trackId: string;
  name: string;
  /** position on the timeline, seconds */
  start: number;
  /** how long the clip runs on the timeline, seconds */
  duration: number;
  /** offset into the source media, seconds */
  trimStart: number;
  /** unused tail of the source media, seconds (limits right-trim extension) */
  trimEnd: number;
  volume: number;
  muted: boolean;
  fit: 'cover' | 'contain';
}

export interface TextOverlay {
  id: string;
  text: string;
  /** position as fraction of canvas width/height (0..1) */
  x: number;
  y: number;
  /** font size in px at 720p canvas height */
  size: number;
  color: string;
  start: number;
  duration: number;
}

export type Selection = { type: 'clip' | 'text'; id: string } | null;

export const TRACKS: Track[] = [
  { id: 'v2', name: 'V2', kind: 'video' },
  { id: 'v1', name: 'V1', kind: 'video' },
  { id: 'a1', name: 'A1', kind: 'audio' },
  { id: 't1', name: 'T1', kind: 'text' },
];

export const CANVAS_SIZE: Record<Aspect, { w: number; h: number }> = {
  '16:9': { w: 1280, h: 720 },
  '9:16': { w: 720, h: 1280 },
  '1:1': { w: 720, h: 720 },
};

import type { Aspect, Caption, Clip, MediaKind, TextOverlay, TimelineMarker } from '../types';

export interface ProjectAssetData {
  id: string;
  name: string;
  kind: MediaKind;
  duration: number;
  width?: number;
  height?: number;
  dataUrl?: string;
}

export interface ProjectData {
  version: number;
  name: string;
  aspect: Aspect;
  clips: Clip[];
  texts: TextOverlay[];
  captions?: Caption[];
  markers?: TimelineMarker[];
  inPoint?: number | null;
  outPoint?: number | null;
  assets: ProjectAssetData[];
}

const isAspect = (value: unknown): value is Aspect => value === '16:9' || value === '9:16' || value === '1:1';
const isKind = (value: unknown): value is MediaKind => value === 'video' || value === 'audio' || value === 'image';

export function parseProjectData(value: unknown): ProjectData {
  if (!value || typeof value !== 'object') throw new Error('Project file is not an object');
  const data = value as Partial<ProjectData>;
  if (data.version !== 2 || typeof data.name !== 'string' || !isAspect(data.aspect)) {
    throw new Error('Unsupported or invalid project format');
  }
  if (!Array.isArray(data.clips) || !Array.isArray(data.texts) || !Array.isArray(data.assets)) {
    throw new Error('Project is missing required collections');
  }
  const assets = data.assets.filter((asset): asset is ProjectAssetData =>
    Boolean(asset && typeof asset.id === 'string' && typeof asset.name === 'string' && isKind(asset.kind) && Number.isFinite(asset.duration)),
  );
  const assetIds = new Set(assets.map((asset) => asset.id));
  const clips = data.clips.filter((clip): clip is Clip =>
    Boolean(clip && typeof clip.id === 'string' && typeof clip.assetId === 'string' && assetIds.has(clip.assetId) &&
      typeof clip.trackId === 'string' && Number.isFinite(clip.start) && Number.isFinite(clip.duration)),
  );
  const captions = Array.isArray(data.captions)
    ? data.captions.filter((caption): caption is Caption => Boolean(
      caption && typeof caption.id === 'string' && typeof caption.text === 'string' &&
      Number.isFinite(caption.start) && Number.isFinite(caption.duration) && caption.duration > 0,
    ))
    : [];
  const markers = Array.isArray(data.markers)
    ? data.markers.filter((marker): marker is TimelineMarker => Boolean(
      marker && typeof marker.id === 'string' && typeof marker.label === 'string' &&
      Number.isFinite(marker.time) && marker.time >= 0,
    ))
    : [];
  const inPoint = data.inPoint == null || (Number.isFinite(data.inPoint) && data.inPoint >= 0) ? data.inPoint ?? null : null;
  const outPoint = data.outPoint == null || (Number.isFinite(data.outPoint) && data.outPoint >= 0) ? data.outPoint ?? null : null;
  return { version: 2, name: data.name, aspect: data.aspect, clips, texts: data.texts, captions, markers, inPoint, outPoint, assets };
}

import type { Aspect, Clip, MediaKind, TextOverlay } from '../types';

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
  return { version: 2, name: data.name, aspect: data.aspect, clips, texts: data.texts, assets };
}

// Local settings store. Lives in localStorage — no account, no network.

export interface ClipForgeSettings {
  defaultAspect: '16:9' | '9:16' | '1:1';
  defaultExportFormat: 'webm' | 'mp4';
  thumbnailQuality: number; // 0.3-0.8 (jpeg)
  showInterfaceHints: boolean;
}

const KEY = 'clipforge-settings-v1';

export const DEFAULT_SETTINGS: ClipForgeSettings = {
  defaultAspect: '16:9',
  defaultExportFormat: 'webm',
  thumbnailQuality: 0.55,
  showInterfaceHints: true,
};

export function loadSettings(): ClipForgeSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<ClipForgeSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(patch: Partial<ClipForgeSettings>): ClipForgeSettings {
  const next = { ...loadSettings(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function resetSettings(): ClipForgeSettings {
  localStorage.removeItem(KEY);
  return { ...DEFAULT_SETTINGS };
}

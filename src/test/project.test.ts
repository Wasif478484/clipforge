import { describe, expect, it } from 'vitest';
import { parseProjectData } from '../lib/project';

describe('project validation', () => {
  it('rejects unsupported project versions', () => {
    expect(() => parseProjectData({ version: 1 })).toThrow(/invalid project format/i);
  });

  it('drops clips that reference missing assets', () => {
    const project = parseProjectData({
      version: 2,
      name: 'Test',
      aspect: '16:9',
      assets: [{ id: 'asset-1', name: 'Clip', kind: 'video', duration: 2 }],
      clips: [
        { id: 'clip-1', assetId: 'asset-1', trackId: 'v1', start: 0, duration: 2 },
        { id: 'clip-2', assetId: 'missing', trackId: 'v1', start: 0, duration: 2 },
      ],
      texts: [],
    });
    expect(project.clips.map((clip) => clip.id)).toEqual(['clip-1']);
  });
});

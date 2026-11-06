import { beforeEach, describe, expect, it } from 'vitest';
import { clearRecentProjects, listRecentProjects, putRecentProject } from '../lib/recent';

describe('recent project store', () => {
  beforeEach(async () => {
    await clearRecentProjects();
  });

  it('sorts projects by most recently updated', async () => {
    await putRecentProject({ id: 'old', name: 'Old', kind: 'image', createdAt: 1, updatedAt: 1 });
    await putRecentProject({ id: 'new', name: 'New', kind: 'image', createdAt: 2, updatedAt: 2 });
    expect((await listRecentProjects()).map((item) => item.id)).toEqual(['new', 'old']);
  });
});

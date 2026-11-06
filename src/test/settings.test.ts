import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, resetSettings, saveSettings } from '../lib/settings';

describe('settings persistence', () => {
  beforeEach(() => localStorage.clear());

  it('loads defaults and persists patches locally', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(saveSettings({ defaultAspect: '9:16' }).defaultAspect).toBe('9:16');
    expect(loadSettings().defaultAspect).toBe('9:16');
    expect(resetSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

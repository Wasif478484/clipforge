import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatBytes, getStorageDiagnostics } from '../lib/storage';

describe('storage diagnostics', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis.navigator, 'storage', { value: undefined, configurable: true });
  });

  it('formats byte sizes into readable values', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB');
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.0 GB');
  });

  it('flags low storage when the browser quota is nearly exhausted', async () => {
    Object.defineProperty(globalThis.navigator, 'storage', {
      value: {
        estimate: vi.fn().mockResolvedValue({
          quota: 10 * 1024 * 1024 * 1024,
          usage: 9 * 1024 * 1024 * 1024,
        }),
        persisted: vi.fn().mockResolvedValue(true),
      },
      configurable: true,
    });

    const diagnostics = await getStorageDiagnostics();

    expect(diagnostics).not.toBeNull();
    expect(diagnostics?.isLow).toBe(true);
    expect(diagnostics?.persisted).toBe(true);
    expect(diagnostics?.percentUsed).toBeCloseTo(90, 0);
    expect(diagnostics?.freeBytes).toBe(1 * 1024 * 1024 * 1024);
  });
});

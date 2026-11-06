export interface StorageDiagnostics {
  available: boolean;
  quotaBytes: number;
  usageBytes: number;
  freeBytes: number;
  percentUsed: number;
  persisted: boolean | null;
  isLow: boolean;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  if (unitIndex === 0) return `${Math.round(value)} ${units[unitIndex]}`;
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

export async function getStorageDiagnostics(): Promise<StorageDiagnostics | null> {
  if (typeof navigator === 'undefined' || !navigator.storage || typeof navigator.storage.estimate !== 'function') {
    return null;
  }

  try {
    const estimate = await navigator.storage.estimate();
    const quotaBytes = estimate.quota ?? 0;
    const usageBytes = estimate.usage ?? 0;
    const freeBytes = quotaBytes > 0 ? Math.max(quotaBytes - usageBytes, 0) : 0;
    const percentUsed = quotaBytes > 0 ? (usageBytes / quotaBytes) * 100 : 0;

    let persisted: boolean | null = null;
    if (typeof navigator.storage.persisted === 'function') {
      persisted = await navigator.storage.persisted();
    }

    const lowQuota = quotaBytes > 0 && quotaBytes < 5 * 1024 * 1024 * 1024;
    const isLow = quotaBytes > 0 && (percentUsed >= 80 || freeBytes < 512 * 1024 * 1024 || (lowQuota && percentUsed >= 60));

    return {
      available: true,
      quotaBytes,
      usageBytes,
      freeBytes,
      percentUsed,
      persisted,
      isLow,
    };
  } catch {
    return null;
  }
}

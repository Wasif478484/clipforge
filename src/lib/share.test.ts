import { describe, expect, it } from 'vitest';
import { parseShareHash, sharePublicUrlFor } from './share';

const validPath = '123e4567-e89b-12d3-a456-426655440000/123e4567-e89b-12d3-a456-426655440001.mp4';

describe('parseShareHash', () => {
  it('accepts a well-formed share hash', () => {
    expect(parseShareHash(`#/share/${validPath}`)).toBe(validPath);
  });

  it('lowercases the uuid portion of the path', () => {
    const upperPath = '123E4567-E89B-12D3-A456-426655440000/123E4567-E89B-12D3-A456-426655440001.mp4';
    expect(parseShareHash(`#/share/${upperPath}`)).toBe(validPath);
  });

  it('rejects non-mp4, traversal and garbage paths', () => {
    expect(parseShareHash('#/share/../../etc/passwd')).toBeNull();
    expect(parseShareHash(`#/share/${validPath}.webm`)).toBeNull();
    expect(parseShareHash('#/share/not-a-path')).toBeNull();
    expect(parseShareHash(`#/share/${validPath}/extra`)).toBeNull();
    expect(parseShareHash('#/share/')).toBeNull();
    expect(parseShareHash('#/dashboard')).toBeNull();
    expect(parseShareHash('')).toBeNull();
  });
});

describe('sharePublicUrl for malformed paths', () => {
  it('returns null for malformed paths', () => {
    expect(sharePublicUrlFor('https://abc123.supabase.co', 'garbage')).toBeNull();
    expect(sharePublicUrlFor('https://abc123.supabase.co', '../secret')).toBeNull();
    expect(sharePublicUrlFor(undefined, null)).toBeNull();
  });

  it('returns null on unconfigured deployments even for valid paths', () => {
    // vitest runs in mode 'test'; a developer .env.local must not flip this.
    expect(sharePublicUrlFor(undefined, validPath)).toBeNull();
  });
});

describe('sharePublicUrlFor', () => {
  const base = 'https://abc123.supabase.co';

  it('builds the public object URL for a valid path', () => {
    expect(sharePublicUrlFor(base, validPath)).toBe(
      `${base}/storage/v1/object/public/shared-videos/${validPath}`,
    );
  });

  it('rejects traversal, wrong extensions and missing base URLs', () => {
    expect(sharePublicUrlFor(base, '../secret')).toBeNull();
    expect(sharePublicUrlFor(base, `${validPath}.webm`)).toBeNull();
    expect(sharePublicUrlFor(base, 'x/y.mp4')).toBeNull();
    expect(sharePublicUrlFor(undefined, validPath)).toBeNull();
    expect(sharePublicUrlFor(base, null)).toBeNull();
  });
});

// Share links: render the timeline to MP4 and publish it to a public
// Supabase bucket; anyone with the link can watch. Read-only by design —
// the shared video is a file, not a project snapshot.
import { supabase, supabaseConfig } from './supabase';
import { cloudProjectsEnabled } from './cloudProjects';

const BUCKET = 'shared-videos';

/** Strict shape: <uuid>/<uuid>.mp4 — nothing else is a valid share path. */
const SHARE_PATH_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp4$/;

export type ShareResult =
  | { status: 'published'; url: string }
  | { status: 'unsupported' } // no cloud deployment / not signed in
  | { status: 'failed'; message: string };

export async function publishShare(blob: Blob): Promise<ShareResult> {
  if (!supabase || !cloudProjectsEnabled) {
    return { status: 'unsupported' };
  }
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return { status: 'unsupported' };
  const shareId = crypto.randomUUID();
  const path = `${uid}/${shareId}.mp4`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'video/mp4',
    upsert: false,
  });
  if (error) return { status: 'failed', message: `Could not publish the video: ${error.message}` };
  return {
    status: 'published',
    url: `${window.location.origin}${import.meta.env.BASE_URL}#/share/${path}`,
  };
}

/** Pure: validate `path` and build the public object URL against `baseUrl`. */
export function sharePublicUrlFor(baseUrl: string | undefined, path: string | null): string | null {
  if (!path || !SHARE_PATH_RE.test(path) || !baseUrl) return null;
  return `${baseUrl}/storage/v1/object/public/${BUCKET}/${path}`;
}

/** Public URL for a share path, or null (malformed path or unconfigured). */
export function sharePublicUrl(path: string | null): string | null {
  return sharePublicUrlFor(supabaseConfig.url, path);
}

/** Parse `#/share/<uuid>/<uuid>.mp4` into the storage path. */
export function parseShareHash(hash: string): string | null {
  const match = /^#\/share\/([0-9a-fA-F-]{36}\/[0-9a-fA-F-]{36}\.mp4)$/.exec(hash);
  if (!match) return null;
  return match[1].toLowerCase();
}

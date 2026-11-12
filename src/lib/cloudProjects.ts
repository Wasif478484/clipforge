import type { Aspect } from '../types';
import { supabase } from './supabase';
import type { StoredAsset } from './recent';

export interface CloudProject {
  id: string;
  name: string;
  aspect: Aspect;
  snapshot: Record<string, unknown>;
  thumbnail: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ProjectRow {
  id: string;
  name: string;
  aspect: Aspect;
  snapshot: Record<string, unknown>;
  thumbnail: string | null;
  created_at: string;
  updated_at: string;
}

interface AssetRow {
  asset_id: string;
  name: string;
  kind: StoredAsset['kind'];
  storage_path: string;
  mime_type: string | null;
  duration: number;
  width: number | null;
  height: number | null;
}

const BUCKET = 'project-assets';

/** Storage path root must be the owner's uid — the RLS policies enforce it. */
const assetPath = (ownerId: string, projectId: string, assetId: string): string =>
  `${ownerId}/${projectId}/${assetId}`;

const mapProject = (row: ProjectRow): CloudProject => ({
  id: row.id,
  name: row.name,
  aspect: row.aspect,
  snapshot: row.snapshot,
  thumbnail: row.thumbnail,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const cloudProjectsEnabled = Boolean(
  supabase && import.meta.env.VITE_SUPABASE_CLOUD_PROJECTS === 'true',
);

export async function listCloudProjects(): Promise<CloudProject[]> {
  if (!supabase || !cloudProjectsEnabled) return [];
  const { data, error } = await supabase
    .from('projects')
    .select('id,name,aspect,snapshot,thumbnail,created_at,updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`Could not load cloud projects: ${error.message}`);
  return (data as ProjectRow[]).map(mapProject);
}

export async function saveCloudProject(input: {
  id?: string;
  name: string;
  aspect: Aspect;
  snapshot: Record<string, unknown>;
  thumbnail?: string;
}): Promise<CloudProject> {
  if (!supabase || !cloudProjectsEnabled) {
    throw new Error('Cloud projects are not enabled for this deployment.');
  }
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(`Could not verify the signed-in user: ${userError.message}`);
  if (!userData.user) throw new Error('You must be signed in to save a cloud project.');

  const payload = {
    ...(input.id ? { id: input.id } : {}),
    owner_id: userData.user.id,
    name: input.name.trim() || 'Untitled project',
    aspect: input.aspect,
    snapshot: input.snapshot,
    ...(input.thumbnail ? { thumbnail: input.thumbnail } : {}),
  };
  const { data, error } = await supabase
    .from('projects')
    .upsert(payload)
    .select('id,name,aspect,snapshot,thumbnail,created_at,updated_at')
    .single();
  if (error) throw new Error(`Could not save cloud project: ${error.message}`);
  return mapProject(data as ProjectRow);
}

export async function deleteCloudProject(id: string): Promise<void> {
  if (!supabase || !cloudProjectsEnabled) {
    throw new Error('Cloud projects are not enabled for this deployment.');
  }
  // Best-effort storage cleanup before the row (cascade-deletes asset rows).
  try {
    const { data: userData } = await supabase.auth.getUser();
    const ownerId = userData.user?.id;
    if (ownerId) {
      const { data: files } = await supabase.storage.from(BUCKET).list(`${ownerId}/${id}`);
      const paths = (files ?? []).map((f) => `${ownerId}/${id}/${f.name}`);
      if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths);
    }
  } catch {
    // Storage cleanup must not block the delete; orphaned files are harmless.
  }
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw new Error(`Could not delete cloud project: ${error.message}`);
}

/**
 * Sync a project's media files to cloud storage. Only assets whose id is not
 * already stored for this project are uploaded, so re-saving is cheap.
 */
export async function syncProjectAssets(
  projectId: string,
  assets: StoredAsset[],
): Promise<{ uploaded: number; removed: number }> {
  if (!supabase || !cloudProjectsEnabled) {
    throw new Error('Cloud projects are not enabled for this deployment.');
  }
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(`Could not verify the signed-in user: ${userError.message}`);
  const ownerId = userData.user?.id;
  if (!ownerId) throw new Error('You must be signed in to sync media.');

  const { data: existing, error: listError } = await supabase
    .from('project_assets')
    .select('asset_id,storage_path')
    .eq('project_id', projectId);
  if (listError) throw new Error(`Could not list cloud assets: ${listError.message}`);
  const existingRows = (existing ?? []) as Array<{ asset_id: string; storage_path: string }>;
  const known = new Set(existingRows.map((row) => row.asset_id));
  const wanted = new Set(assets.map((a) => a.id));

  let uploaded = 0;
  for (const asset of assets) {
    if (known.has(asset.id)) continue;
    const path = assetPath(ownerId, projectId, asset.id);
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, asset.blob, {
        contentType: asset.blob.type || 'application/octet-stream',
        upsert: true,
      });
    if (uploadError) throw new Error(`Could not upload ${asset.name}: ${uploadError.message}`);
    const { error: insertError } = await supabase.from('project_assets').upsert({
      project_id: projectId,
      owner_id: ownerId,
      asset_id: asset.id,
      name: asset.name,
      kind: asset.kind,
      storage_path: path,
      mime_type: asset.blob.type || 'application/octet-stream',
      byte_size: asset.blob.size,
      duration: asset.duration,
      ...(asset.width != null ? { width: asset.width } : {}),
      ...(asset.height != null ? { height: asset.height } : {}),
    });
    if (insertError) throw new Error(`Could not register ${asset.name}: ${insertError.message}`);
    uploaded++;
  }

  // Drop rows (and files) for assets the project no longer references.
  let removed = 0;
  const stale = existingRows.filter((row) => !wanted.has(row.asset_id));
  for (const row of stale) {
    await supabase.storage.from(BUCKET).remove([row.storage_path]);
    const { error: deleteError } = await supabase
      .from('project_assets')
      .delete()
      .eq('project_id', projectId)
      .eq('asset_id', row.asset_id);
    if (deleteError) throw new Error(`Could not prune ${row.asset_id}: ${deleteError.message}`);
    removed++;
  }

  return { uploaded, removed };
}

/** Download every stored media file for a project as restorable blobs. */
export async function fetchProjectAssets(projectId: string): Promise<StoredAsset[]> {
  if (!supabase || !cloudProjectsEnabled) {
    throw new Error('Cloud projects are not enabled for this deployment.');
  }
  const { data, error } = await supabase
    .from('project_assets')
    .select('asset_id,name,kind,storage_path,mime_type,duration,width,height')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Could not load cloud assets: ${error.message}`);
  const rows = (data ?? []) as AssetRow[];
  const assets: StoredAsset[] = [];
  for (const row of rows) {
    const { data: file, error: downloadError } = await supabase.storage
      .from(BUCKET)
      .download(row.storage_path);
    if (downloadError || !file) {
      throw new Error(`Could not download ${row.name}: ${downloadError?.message ?? 'missing file'}`);
    }
    // Restore the original media type so <video>/<audio> playback works.
    const blob = file.type === row.mime_type ? file : new Blob([file], { type: row.mime_type ?? 'application/octet-stream' });
    assets.push({
      id: row.asset_id,
      name: row.name,
      kind: row.kind,
      duration: row.duration,
      ...(row.width != null ? { width: row.width } : {}),
      ...(row.height != null ? { height: row.height } : {}),
      blob,
    });
  }
  return assets;
}

import type { Aspect } from '../types';
import { supabase } from './supabase';

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
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw new Error(`Could not delete cloud project: ${error.message}`);
}

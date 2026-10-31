import type { Project } from "../types";
import { defaultProject } from "../brand/defaults";
import { LOCAL_KEY, normalizeProject } from "../state/store";
import { MEDIA_BUCKET, supabase } from "./supabase";
import { track } from "./sync";
import { getBlob, uploadBlob } from "../brand/media";

export interface ProjectRow {
  id: string;
  name: string;
  thumbnail: string | null;
  updated_at: string;
}

function db() {
  if (!supabase) throw new Error("Cloud saving isn't set up.");
  return supabase;
}

export function defaultName(p: Project) {
  return [p.brand.name, p.brand.nameLine2].filter(Boolean).join(" ").trim() || "Untitled project";
}

export async function listProjects(): Promise<ProjectRow[]> {
  const { data, error } = await db().from("projects").select("id, name, thumbnail, updated_at").order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function loadProject(id: string): Promise<Project> {
  const { data, error } = await db().from("projects").select("data").eq("id", id).single();
  if (error) throw error;
  return normalizeProject(data.data);
}

export async function createProject(project: Project, name = defaultName(project)): Promise<ProjectRow> {
  return track(async () => {
    const { data, error } = await db().from("projects").insert({ name, data: project }).select("id, name, thumbnail, updated_at").single();
    if (error) throw error;
    return data;
  });
}

export async function saveProject(id: string, change: { data?: Project; thumbnail?: string }) {
  return track(async () => {
    const row: Record<string, unknown> = {};
    if (change.data) row.data = change.data;
    if (change.thumbnail) row.thumbnail = change.thumbnail;
    if (!Object.keys(row).length) return;
    const { error } = await db().from("projects").update(row).eq("id", id);
    if (error) throw error;
  });
}

export async function renameProject(id: string, name: string) {
  return track(async () => {
    const { error } = await db().from("projects").update({ name }).eq("id", id);
    if (error) throw error;
  });
}

/** Delete a project and the media files that belong to it. */
export async function deleteProject(id: string, userId: string) {
  return track(async () => {
    const { data } = await db().from("projects").select("data").eq("id", id).single();
    const media: { id: string }[] = (data?.data as Project | undefined)?.media ?? [];
    const { error } = await db().from("projects").delete().eq("id", id);
    if (error) throw error;
    if (media.length) await db().storage.from(MEDIA_BUCKET).remove(media.map((m) => `${userId}/${m.id}`));
  });
}

/**
 * Work made before signing in lives in this browser. When someone signs in,
 * bring it into their account (with its media) so the video they were about to
 * download is still there. An untouched default project isn't worth importing.
 */
export async function importGuestProject(): Promise<ProjectRow | null> {
  let local: Project | null = null;
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) local = normalizeProject(JSON.parse(raw));
  } catch {
    local = null;
  }
  if (!local) return null;
  if (JSON.stringify(stripIds(local)) === JSON.stringify(stripIds(defaultProject()))) {
    localStorage.removeItem(LOCAL_KEY);
    return null;
  }
  for (const m of local.media) {
    const blob = await getBlob(m.id).catch(() => null);
    if (blob) await uploadBlob(m.id, blob).catch(() => undefined);
  }
  const row = await createProject(local);
  localStorage.removeItem(LOCAL_KEY);
  return row;
}

/** Scene uids are random, so compare projects without them. */
function stripIds(p: Project) {
  return { ...p, scenes: p.scenes.map(({ uid: _uid, ...s }) => s) };
}

/** A new project that keeps the brand kit you're using now, with fresh scenes and no media. */
export function newProjectFrom(current: Project): Project {
  const fresh = defaultProject();
  return { ...fresh, brand: structuredClone(current.brand) };
}

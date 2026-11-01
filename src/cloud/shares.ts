/**
 * Live brand pages. Publishing copies the project and its media into a public,
 * read-only page at /s/<id>. Visitors can comment and approve without an
 * account; only the owner sees the comments list in the editor.
 */
import type { Project } from "../types";
import { normalizeProject } from "../state/store";
import { getBlob } from "../brand/media";
import { supabase } from "./supabase";
import { track } from "./sync";

export const SHARED_BUCKET = "shared";

export interface ShareRow {
  id: string;
  title: string;
  allow_comments: boolean;
  updated_at: string;
  /** JSON of the published project, to tell whether the page is behind the editor. */
  data?: Project;
}

export interface PublicShare {
  id: string;
  title: string;
  owner_name: string;
  project: Project;
  allow_comments: boolean;
  updated_at: string;
}

export type CommentKind = "comment" | "approve" | "changes";

export interface ShareComment {
  id: string;
  author: string;
  body: string;
  at_time: number | null;
  kind: CommentKind;
  created_at: string;
}

function db() {
  if (!supabase) throw new Error("Live pages need accounts to be set up.");
  return supabase;
}

export function shareUrl(id: string) {
  return `${window.location.origin}/s/${id}`;
}

function newShareId() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (b) => abc[b % abc.length]).join("");
}

/** The live page for a project, if it has one. */
export async function findShare(projectId: string): Promise<ShareRow | null> {
  const { data, error } = await db().from("shares").select("id, title, allow_comments, updated_at, data").eq("project_id", projectId).maybeSingle();
  if (error) throw error;
  return data ? { ...data, data: normalizeProject(data.data) } : null;
}

function alreadyThere(error: { message?: string; statusCode?: string | number; status?: number }) {
  const msg = (error.message ?? "").toLowerCase();
  return error.status === 409 || String(error.statusCode) === "409" || msg.includes("already exists") || msg.includes("duplicate");
}

/** Media files a page needs, copied to the public bucket. */
async function uploadMedia(shareId: string, project: Project) {
  const store = db().storage.from(SHARED_BUCKET);
  const { data: existing } = await store.list(shareId, { limit: 1000 });
  const have = new Set((existing ?? []).map((o) => o.name));
  for (const m of project.media) {
    if (have.has(m.id)) continue;
    const blob = await getBlob(m.id);
    if (!blob) continue;
    // Media ids never change content, so a file that is already there is fine as it is.
    // (Overwriting needs read access to the bucket, which older setups don't grant.)
    const { error } = await store.upload(`${shareId}/${m.id}`, blob, { upsert: false, contentType: blob.type || undefined, cacheControl: "31536000" });
    if (error && !alreadyThere(error)) throw error;
  }
}

/** Create the page, or bring it up to date with the editor. */
export async function publishShare(opts: { projectId: string; project: Project; title: string; ownerName: string; existing: ShareRow | null; allowComments?: boolean }): Promise<ShareRow> {
  return track(async () => {
    const { projectId, project, title, ownerName, existing } = opts;
    const id = existing?.id ?? newShareId();
    const row = { id, project_id: projectId, title, owner_name: ownerName, data: project, allow_comments: opts.allowComments ?? existing?.allow_comments ?? true };
    if (!existing) {
      // The row comes first: the storage rules check the page belongs to you.
      const { error } = await db().from("shares").insert(row);
      if (error) throw error;
    }
    await uploadMedia(id, project);
    const { data, error } = await db().from("shares").upsert(row).select("id, title, allow_comments, updated_at").single();
    if (error) throw error;
    return { ...data, data: project };
  });
}

export async function setCommentsOpen(id: string, open: boolean) {
  const { error } = await db().from("shares").update({ allow_comments: open }).eq("id", id);
  if (error) throw error;
}

export async function deleteShare(id: string, project: Project) {
  return track(async () => {
    await db().storage.from(SHARED_BUCKET).remove(project.media.map((m) => `${id}/${m.id}`));
    const { error } = await db().from("shares").delete().eq("id", id);
    if (error) throw error;
  });
}

/* ---------- visitors ---------- */

export async function loadPublicShare(id: string): Promise<PublicShare | null> {
  const { data, error } = await db().rpc("get_share", { share: id });
  if (error) throw error;
  const row = (data as (Omit<PublicShare, "project"> & { data: unknown })[] | null)?.[0];
  if (!row) return null;
  return { id: row.id, title: row.title, owner_name: row.owner_name, project: normalizeProject(row.data), allow_comments: row.allow_comments, updated_at: row.updated_at };
}

export async function listComments(id: string): Promise<ShareComment[]> {
  const { data, error } = await db().rpc("list_share_comments", { share: id });
  if (error) throw error;
  return (data as ShareComment[]) ?? [];
}

export async function addComment(id: string, c: { author: string; body: string; at_time: number | null; kind: CommentKind }) {
  const { error } = await db().rpc("add_share_comment", { share: id, author: c.author, body: c.body, at_time: c.at_time, kind: c.kind });
  if (error) throw new Error(error.message);
}

/** Where a shared media file can be downloaded from. */
export function sharedMediaUrl(shareId: string, mediaId: string) {
  return db().storage.from(SHARED_BUCKET).getPublicUrl(`${shareId}/${mediaId}`).data.publicUrl;
}

/** The owner's view of a page's comments. */
export async function ownerComments(id: string): Promise<ShareComment[]> {
  const { data, error } = await db().from("share_comments").select("id, author, body, at_time, kind, created_at").eq("share_id", id).order("created_at");
  if (error) throw error;
  return (data as ShareComment[]) ?? [];
}

export async function deleteComment(id: string) {
  const { error } = await db().from("share_comments").delete().eq("id", id);
  if (error) throw error;
}

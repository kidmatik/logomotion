/**
 * Brand media (screenshots, demo videos). Files are kept in IndexedDB on this
 * device so they survive a reload without ever being uploaded anywhere.
 */
import type { MediaItem } from "../types";
import type { MediaEl } from "../engine/kit";

const DB = "logomotion";
const STORE = "media";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putBlob(id: string, blob: Blob) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as Blob) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteBlob(id: string) {
  const db = await openDb();
  db.transaction(STORE, "readwrite").objectStore(STORE).delete(id);
}

/** Turn a blob into a drawable element, resolved once it has its size. */
export function blobToElement(blob: Blob, kind: MediaItem["kind"]): Promise<MediaEl> {
  const url = URL.createObjectURL(blob);
  if (kind === "image") {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Couldn't read that image."));
      img.src = url;
    });
  }
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.loop = true;
    v.onloadeddata = () => resolve(v);
    v.onerror = () => reject(new Error("Couldn't read that video."));
    v.src = url;
  });
}

export function elementSize(el: MediaEl) {
  return el instanceof HTMLVideoElement
    ? { width: el.videoWidth, height: el.videoHeight }
    : { width: el.naturalWidth, height: el.naturalHeight };
}

export function newId(prefix = "m") {
  return prefix + "_" + Math.random().toString(36).slice(2, 10);
}

/** Ask our screenshot endpoint to capture a page. Only the URL leaves the browser. */
export async function capturePage(url: string, device: "desktop" | "mobile"): Promise<Blob> {
  const res = await fetch(`/api/screenshot?url=${encodeURIComponent(url)}&device=${device}`);
  if (!res.ok) {
    let msg = `Capture failed (${res.status}).`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {
      /* not JSON */
    }
    throw new Error(msg);
  }
  return res.blob();
}

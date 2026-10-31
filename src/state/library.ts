import { createContext, useContext } from "react";
import type { MediaItem } from "../types";
import type { MediaEl } from "../engine/kit";
import type { Store } from "./store";
import { blobToElement, deleteBlob, elementSize, newId, putBlob } from "../brand/media";
import { createScene } from "../scenes/registry";
import { PHOTO_SCENES, parseGallery } from "../scenes/photos";

export type NewMedia = Omit<MediaItem, "id" | "width" | "height">;

/** A scene's photo list to add to. max keeps only the newest photos (1 for a single background photo). */
export interface GalleryTarget {
  sceneUid: string;
  key: string;
  max?: number;
}

export interface Library {
  /** Save a file on this device and load it, without touching the project yet. */
  ingest(blob: Blob, meta: NewMedia): Promise<MediaItem>;
  /**
   * Add media to the project in one undo step. Photos go into the given scene,
   * or into every photo scene when none is given. Screens get a screens scene.
   */
  /** ids: the photo ids to place in the scene, in order (defaults to the new photos). */
  commit(items: MediaItem[], target?: GalleryTarget, ids?: string[]): void;
  remove(id: string): void;
}

function appendToGallery(value: unknown, ids: string[], max?: number) {
  let list = parseGallery(typeof value === "string" ? value : "");
  for (const id of ids) if (!list.some((g) => g.id === id)) list.push({ id, span: "auto" });
  if (max) list = list.slice(-max);
  return JSON.stringify(list);
}

export function createLibrary(store: Store, onLoaded: (id: string, el: MediaEl) => void): Library {
  const { update } = store;
  return {
    async ingest(blob, meta) {
      const id = newId();
      const el = await blobToElement(blob, meta.kind);
      await putBlob(id, blob);
      onLoaded(id, el);
      const { width, height } = elementSize(el);
      return { id, width, height, ...meta };
    },

    commit(items, target, ids) {
      if (!items.length && !ids?.length) return;
      update((d) => {
        d.media.push(...items);
        const photos = ids ?? items.filter((m) => m.use === "photo").map((m) => m.id);
        if (photos.length) {
          const scene = target && d.scenes.find((s) => s.uid === target.sceneUid);
          if (scene && target) {
            scene.params[target.key] = appendToGallery(scene.params[target.key], photos, target.max);
            scene.enabled = true;
          } else {
            let photoScenes = d.scenes.filter((s) => PHOTO_SCENES.includes(s.type));
            if (!photoScenes.length) {
              const s = createScene("bento", "slide");
              d.scenes.splice(Math.min(3, d.scenes.length), 0, s);
              photoScenes = [s];
            }
            photoScenes.forEach((s) => (s.params.images = appendToGallery(s.params.images, photos)));
            // Switch on a photo scene the first time photos arrive.
            if (!photoScenes.some((s) => s.enabled)) (photoScenes.find((x) => x.type === "bento") ?? photoScenes[0]).enabled = true;
          }
        }
        for (const item of items.filter((m) => m.use !== "photo")) {
          // Make sure there's a scene to show each screen: reuse an unused screens scene, else add one.
          const idle = d.scenes.find((s) => s.type === "screens" && (!s.params.media || !d.media.some((m) => m.id === s.params.media)));
          if (idle) {
            idle.enabled = true;
            idle.params.media = item.id;
          } else {
            const s = createScene("screens", "slide");
            s.params.media = item.id;
            const at = d.scenes.findIndex((x) => x.type === "browser");
            d.scenes.splice(at >= 0 ? at + 1 : d.scenes.length, 0, s);
          }
        }
      });
    },

    remove(id) {
      deleteBlob(id);
      update((d) => {
        d.media = d.media.filter((m) => m.id !== id);
        d.scenes.forEach((s) => {
          if (s.type === "screens" && s.params.media === id) s.params.media = "";
          if (PHOTO_SCENES.includes(s.type)) s.params.images = JSON.stringify(parseGallery(s.params.images).filter((g) => g.id !== id));
        });
      });
    },
  };
}

export const LibraryContext = createContext<Library | null>(null);
export function useLibrary() {
  const lib = useContext(LibraryContext);
  if (!lib) throw new Error("LibraryContext missing");
  return lib;
}

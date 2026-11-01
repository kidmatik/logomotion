import { useCallback, useEffect, useRef, useState } from "react";
import type { Project, SceneInstance } from "../types";
import { defaultProject } from "../brand/defaults";
import { createScene, sceneDef } from "../scenes/registry";
import { PHOTO_SCENES } from "../scenes/photos";
import { normalizeGuide } from "../guide/model";

/** Fill in anything missing from an older or hand-edited project file. */
/**
 * Photo scenes that have never had photos chosen ("" rather than "[]") pick up
 * every photo in the library, so photos you add show up without extra steps.
 */
export function fillPhotoScenes(scenes: SceneInstance[], media: Project["media"]) {
  const photos = media.filter((m) => m.use === "photo");
  if (!photos.length) return;
  for (const s of scenes) {
    if (PHOTO_SCENES.includes(s.type) && !s.params.images) s.params.images = JSON.stringify(photos.map((m) => ({ id: m.id, span: "auto" })));
  }
}

export function normalizeProject(raw: unknown): Project {
  const base = defaultProject();
  if (!raw || typeof raw !== "object") return base;
  const p = raw as Partial<Project>;
  const scenes = Array.isArray(p.scenes)
    ? p.scenes
        .filter((s) => s && sceneDef(s.type))
        .map((s) => {
          const fresh = createScene(s.type);
          return { ...fresh, ...s, params: { ...fresh.params, ...(s.params ?? {}) } };
        })
    : base.scenes;
  const media: Project["media"] = Array.isArray(p.media) ? p.media.map((m) => ({ ...m, use: m.use ?? "screen", focusX: m.focusX ?? 0.5, focusY: m.focusY ?? 0.5 })) : [];
  fillPhotoScenes(scenes, media);
  return {
    version: 1,
    template: p.template ?? base.template,
    // 4:5 was dropped; older projects open as 9:16.
    aspect: (p.aspect as string) === "4:5" ? "9:16" : p.aspect ?? base.aspect,
    tempo: { ...base.tempo, ...(p.tempo ?? {}) },
    music: { ...base.music, ...(p.music ?? {}) },
    brand: {
      ...base.brand,
      ...(p.brand ?? {}),
      colors: { ...base.brand.colors, ...(p.brand?.colors ?? {}) },
      font: { ...base.brand.font, ...(p.brand?.font ?? {}) },
    },
    media,
    scenes,
    ...(p.guide ? { guide: normalizeGuide(p.guide) } : {}),
  };
}

/** The project a guest (or a build without accounts) keeps in this browser. */
export const LOCAL_KEY = "logomotion.project.v1";

export function loadLocalProject(): Project {
  try {
    const s = localStorage.getItem(LOCAL_KEY);
    if (s) return normalizeProject(JSON.parse(s));
  } catch {
    /* fall through to defaults */
  }
  return defaultProject();
}

let localTimer: ReturnType<typeof setTimeout> | undefined;
let localPending: Project | null = null;
/** Debounced save to this browser. */
export function saveLocalProject(p: Project) {
  localPending = p;
  clearTimeout(localTimer);
  localTimer = setTimeout(flushLocalProject, 250);
}
/** Write any pending browser save now (e.g. right before leaving for Google sign-in). */
export function flushLocalProject() {
  clearTimeout(localTimer);
  if (!localPending) return;
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(localPending));
  } catch {
    /* storage full: the project file export still works */
  }
  localPending = null;
}

export type Updater = (draft: Project) => void;

export interface Store {
  project: Project;
  /** Apply a change. Rapid changes with the same key (e.g. a slider drag) merge into one undo step. */
  update: (fn: Updater, mergeKey?: string) => void;
  replace: (p: Project) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/** `persist` is called after every change; it decides where (browser or account) and debounces. */
export function useStore(initial: Project, persist: (p: Project) => void): Store {
  const [project, setProject] = useState<Project>(initial);
  const past = useRef<Project[]>([]);
  const future = useRef<Project[]>([]);
  const lastMerge = useRef<{ key: string; at: number } | null>(null);
  const [, force] = useState(0);

  // Autosave so nothing is lost on reload. Skip the first render: nothing has changed yet.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    persist(project);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  const update = useCallback((fn: Updater, mergeKey?: string) => {
    setProject((cur) => {
      const next = structuredClone(cur);
      fn(next);
      const now = performance.now();
      const merge = mergeKey && lastMerge.current?.key === mergeKey && now - lastMerge.current.at < 800;
      if (!merge) {
        past.current.push(cur);
        if (past.current.length > 100) past.current.shift();
      }
      future.current = [];
      lastMerge.current = mergeKey ? { key: mergeKey, at: now } : null;
      return next;
    });
    force((n) => n + 1);
  }, []);

  const replace = useCallback((p: Project) => {
    setProject((cur) => {
      past.current.push(cur);
      future.current = [];
      return p;
    });
    force((n) => n + 1);
  }, []);

  const undo = useCallback(() => {
    setProject((cur) => {
      const prev = past.current.pop();
      if (!prev) return cur;
      future.current.push(cur);
      return prev;
    });
    lastMerge.current = null;
    force((n) => n + 1);
  }, []);

  const redo = useCallback(() => {
    setProject((cur) => {
      const next = future.current.pop();
      if (!next) return cur;
      past.current.push(cur);
      return next;
    });
    lastMerge.current = null;
    force((n) => n + 1);
  }, []);

  return { project, update, replace, undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0 };
}

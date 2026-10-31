import { useCallback, useEffect, useRef, useState } from "react";
import type { Project } from "../types";
import { defaultProject } from "../brand/defaults";
import { createScene, sceneDef } from "../scenes/registry";

const KEY = "logomotion.project.v1";

/** Fill in anything missing from an older or hand-edited project file. */
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
  return {
    version: 1,
    template: p.template ?? base.template,
    aspect: p.aspect ?? base.aspect,
    tempo: { ...base.tempo, ...(p.tempo ?? {}) },
    brand: {
      ...base.brand,
      ...(p.brand ?? {}),
      colors: { ...base.brand.colors, ...(p.brand?.colors ?? {}) },
      font: { ...base.brand.font, ...(p.brand?.font ?? {}) },
    },
    media: Array.isArray(p.media) ? p.media.map((m) => ({ ...m, use: m.use ?? "screen", focusX: m.focusX ?? 0.5, focusY: m.focusY ?? 0.5 })) : [],
    scenes,
  };
}

function load(): Project {
  try {
    const s = localStorage.getItem(KEY);
    if (s) return normalizeProject(JSON.parse(s));
  } catch {
    /* fall through to defaults */
  }
  return defaultProject();
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

export function useStore(): Store {
  const [project, setProject] = useState<Project>(load);
  const past = useRef<Project[]>([]);
  const future = useRef<Project[]>([]);
  const lastMerge = useRef<{ key: string; at: number } | null>(null);
  const [, force] = useState(0);

  // Autosave (debounced) so nothing is lost on reload.
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(project));
      } catch {
        /* storage full: the project file export still works */
      }
    }, 250);
    return () => clearTimeout(id);
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

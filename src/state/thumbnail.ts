import { useEffect } from "react";
import type { Project } from "../types";
import type { BrandAssets } from "../engine/kit";
import { ASPECTS, buildTimeline, renderFrame } from "../engine/renderer";

const W = 240;

/** Draw the moment the logo builds as a small JPEG, for the project list. */
export function projectThumbnail(project: Project, assets: BrandAssets): string | null {
  const { total, entries } = buildTimeline(project);
  if (total <= 0) return null;
  const hero = entries.find((e) => ["reveal", "wordbuild", "sting"].includes(e.scene.type)) ?? entries[0];
  const t = hero.start + Math.min(1.6, hero.dur * 0.6);
  const { w, h } = ASPECTS[project.aspect];
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = Math.round((W * h) / w);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  try {
    renderFrame(ctx, canvas.width, canvas.height, project, assets, t);
    return canvas.toDataURL("image/jpeg", 0.72);
  } catch {
    return null;
  }
}

/** Refresh the thumbnail a few seconds after editing settles. */
export function useProjectThumbnail(project: Project, assets: BrandAssets, version: number, onThumb: ((url: string) => void) | null) {
  useEffect(() => {
    if (!onThumb) return;
    const id = setTimeout(() => {
      const url = projectThumbnail(project, assets);
      if (url) onThumb(url);
    }, 2500);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, version, onThumb]);
}

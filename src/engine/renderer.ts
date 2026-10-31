import type { Aspect, Project, SceneInstance } from "../types";
import { sceneDef } from "../scenes/registry";
import { RenderCtx, ease, type BrandAssets, type VideoRequest } from "./kit";

export const TRANSITION_TIME = 0.5;

export const ASPECTS: Record<Aspect, { w: number; h: number; label: string }> = {
  "16:9": { w: 1920, h: 1080, label: "16:9" },
  "9:16": { w: 1080, h: 1920, label: "9:16" },
  "1:1": { w: 1080, h: 1080, label: "1:1" },
  "4:5": { w: 1080, h: 1350, label: "4:5" },
};

export interface TimelineEntry {
  scene: SceneInstance;
  start: number;
  end: number;
  /** Effective length (after beat snapping). */
  dur: number;
}

/** A scene's length after optional snapping to whole beats. */
export function effectiveDuration(project: Project, scene: SceneInstance) {
  const { bpm, snap } = project.tempo;
  if (!snap || bpm <= 0) return scene.duration;
  const beat = 60 / bpm;
  return Math.max(1, Math.round(scene.duration / beat)) * beat;
}

/** The enabled scenes laid end to end. Pure, so preview, timeline and export agree. */
export function buildTimeline(project: Project): { entries: TimelineEntry[]; total: number } {
  const entries: TimelineEntry[] = [];
  let t = 0;
  for (const scene of project.scenes) {
    if (!scene.enabled || !sceneDef(scene.type)) continue;
    const dur = effectiveDuration(project, scene);
    entries.push({ scene, start: t, end: t + dur, dur });
    t += dur;
  }
  return { entries, total: t };
}

export function entryAt(entries: TimelineEntry[], t: number): number {
  for (let i = 0; i < entries.length; i++) if (t < entries[i].end) return i;
  return entries.length - 1;
}

/** Scratch canvases for transitions, reused between frames. */
const scratch: { a?: HTMLCanvasElement; b?: HTMLCanvasElement } = {};
function scratchCanvas(key: "a" | "b", w: number, h: number) {
  let c = scratch[key];
  if (!c) c = scratch[key] = document.createElement("canvas");
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  return c;
}

function drawScene(ctx: CanvasRenderingContext2D, w: number, h: number, project: Project, assets: BrandAssets, entry: TimelineEntry, local: number, requests: VideoRequest[]) {
  const def = sceneDef(entry.scene.type)!;
  const rc = new RenderCtx(ctx, w, h, project.brand, assets);
  ctx.save();
  try {
    def.render(rc, local, entry.dur, entry.scene.params);
  } catch (err) {
    console.error(`Scene ${def.type} failed`, err);
  }
  ctx.restore();
  requests.push(...rc.videoRequests);
}

/**
 * Render the frame at time t into ctx. Returns the videos the frame wanted and
 * at which time, so the caller can keep video elements in sync.
 */
export function renderFrame(ctx: CanvasRenderingContext2D, w: number, h: number, project: Project, assets: BrandAssets, t: number): VideoRequest[] {
  const requests: VideoRequest[] = [];
  const { entries } = buildTimeline(project);
  ctx.save();
  ctx.fillStyle = project.brand.colors.white;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  if (!entries.length) return requests;

  const i = entryAt(entries, t);
  const cur = entries[i];
  const local = t - cur.start;
  const kind = cur.scene.transition;
  const T = Math.min(TRANSITION_TIME, cur.dur / 2, project.tempo.snap ? 60 / project.tempo.bpm / 2 : Infinity);

  if (i === 0 || kind === "cut" || local >= T) {
    drawScene(ctx, w, h, project, assets, cur, local, requests);
    return requests;
  }

  // Transition: the outgoing scene keeps running past its end while the new one comes in.
  const prev = entries[i - 1];
  const A = scratchCanvas("a", w, h), B = scratchCanvas("b", w, h);
  const actx = A.getContext("2d")!, bctx = B.getContext("2d")!;
  drawScene(actx, w, h, project, assets, prev, prev.dur + local, requests);
  drawScene(bctx, w, h, project, assets, cur, local, requests);
  const e = ease.inOutCubic(local / T);

  ctx.save();
  switch (kind) {
    case "fade":
      ctx.drawImage(A, 0, 0);
      ctx.globalAlpha = e;
      ctx.drawImage(B, 0, 0);
      break;
    case "slide":
      ctx.drawImage(A, -w * e, 0);
      ctx.drawImage(B, w * (1 - e), 0);
      break;
    case "wipe": {
      ctx.drawImage(A, 0, 0);
      ctx.beginPath();
      ctx.rect(0, 0, w * e, h);
      ctx.clip();
      ctx.drawImage(B, 0, 0);
      break;
    }
    case "zoom": {
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(1 + 0.25 * e, 1 + 0.25 * e);
      ctx.drawImage(A, -w / 2, -h / 2);
      ctx.restore();
      ctx.globalAlpha = e;
      ctx.translate(w / 2, h / 2);
      ctx.scale(0.85 + 0.15 * e, 0.85 + 0.15 * e);
      ctx.drawImage(B, -w / 2, -h / 2);
      break;
    }
    default:
      ctx.drawImage(B, 0, 0);
  }
  ctx.restore();
  return requests;
}

/** Live preview: nudge video elements towards the time the frame asked for. */
export function syncVideosLive(requests: VideoRequest[], playing: boolean) {
  for (const { el, time } of requests) {
    if (Math.abs(el.currentTime - time) > 0.25) el.currentTime = time;
    if (playing && el.paused) el.play().catch(() => undefined);
    if (!playing && !el.paused) el.pause();
  }
}

/** Export: seek every requested video exactly and wait until the frame is ready. */
export async function seekVideosExact(requests: VideoRequest[]) {
  await Promise.all(
    requests.map(({ el, time }) => {
      el.pause();
      if (Math.abs(el.currentTime - time) < 0.004) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const done = () => {
          el.removeEventListener("seeked", done);
          resolve();
        };
        el.addEventListener("seeked", done);
        el.currentTime = time;
        setTimeout(done, 1500);
      });
    }),
  );
}

import { useEffect, useMemo, useRef } from "react";
import type { Aspect, Project } from "../types";
import type { BrandAssets } from "../engine/kit";
import { ASPECTS, buildTimeline, renderFrame } from "../engine/renderer";
import { createScene } from "../scenes/registry";

/** The project cut down to one scene in one format, keeping the user's own settings for that scene. */
export function sceneProject(project: Project, type: string, aspect: Aspect): Project {
  const own = project.scenes.find((s) => s.type === type);
  const scene = own ? { ...own, enabled: true, transition: "cut" as const } : createScene(type, "cut");
  return { ...project, aspect, scenes: [scene] };
}

/** Download one frame of a scene at full size. */
export async function downloadScenePng(project: Project, assets: BrandAssets, type: string, aspect: Aspect, name: string, at = 0.7) {
  const p = sceneProject(project, type, aspect);
  const { w, h } = ASPECTS[aspect];
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  renderFrame(c.getContext("2d")!, w, h, p, assets, buildTimeline(p).total * at);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * One scene playing on a loop, drawn by the same renderer as the film. Only
 * animates while it's on screen, so a page full of them stays light.
 */
export function SceneLoop({ project, assets, type, aspect, round, still }: { project: Project; assets: BrandAssets; type: string; aspect: Aspect; round?: boolean; still?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const p = useMemo(() => sceneProject(project, type, aspect), [project, type, aspect]);
  const latest = useRef({ p, assets });
  latest.current = { p, assets };

  useEffect(() => {
    const c = ref.current!;
    const { w: AW, h: AH } = ASPECTS[aspect];
    let raf = 0;
    let visible = false;
    let t = 0;
    let last = performance.now();
    const size = () => {
      const r = c.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width * dpr));
      const h = Math.round((w * AH) / AW);
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
    };
    const draw = () => {
      const { p, assets } = latest.current;
      const total = buildTimeline(p).total || 1;
      try {
        renderFrame(c.getContext("2d")!, c.width, c.height, p, assets, still !== undefined ? total * still : t % total);
      } catch {
        /* one example failing shouldn't take the page down */
      }
    };
    const loop = (now: number) => {
      t += Math.min(0.1, (now - last) / 1000);
      last = now;
      draw();
      if (visible && still === undefined) raf = requestAnimationFrame(loop);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) {
        size();
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    });
    io.observe(c);
    const ro = new ResizeObserver(() => {
      size();
      draw();
    });
    ro.observe(c);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
    };
  }, [aspect, still]);

  const { w, h } = ASPECTS[aspect];
  return <canvas ref={ref} className={"gp-loop" + (round ? " round" : "")} style={{ aspectRatio: `${w} / ${h}` }} />;
}

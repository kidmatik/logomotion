import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Project } from "../types";
import type { BrandAssets } from "../engine/kit";
import { ASPECTS, buildTimeline, entryAt, renderFrame, syncVideosLive } from "../engine/renderer";
import { sceneDef } from "../scenes/registry";
import { clock, useClock } from "../state/clock";
import { Icon } from "./icons";

function fmt(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Live preview. Draws straight from the project on every animation frame, so
 * any edit (colour, text, order, timing) shows up immediately.
 */
export function Preview({ project, assets, assetsVersion }: { project: Project; assets: BrandAssets; assetsVersion: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const latest = useRef({ project, assets });
  latest.current = { project, assets };
  const dirty = useRef(true);
  const aspect = ASPECTS[project.aspect];

  // Fit the stage into the available space at the project's aspect ratio.
  useLayoutEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const k = Math.min(r.width / aspect.w, r.height / aspect.h);
      setBox({ w: Math.floor(aspect.w * k), h: Math.floor(aspect.h * k) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect.w, aspect.h]);

  useEffect(() => {
    dirty.current = true;
  }, [project, assets, assetsVersion, box]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastT = -1;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const { project, assets } = latest.current;
      const { total } = buildTimeline(project);
      if (clock.t > total) clock.seek(0);
      clock.advance(dt, total);
      const c = canvas.current;
      if (c && c.width > 0 && (dirty.current || clock.t !== lastT || clock.playing)) {
        const ctx = c.getContext("2d")!;
        const req = renderFrame(ctx, c.width, c.height, project, assets, clock.t);
        syncVideosLive(req, clock.playing);
        // Pause any video that isn't on screen.
        for (const el of assets.media.values()) {
          if (el instanceof HTMLVideoElement && !req.some((r) => r.el === el) && !el.paused) el.pause();
        }
        dirty.current = false;
        lastT = clock.t;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  return (
    <div className="stage-wrap" ref={wrap}>
      <canvas
        ref={canvas}
        className="stage"
        width={Math.round(box.w * dpr)}
        height={Math.round(box.h * dpr)}
        style={{ width: box.w, height: box.h }}
        onClick={() => clock.toggle()}
        aria-label="Video preview. Click to play or pause."
      />
    </div>
  );
}

export function PlayerBar({ project }: { project: Project }) {
  const { t, playing } = useClock();
  const { total } = buildTimeline(project);
  const pct = total ? (t / total) * 100 : 0;
  return (
    <div className="player">
      <button type="button" className="play-btn" onClick={() => clock.toggle()} aria-label={playing ? "Pause" : "Play"}>
        {playing ? <Icon.Pause size={16} /> : <Icon.Play size={16} />}
      </button>
      <input
        type="range"
        className="scrubber"
        min={0}
        max={Math.max(0.01, total)}
        step={0.01}
        value={Math.min(t, total)}
        style={{ ["--pct" as string]: `${pct}%` }}
        onChange={(e) => clock.seek(Number(e.target.value))}
        aria-label="Seek"
      />
      <span className="time">
        {fmt(t)} / {fmt(total)}
      </span>
    </div>
  );
}

/** The enabled scenes as proportional blocks. Click a block to jump to it. */
export function Timeline({ project }: { project: Project }) {
  const { t } = useClock();
  const { entries, total } = buildTimeline(project);
  if (!entries.length) return <div className="timeline empty">All scenes are switched off. Turn one on in the Scenes tab.</div>;
  const cur = entryAt(entries, t);
  return (
    <div className="timeline" role="list">
      {entries.map((e, i) => (
        <button
          type="button"
          role="listitem"
          key={e.scene.uid}
          className={"tl-block" + (i === cur ? " current" : "")}
          style={{ flexGrow: e.dur }}
          onClick={() => clock.seek(e.start + Math.min(0.6, e.dur / 2))}
          title={`${sceneDef(e.scene.type)?.name} · ${e.dur.toFixed(1)}s`}
        >
          {i === cur && <span className="tl-progress" style={{ width: `${((t - e.start) / e.dur) * 100}%` }} />}
          <span className="tl-label">{sceneDef(e.scene.type)?.name}</span>
        </button>
      ))}
      <span className="tl-total">{total.toFixed(1)}s</span>
    </div>
  );
}

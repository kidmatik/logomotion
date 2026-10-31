import { useEffect, useRef, useState } from "react";
import type { Project, SceneInstance } from "../types";
import { RenderCtx, type ParamDef } from "../engine/kit";
import { ASPECTS, effectiveDuration } from "../engine/renderer";
import { sceneDef } from "../scenes/registry";
import { previewTime } from "../scenes/photos";
import { useBrandAssets } from "../state/mediaContext";

const THUMB_W = 132;

/** One option drawn by the real scene renderer, so what you see is what you get. Plays on hover. */
function SceneThumb({ project, scene, paramKey, option, mode }: { project: Project; scene: SceneInstance; paramKey: string; option: string; mode: "motion" | "settled" }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const ctxAssets = useBrandAssets();
  const [hover, setHover] = useState(false);
  const { w: AW, h: AH } = ASPECTS[project.aspect];
  const h = Math.round((THUMB_W * AH) / AW);
  const params = { ...scene.params, [paramKey]: option };
  const duration = effectiveDuration(project, scene);
  const deps = JSON.stringify(params) + project.aspect + JSON.stringify(project.brand.colors) + project.brand.logoSvg.length + duration + (ctxAssets?.version ?? 0);

  useEffect(() => {
    const canvas = ref.current;
    const def = sceneDef(scene.type);
    if (!canvas || !def || !ctxAssets) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = THUMB_W * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d")!;
    const draw = (t: number) => {
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      try {
        def.render(new RenderCtx(ctx, canvas.width, canvas.height, project.brand, ctxAssets.assets), t, duration, params);
      } catch {
        /* a thumbnail failing shouldn't break the panel */
      }
      ctx.restore();
    };
    if (!hover) {
      draw(previewTime(scene.type, duration, params, mode));
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      draw(((now - t0) / 1000) % duration);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps, hover, h]);

  return <canvas ref={ref} style={{ width: THUMB_W, height: h }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} aria-hidden />;
}

/** A select shown as a grid of live scene thumbnails. */
export function VisualSelect({ def, value, project, scene, onChange }: { def: Extract<ParamDef, { type: "select" }>; value: string; project: Project; scene: SceneInstance; onChange: (v: string) => void }) {
  return (
    <div className="field">
      <span className="field-label">{def.label}</span>
      <div className="visual-options" role="radiogroup" aria-label={def.label}>
        {def.options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={"visual-option" + (value === o.value ? " active" : "")} onClick={() => onChange(o.value)} title={def.previewAt === "motion" ? "Hover to play" : o.label}>
            <SceneThumb project={project} scene={scene} paramKey={def.key} option={o.value} mode={def.previewAt ?? "settled"} />
            <span>{o.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

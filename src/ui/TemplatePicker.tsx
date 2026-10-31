import { useEffect, useMemo, useRef, useState } from "react";
import type { Project } from "../types";
import type { BrandAssets } from "../engine/kit";
import { ASPECTS, buildTimeline, renderFrame } from "../engine/renderer";
import { fillPhotoScenes } from "../state/store";
import { TEMPLATES, type Template } from "../templates";
import { Icon } from "./icons";

/** Rough running time of a template's default scenes, for the picker. */
function lengthOf(t: Template) {
  const secs = t.scenes().filter((s) => s.enabled).reduce((sum, s) => sum + s.duration, 0);
  return `~${Math.round(secs)}s`;
}

const THUMB_H = 80;
const THUMB_COL = 142;

/**
 * A live preview of a template, drawn by the real renderer with the user's own
 * brand. It plays on a loop while the menu is open (faster when hovered).
 */
function TemplateThumb({ template, project, assets, active, hover }: { template: Template; project: Project; assets: BrandAssets; active: boolean; hover: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { w: AW, h: AH } = ASPECTS[template.aspect];
  const h = Math.round(Math.min(THUMB_H, (THUMB_COL * AH) / AW));
  const w = Math.round((h * AW) / AH);

  // The active template shows the user's own edit; the others show their default scenes.
  const preview = useMemo<Project>(() => {
    if (active) return { ...project, aspect: template.aspect };
    const scenes = template.scenes();
    fillPhotoScenes(scenes, project.media);
    return { ...project, template: template.id, aspect: template.aspect, tempo: { ...template.tempo }, scenes };
  }, [template, project, active]);
  const hoverRef = useRef(hover);
  hoverRef.current = hover;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d")!;
    const { total, entries } = buildTimeline(preview);
    if (total <= 0) return;
    // Open on the moment the logo builds, so the first frame already says something.
    const hero = entries.find((e) => ["reveal", "wordbuild", "sting"].includes(e.scene.type));
    let t = hero ? hero.start + Math.min(1.2, hero.dur * 0.5) : 0;
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      t = (t + dt * (hoverRef.current ? 1.5 : 1)) % total;
      try {
        renderFrame(ctx, canvas.width, canvas.height, preview, assets, t);
      } catch {
        /* a thumbnail failing shouldn't break the menu */
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [preview, assets, w, h, template.id]);

  return (
    <span className="tp-thumb" aria-hidden>
      <canvas ref={ref} style={{ width: w, height: h }} />
      <span className="tp-aspect">{template.aspect}</span>
    </span>
  );
}

/** A clear, labelled template switcher. New templates in TEMPLATES show up here automatically. */
export function TemplatePicker({ value, onChange, project, assets }: { value: string; onChange: (id: string) => void; project: Project; assets: BrandAssets }) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const current = TEMPLATES.find((t) => t.id === value) ?? TEMPLATES[0];

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div className="template-pick" ref={ref}>
      <button type="button" className="template-btn" onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open} title="Change template">
        <span className="tp-icon">
          <Icon.Templates size={16} />
        </span>
        <span className="tp-text">
          <span className="tp-label">Template</span>
          <span className="tp-name">{current.name}</span>
        </span>
        <Icon.Chevron size={16} />
      </button>
      {open && (
        <div className="template-menu" role="listbox" aria-label="Templates">
          <h3>Templates</h3>
          {TEMPLATES.map((t) => {
            const active = t.id === current.id;
            return (
              <button
                key={t.id}
                type="button"
                role="option"
                aria-selected={active}
                className={"template-option" + (active ? " active" : "")}
                onMouseEnter={() => setHovered(t.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => {
                  if (!active) onChange(t.id);
                  setOpen(false);
                }}
              >
                <TemplateThumb template={t} project={project} assets={assets} active={active} hover={hovered === t.id} />
                <span className="tp-body">
                  <strong>
                    {t.name}
                    {active && <Icon.Check size={14} className="tp-check" />}
                  </strong>
                  <p>{t.description}</p>
                  <span className="tp-meta">
                    {t.aspect} · {lengthOf(t)} · {t.scenes().length} scenes
                  </span>
                </span>
              </button>
            );
          })}
          <p className="tp-foot">Previews use your own brand. Switching keeps your brand kit and media. More templates are on the way.</p>
        </div>
      )}
    </div>
  );
}

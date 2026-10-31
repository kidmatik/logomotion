import { useEffect, useRef, useState } from "react";
import type { Aspect } from "../types";
import { TEMPLATES, type Template } from "../templates";
import { Icon } from "./icons";

/** Rough running time of a template's default scenes, for the picker. */
function lengthOf(t: Template) {
  const secs = t.scenes().filter((s) => s.enabled).reduce((sum, s) => sum + s.duration, 0);
  return `~${Math.round(secs)}s`;
}

function Shape({ aspect }: { aspect: Aspect }) {
  const [w, h] = aspect.split(":").map(Number);
  const k = 36 / Math.max(w, h);
  return (
    <span className="tp-shape" aria-hidden>
      <span style={{ width: w * k, height: h * k }} />
    </span>
  );
}

/** A clear, labelled template switcher. New templates in TEMPLATES show up here automatically. */
export function TemplatePicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
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
                onClick={() => {
                  if (!active) onChange(t.id);
                  setOpen(false);
                }}
              >
                <Shape aspect={t.aspect} />
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
          <p className="tp-foot">Switching keeps your brand kit and media. More templates are on the way.</p>
        </div>
      )}
    </div>
  );
}

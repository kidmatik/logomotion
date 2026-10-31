import { useRef, useState } from "react";
import type { Aspect } from "../types";
import type { Store } from "../state/store";
import { normalizeProject } from "../state/store";
import type { BrandAssets } from "../engine/kit";
import { exportProjectFile, exportStill, exportVideo } from "../engine/exporter";
import { TEMPLATES, templateById } from "../templates";
import { clock } from "../state/clock";
import { Icon } from "./icons";

const ASPECT_OPTIONS: Aspect[] = ["16:9", "9:16", "1:1", "4:5"];

export function TopBar({ store, assets }: { store: Store; assets: BrandAssets }) {
  const { project, update, undo, redo, canUndo, canRedo, replace } = store;
  const [progress, setProgress] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const doExport = async (scale: number) => {
    setError(null);
    abort.current = new AbortController();
    const wasPlaying = clock.playing;
    clock.setPlaying(false);
    setProgress(0);
    try {
      await exportVideo(project, assets, { fps: 30, scale, onProgress: setProgress, signal: abort.current.signal });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message || "Export failed.");
    } finally {
      setProgress(null);
      clock.setPlaying(wasPlaying);
    }
  };

  const switchTemplate = (id: string) => {
    const t = templateById(id);
    update((d) => {
      d.template = t.id;
      d.aspect = t.aspect;
      d.tempo = { ...t.tempo };
      d.scenes = t.scenes();
    });
    clock.seek(0);
  };

  return (
    <header className="topbar">
      <div className="tb-left">
        <span className="brand-dot" aria-hidden />
        <div className="template-pick">
          <select value={project.template} onChange={(e) => switchTemplate(e.target.value)} aria-label="Template">
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <Icon.Chevron size={16} />
        </div>
      </div>

      <div className="segmented" role="radiogroup" aria-label="Format">
        {ASPECT_OPTIONS.map((a) => (
          <button key={a} type="button" role="radio" aria-checked={project.aspect === a} className={project.aspect === a ? "active" : ""} onClick={() => update((d) => void (d.aspect = a))}>
            {a}
          </button>
        ))}
      </div>

      <div className="tb-right">
        <button type="button" className="icon-btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
          <Icon.Undo />
        </button>
        <button type="button" className="icon-btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
          <Icon.Redo />
        </button>
        <div className="menu-wrap">
          <button type="button" className="ghost-btn" onClick={() => setMenu(!menu)} aria-expanded={menu}>
            <Icon.File size={16} /> Project
          </button>
          {menu && (
            <div className="menu" onMouseLeave={() => setMenu(false)}>
              <button type="button" onClick={() => (exportProjectFile(project), setMenu(false))}>Save project file</button>
              <button type="button" onClick={() => (fileInput.current?.click(), setMenu(false))}>Open project file…</button>
              <button type="button" onClick={() => (exportStill(project, assets, clock.t), setMenu(false))}>Download this frame (PNG)</button>
              <button type="button" onClick={() => (doExport(2), setMenu(false))}>Download video in 2× size</button>
              <hr />
              <button
                type="button"
                className="danger"
                onClick={() => {
                  if (confirm("Start over? Your brand kit and scenes go back to the defaults.")) {
                    switchTemplate(project.template);
                    update((d) => void (d.brand = normalizeProject(null).brand));
                  }
                  setMenu(false);
                }}
              >
                Reset everything
              </button>
            </div>
          )}
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                replace(normalizeProject(JSON.parse(await f.text())));
              } catch {
                setError("That isn't a LogoMotion project file.");
              }
            }}
          />
        </div>
        <button type="button" className="primary-btn" onClick={() => doExport(1)} disabled={progress !== null}>
          <Icon.Download size={16} /> Download video
        </button>
      </div>

      {progress !== null && (
        <div className="export-overlay" role="dialog" aria-live="polite">
          <div className="export-card">
            <strong>Rendering your video…</strong>
            <div className="bar">
              <span style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <small>{Math.round(progress * 100)}% · every frame is drawn in your browser</small>
            <button type="button" className="ghost-btn" onClick={() => abort.current?.abort()}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && (
        <div className="toast" role="alert" onClick={() => setError(null)}>
          {error}
        </div>
      )}
    </header>
  );
}

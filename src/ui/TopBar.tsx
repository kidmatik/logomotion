import { useEffect, useRef, useState } from "react";
import type { Aspect } from "../types";
import type { Store } from "../state/store";
import { fillPhotoScenes, normalizeProject } from "../state/store";
import type { BrandAssets } from "../engine/kit";
import { exportProjectFile, exportStill, exportVideo } from "../engine/exporter";
import { templateById } from "../templates";
import { TemplatePicker } from "./TemplatePicker";
import { clock } from "../state/clock";
import { Icon } from "./icons";
import { canDownload } from "../state/entitlement";
import { useTheme } from "../state/theme";
import { needsSignIn, useAccount } from "../cloud/account";
import { AccountControls } from "./AccountMenu";
import { ProjectSwitcher } from "./ProjectSwitcher";

const ASPECT_OPTIONS: Aspect[] = ["16:9", "9:16", "1:1", "4:5"];
/** The formats most social and video platforms want, for "Download all formats". */
const ALL_FORMATS: Aspect[] = ["16:9", "9:16", "1:1"];

export function TopBar({ store, assets }: { store: Store; assets: BrandAssets }) {
  const { project, update, undo, redo, canUndo, canRedo, replace } = store;
  const [progress, setProgress] = useState<number | null>(null);
  const [batch, setBatch] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { theme, toggle: toggleTheme } = useTheme();
  const account = useAccount();
  const [resumeOffer, setResumeOffer] = useState<string | null>(null);

  // Back from Google after pressing Download or Save as a guest: finish what they started.
  useEffect(() => {
    if (!account.user || !account.resume) return;
    setResumeOffer(account.resume);
    account.clearResume();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.user]);

  /** Downloads and saving need an account (when accounts are switched on). */
  const gated = (resume: string, run: () => void) => {
    if (needsSignIn(account)) account.requireSignIn(resume === "save-file" ? "save" : "download", resume);
    else run();
  };
  const actions: Record<string, { label: string; run: () => void }> = {
    video: { label: "Download video", run: () => doExport(1) },
    video2x: { label: "Download video in 2× size", run: () => doExport(2) },
    all: { label: "Download all 3 formats", run: () => doExport(1, ALL_FORMATS) },
    still: { label: "Download this frame", run: () => exportStill(project, assets, clock.t) },
    "save-file": { label: "Save project file", run: () => exportProjectFile(project) },
  };
  const act = (id: string) => gated(id, actions[id].run);

  const doExport = async (scale: number, formats?: Aspect[]) => {
    setError(null);
    // Payments aren't live, so the paywall is off and every signed-in user can download.
    if (!canDownload(account.user ? { email: account.user.email, plan: "free" } : null)) {
      setError("Downloading videos needs the Lifetime plan.");
      return;
    }
    abort.current = new AbortController();
    const wasPlaying = clock.playing;
    clock.setPlaying(false);
    setProgress(0);
    try {
      if (!formats) await exportVideo(project, assets, { fps: 30, scale, onProgress: setProgress, signal: abort.current.signal });
      else
        for (let i = 0; i < formats.length; i++) {
          setBatch(`${i + 1} of ${formats.length} · ${formats[i]}`);
          await exportVideo({ ...project, aspect: formats[i] }, assets, { fps: 30, scale, onProgress: (k) => setProgress((i + k) / formats.length), signal: abort.current.signal });
        }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message || "Export failed.");
    } finally {
      setProgress(null);
      setBatch(null);
      clock.setPlaying(wasPlaying);
    }
  };

  const switchTemplate = (id: string) => {
    const t = templateById(id);
    update((d) => {
      d.template = t.id;
      d.aspect = t.aspect;
      d.tempo = { ...t.tempo };
      d.music = { ...d.music, style: t.music };
      d.scenes = t.scenes();
      fillPhotoScenes(d.scenes, d.media);
    });
    clock.seek(0);
  };

  return (
    <header className="topbar">
      <div className="tb-left">
        <span className="brand-dot" aria-hidden />
        <ProjectSwitcher />
        <TemplatePicker value={project.template} onChange={switchTemplate} project={project} assets={assets} />
      </div>

      <div className="segmented" role="radiogroup" aria-label="Format">
        {ASPECT_OPTIONS.map((a) => (
          <button key={a} type="button" role="radio" aria-checked={project.aspect === a} className={project.aspect === a ? "active" : ""} onClick={() => update((d) => void (d.aspect = a))}>
            {a}
          </button>
        ))}
      </div>

      <div className="tb-right">
        <button type="button" className="icon-btn theme-btn" onClick={toggleTheme} title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
          {theme === "dark" ? <Icon.Sun /> : <Icon.Moon />}
        </button>
        <button type="button" className="icon-btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
          <Icon.Undo />
        </button>
        <button type="button" className="icon-btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
          <Icon.Redo />
        </button>
        <div className="menu-wrap">
          <button type="button" className="ghost-btn" onClick={() => setMenu(!menu)} aria-expanded={menu}>
            <Icon.File size={16} /> File
          </button>
          {menu && (
            <div className="menu" onMouseLeave={() => setMenu(false)}>
              <button type="button" onClick={() => (act("save-file"), setMenu(false))}>Save project file</button>
              <button type="button" onClick={() => (fileInput.current?.click(), setMenu(false))}>Open project file…</button>
              <button type="button" onClick={() => (act("still"), setMenu(false))}>Download this frame (PNG)</button>
              <button type="button" onClick={() => (act("video2x"), setMenu(false))}>Download video in 2× size</button>
              <button type="button" onClick={() => (act("all"), setMenu(false))}>Download in 16:9, 9:16 and 1:1</button>
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
        {project.template === "logo-sting" && (
          <button type="button" className="ghost-btn" onClick={() => act("all")} disabled={progress !== null} title="Download 16:9, 9:16 and 1:1 versions">
            <Icon.Download size={16} /> All 3 formats
          </button>
        )}
        <button type="button" className="primary-btn" onClick={() => act("video")} disabled={progress !== null}>
          <Icon.Download size={16} /> Download video
        </button>
        <AccountControls />
      </div>

      {progress !== null && (
        <div className="export-overlay" role="dialog" aria-live="polite">
          <div className="export-card">
            <strong>{batch ? `Rendering video ${batch}…` : "Rendering your video…"}</strong>
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
      {resumeOffer && (
        <div className="toast resume-toast" role="status">
          {actions[resumeOffer] ? (
            <>
              <span>You're signed in.</span>
              <button type="button" className="primary-btn small" onClick={() => (setResumeOffer(null), actions[resumeOffer].run())}>
                <Icon.Download size={14} /> {actions[resumeOffer].label}
              </button>
            </>
          ) : (
            <span>You're signed in. This project is saved to your account and saves as you edit.</span>
          )}
          <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => setResumeOffer(null)}>
            <Icon.Close size={14} />
          </button>
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

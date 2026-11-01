import { useEffect, useMemo, useState } from "react";
import { useStore } from "./state/store";
import { useAssets } from "./state/useAssets";
import { clock } from "./state/clock";
import { TopBar } from "./ui/TopBar";
import { PlayerBar, Preview, Timeline } from "./ui/Preview";
import { BrandPanel } from "./ui/BrandPanel";
import { ScenesPanel } from "./ui/ScenesPanel";
import { MediaPanel } from "./ui/MediaPanel";
import { MusicPanel } from "./ui/MusicPanel";
import { music } from "./audio/engine";
import { templateById } from "./templates";
import { AssetsContext, MediaContext } from "./state/mediaContext";
import { LibraryContext, createLibrary } from "./state/library";
import type { Project } from "./types";
import { useAccount } from "./cloud/account";
import { useProjectThumbnail } from "./state/thumbnail";
import { Onboarding, isPristine, onboarded, type OnboardingResult } from "./ui/Onboarding";
import { capturePage } from "./brand/media";
import type { Library } from "./state/library";
import { ShareDialog } from "./ui/ShareDialog";

type Tab = "brand" | "scenes" | "media" | "music";

/** The editor for one project. `persist` saves it (to this browser for guests, to the account once signed in). */
export default function App({ initial, persist }: { initial: Project; persist: (p: Project) => void }) {
  const store = useStore(initial, persist);
  const account = useAccount();
  const { project, undo, redo } = store;
  const { assets, version, addMediaElement } = useAssets(project);
  const [tab, setTab] = useState<Tab>("brand");
  // store.update is stable, so the library only needs building once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const library = useMemo(() => createLibrary(store, addMediaElement), [store.update, addMediaElement]);
  const assetsValue = useMemo(() => ({ assets, version }), [assets, version]);
  const [onboarding, setOnboarding] = useState(() => !onboarded() && isPristine(initial));
  const [notice, setNotice] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const finishOnboarding = (r: OnboardingResult) => {
    store.replace(r.project);
    setOnboarding(false);
    clock.seek(0);
    clock.setPlaying(true);
    if (r.goal === "page") setSharing(true);
    if (r.capture || r.files.length) {
      setNotice(r.capture ? "Capturing your website and adding your files…" : "Adding your files…");
      addMaterials(library, r.capture, r.files)
        .then((failed) => setNotice(failed ? "Some files couldn't be added. You can add them again in the Media tab." : null))
        .catch(() => setNotice(null));
    }
  };

  // A small preview image for the project list.
  useProjectThumbnail(project, assets, version, account.user ? account.setThumbnail : null);

  // Keep the soundtrack in step with every edit.
  useEffect(() => music.setProject(project), [project]);
  // Browsers only allow sound after the first click or key press.
  useEffect(() => {
    const unlock = () => music.unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // Keyboard: space to play/pause, arrows to step, Ctrl+Z / Ctrl+Shift+Z for undo/redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !typing) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (typing) return;
      if (e.code === "Space") {
        e.preventDefault();
        clock.toggle();
      } else if (e.key === "ArrowLeft") clock.seek(clock.t - (e.shiftKey ? 1 : 1 / 30));
      else if (e.key === "ArrowRight") clock.seek(clock.t + (e.shiftKey ? 1 : 1 / 30));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  if (onboarding) {
    return <Onboarding initial={project} onFinish={finishOnboarding} onSkip={() => setOnboarding(false)} />;
  }

  return (
    <MediaContext.Provider value={assets.media}>
    <AssetsContext.Provider value={assetsValue}>
    <LibraryContext.Provider value={library}>
    <div className="app">
      <TopBar store={store} assets={assets} onQuickStart={() => setOnboarding(true)} onShare={() => setSharing(true)} />
      <main className="workspace">
        <section className="stage-col">
          <div className="stage-card">
            <Preview project={project} assets={assets} assetsVersion={version} />
            <PlayerBar project={project} />
          </div>
          <Timeline project={project} />
          <p className="template-note">{templateById(project.template).description}</p>
        </section>
        <aside className="sidebar">
          <nav className="tabs" role="tablist">
            {(
              [
                ["brand", "Brand"],
                ["scenes", "Scenes"],
                ["media", "Media"],
                ["music", "Music"],
              ] as [Tab, string][]
            ).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
                {label}
                {id === "media" && project.media.length > 0 && <span className="count">{project.media.length}</span>}
              </button>
            ))}
          </nav>
          {tab === "brand" && <BrandPanel store={store} />}
          {tab === "scenes" && <ScenesPanel store={store} />}
          {tab === "media" && <MediaPanel store={store} media={assets.media} />}
          {tab === "music" && <MusicPanel store={store} />}
        </aside>
      </main>
      {sharing && <ShareDialog project={project} onClose={() => setSharing(false)} />}
      {notice && (
        <div className="toast" role="status" onClick={() => setNotice(null)}>
          {notice}
        </div>
      )}
    </div>
    </LibraryContext.Provider>
    </AssetsContext.Provider>
    </MediaContext.Provider>
  );
}

/** Screenshots of the site plus the files picked during onboarding, added in one go. Returns how many failed. */
async function addMaterials(library: Library, site: string | null, files: File[]) {
  let failed = 0;
  const items = [];
  if (site) {
    for (const device of ["desktop", "mobile"] as const) {
      try {
        const blob = await capturePage(site, device);
        const host = new URL(site).hostname.replace(/^www\./, "");
        items.push(await library.ingest(blob, { kind: "image", use: "screen", label: `${host} (${device})`, origin: "capture", sourceUrl: site, device, focusX: 0.5, focusY: 0 }));
      } catch {
        failed++;
      }
    }
  }
  for (const f of files) {
    try {
      const video = f.type.startsWith("video/");
      items.push(await library.ingest(f, { kind: video ? "video" : "image", use: video ? "screen" : "photo", label: f.name, origin: "upload", focusX: 0.5, focusY: 0.5 }));
    } catch {
      failed++;
    }
  }
  if (items.length) library.commit(items);
  return failed;
}

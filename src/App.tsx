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

type Tab = "brand" | "scenes" | "media" | "music";

export default function App() {
  const store = useStore();
  const { project, undo, redo } = store;
  const { assets, version, addMediaElement } = useAssets(project);
  const [tab, setTab] = useState<Tab>("brand");
  // store.update is stable, so the library only needs building once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const library = useMemo(() => createLibrary(store, addMediaElement), [store.update, addMediaElement]);
  const assetsValue = useMemo(() => ({ assets, version }), [assets, version]);

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

  return (
    <MediaContext.Provider value={assets.media}>
    <AssetsContext.Provider value={assetsValue}>
    <LibraryContext.Provider value={library}>
    <div className="app">
      <TopBar store={store} assets={assets} />
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
    </div>
    </LibraryContext.Provider>
    </AssetsContext.Provider>
    </MediaContext.Provider>
  );
}

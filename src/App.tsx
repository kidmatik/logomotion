import { useEffect, useState } from "react";
import { useStore } from "./state/store";
import { useAssets } from "./state/useAssets";
import { clock } from "./state/clock";
import { TopBar } from "./ui/TopBar";
import { PlayerBar, Preview, Timeline } from "./ui/Preview";
import { BrandPanel } from "./ui/BrandPanel";
import { ScenesPanel } from "./ui/ScenesPanel";
import { ScreensPanel } from "./ui/ScreensPanel";
import { templateById } from "./templates";

type Tab = "brand" | "scenes" | "screens";

export default function App() {
  const store = useStore();
  const { project, undo, redo } = store;
  const { assets, version, addMediaElement } = useAssets(project);
  const [tab, setTab] = useState<Tab>("brand");

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
                ["screens", "Screens"],
              ] as [Tab, string][]
            ).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
                {label}
                {id === "screens" && project.media.length > 0 && <span className="count">{project.media.length}</span>}
              </button>
            ))}
          </nav>
          {tab === "brand" && <BrandPanel store={store} />}
          {tab === "scenes" && <ScenesPanel store={store} />}
          {tab === "screens" && <ScreensPanel store={store} media={assets.media} onAdded={addMediaElement} />}
        </aside>
      </main>
    </div>
  );
}

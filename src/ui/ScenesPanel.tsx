import { useState } from "react";
import { fillPhotoScenes, type Store } from "../state/store";
import type { ColorRole, SceneInstance, TransitionKind } from "../types";
import { SCENES, createScene, sceneDef } from "../scenes/registry";
import { resolveColors, type ParamDef } from "../engine/kit";
import { buildTimeline, effectiveDuration } from "../engine/renderer";
import { clock } from "../state/clock";
import { Help, RolePicker, Select, Slider, TextInput, Toggle } from "./controls";
import { Icon } from "./icons";
import { BackdropControl, SceneColorsControl } from "./BackdropControl";
import { GalleryControl } from "./GalleryControl";
import { VisualSelect } from "./VisualSelect";
import { ScreenControl } from "./ScreenControl";
import { SurfaceControl } from "./SurfaceControl";

const TRANSITIONS: { value: TransitionKind; label: string }[] = [
  { value: "cut", label: "Cut" },
  { value: "fade", label: "Fade" },
  { value: "slide", label: "Slide" },
  { value: "wipe", label: "Wipe" },
  { value: "zoom", label: "Zoom" },
];

function ParamControl({ def, value, onChange, store, scene }: { def: ParamDef; value: unknown; onChange: (v: string | number | boolean) => void; store: Store; scene: SceneInstance }) {
  const colors = resolveColors(store.project.brand);
  if (def.showIf && !def.showIf(scene.params)) return null;
  switch (def.type) {
    case "role":
      return (
        <div className="field">
          <span className="field-label">{def.label}</span>
          <RolePicker value={value as ColorRole} roles={def.roles} colors={colors} onChange={onChange} />
        </div>
      );
    case "text":
      return (
        <div className="field">
          <span className="field-label">{def.label}</span>
          <TextInput value={String(value ?? "")} placeholder={def.placeholder} onChange={onChange} />
        </div>
      );
    case "number":
      return <Slider label={def.label} value={Number(value)} min={def.min} max={def.max} step={def.step} unit={def.unit} onChange={onChange} />;
    case "select":
      if (def.visual) return <VisualSelect def={def} value={String(value)} project={store.project} scene={scene} onChange={onChange} />;
      return (
        <div className="field">
          <span className="field-label">{def.label}</span>
          <Select value={String(value)} options={def.options} onChange={onChange} />
        </div>
      );
    case "boolean":
      return (
        <div className="toggle-row">
          <span>{def.label}</span>
          <Toggle checked={Boolean(value)} label={def.label} onChange={onChange} />
        </div>
      );
    case "gallery":
      return (
        <GalleryControl
          label={def.label}
          value={String(value ?? "")}
          spans={def.spans}
          max={def.max}
          store={store}
          sceneUid={scene.uid}
          paramKey={def.key}
          sceneName={sceneDef(scene.type)?.name ?? "this scene"}
          onChange={onChange}
        />
      );
    case "surface":
      return <SurfaceControl label={def.label} value={String(value ?? "")} store={store} sceneUid={scene.uid} onChange={onChange} />;
    case "media":
      // The second (phone) screen only matters in the Desktop + phone layout.
      if (def.key === "mobile" && scene.params.frame !== "duo") return null;
      return <ScreenControl label={def.label} value={String(value || "")} store={store} sceneUid={scene.uid} paramKey={def.key} onChange={onChange} showCapture={def.key !== "mobile"} />;
  }
}

function SceneRow({
  scene,
  index,
  store,
  open,
  onOpen,
  dragging,
  onDragStart,
  onDragOver,
  onDragEnd,
}: {
  scene: SceneInstance;
  index: number;
  store: Store;
  open: boolean;
  onOpen: () => void;
  dragging: boolean;
  onDragStart: () => void;
  onDragOver: () => void;
  onDragEnd: () => void;
}) {
  const def = sceneDef(scene.type)!;
  const { update } = store;
  const set = (fn: (s: SceneInstance) => void, key?: string) =>
    update((d) => {
      const s = d.scenes.find((x) => x.uid === scene.uid);
      if (s) fn(s);
    }, key && `${scene.uid}:${key}`);

  const jump = () => {
    const { entries } = buildTimeline(store.project);
    const e = entries.find((x) => x.scene.uid === scene.uid);
    if (e) clock.seek(e.start + Math.min(0.6, scene.duration / 2));
  };

  return (
    <li
      className={"scene-row" + (scene.enabled ? "" : " off") + (open ? " open" : "") + (dragging ? " dragging" : "")}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver();
      }}
      onDrop={(e) => e.preventDefault()}
    >
      <div className="scene-head">
        <span className="grip" draggable onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", scene.uid);
          onDragStart();
        }} onDragEnd={onDragEnd} title="Drag to reorder" aria-label="Drag to reorder">
          <Icon.Grip size={16} />
        </span>
        <button
          type="button"
          className="scene-title"
          onClick={() => {
            onOpen();
            jump();
          }}
          aria-expanded={open}
        >
          <span className="scene-index">{String(index + 1).padStart(2, "0")}</span>
          <span className="scene-name">{def.name}</span>
          <span className="scene-dur">{effectiveDuration(store.project, scene).toFixed(1)}s</span>
          <Icon.Chevron size={16} className="chev" />
        </button>
        <Toggle checked={scene.enabled} label={`Show ${def.name}`} onChange={(v) => set((s) => void (s.enabled = v))} />
      </div>
      {open && (
        <div className="scene-body">
          <Help>{def.description}</Help>
          <Slider label="Length" value={scene.duration} min={def.minDuration} max={def.maxDuration} step={0.1} unit="s" onChange={(v) => set((s) => void (s.duration = v), "dur")} />
          <div className="field">
            <span className="field-label">Transition in</span>
            <Select value={scene.transition} options={TRANSITIONS} onChange={(v) => set((s) => void (s.transition = v))} />
          </div>
          <BackdropControl scene={scene} store={store} />
          <SceneColorsControl scene={scene} store={store} />
          {def.params.map((p, i) => (
            <div key={p.key} className="param">
              {p.group && p.group !== def.params[i - 1]?.group && <h4 className="param-group">{p.group}</h4>}
              <ParamControl def={p} value={scene.params[p.key]} store={store} scene={scene} onChange={(v) => set((s) => void (s.params[p.key] = v), p.type === "text" || p.type === "number" ? p.key : undefined)} />
            </div>
          ))}
          <div className="scene-actions">
            <button
              type="button"
              className="ghost-btn"
              onClick={() =>
                update((d) => {
                  const i = d.scenes.findIndex((x) => x.uid === scene.uid);
                  const copy = { ...structuredClone(d.scenes[i]), uid: createScene(scene.type).uid };
                  d.scenes.splice(i + 1, 0, copy);
                })
              }
            >
              <Icon.Copy size={15} /> Duplicate
            </button>
            <button
              type="button"
              className="ghost-btn"
              onClick={() =>
                set((s) => {
                  const fresh = createScene(s.type);
                  fillPhotoScenes([fresh], store.project.media);
                  s.params = fresh.params;
                  s.duration = fresh.duration;
                })
              }
            >
              Reset
            </button>
            <button type="button" className="ghost-btn danger" onClick={() => update((d) => void (d.scenes = d.scenes.filter((x) => x.uid !== scene.uid)))}>
              <Icon.Trash size={15} /> Remove
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

export function ScenesPanel({ store }: { store: Store }) {
  const { project, update } = store;
  const [open, setOpen] = useState<string | null>(null);
  // A one-scene template (like the logo sting) shows its settings until you close them.
  const autoOpen = project.scenes.length === 1 && (open === null || (open !== "" && !project.scenes.some((x) => x.uid === open)));
  const [drag, setDrag] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const { total } = buildTimeline(project);
  const enabled = project.scenes.filter((s) => s.enabled).length;

  const moveTo = (targetUid: string) => {
    if (!drag || drag === targetUid) return;
    update((d) => {
      const from = d.scenes.findIndex((s) => s.uid === drag);
      const to = d.scenes.findIndex((s) => s.uid === targetUid);
      if (from < 0 || to < 0) return;
      const [s] = d.scenes.splice(from, 1);
      d.scenes.splice(to, 0, s);
    }, "reorder:" + drag);
  };

  return (
    <div className="panel-scroll">
      <div className="scenes-summary">
        <span>
          {enabled} of {project.scenes.length} scenes on · {total.toFixed(1)}s
        </span>
        <div className="summary-actions">
          <button type="button" className="link-btn" onClick={() => update((d) => d.scenes.forEach((s) => (s.enabled = true)))}>
            All on
          </button>
        </div>
      </div>
      <div className="tempo">
        <div className="toggle-row">
          <span>Cut on the beat</span>
          <Toggle checked={project.tempo.snap} label="Cut on the beat" onChange={(v) => update((d) => void (d.tempo.snap = v))} />
        </div>
        {project.tempo.snap && (
          <Slider label="Tempo" value={project.tempo.bpm} min={60} max={180} step={1} unit="BPM" onChange={(v) => update((d) => void (d.tempo.bpm = v), "bpm")} />
        )}
      </div>
      <Help>Switch scenes on or off, drag them into any order, and open one to change its length, transition and settings. Each scene can also have its own colours, logo colour included.</Help>
      <ul className="scene-list">
        {project.scenes.map((s, i) => (
          <SceneRow
            key={s.uid}
            scene={s}
            index={i}
            store={store}
            open={open === s.uid || autoOpen}
            onOpen={() => setOpen(open === s.uid || autoOpen ? "" : s.uid)}
            dragging={drag === s.uid}
            onDragStart={() => setDrag(s.uid)}
            onDragOver={() => moveTo(s.uid)}
            onDragEnd={() => setDrag(null)}
          />
        ))}
      </ul>
      <div className="add-scene">
        <button type="button" className="ghost-btn wide" onClick={() => setAdding(!adding)} aria-expanded={adding}>
          <Icon.Plus size={16} /> Add a scene
        </button>
        {adding && (
          <ul className="add-list">
            {SCENES.map((def) => (
              <li key={def.type}>
                <button
                  type="button"
                  onClick={() => {
                    const s = createScene(def.type);
                    fillPhotoScenes([s], project.media);
                    update((d) => void d.scenes.push(s));
                    setOpen(s.uid);
                    setAdding(false);
                  }}
                >
                  <strong>{def.name}</strong>
                  <small>{def.description}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

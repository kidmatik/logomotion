import { useState } from "react";
import type { Store } from "../state/store";
import { useMediaEls } from "../state/mediaContext";
import { parseGallery, type GalleryItem, type Span } from "../scenes/photos";
import { FocusEditor } from "./PhotosSection";
import { PhotoPicker } from "./PhotoPicker";
import { Icon } from "./icons";

const SPANS: { value: Span; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "1x1", label: "Small" },
  { value: "2x1", label: "Wide" },
  { value: "1x2", label: "Tall" },
  { value: "2x2", label: "Large" },
];

/** A tiny 2×2 diagram of a tile size. */
function SpanGlyph({ span }: { span: Span }) {
  if (span === "auto") return <Icon.Sparkle size={14} />;
  const [w, h] = span.split("x").map(Number);
  return (
    <span className="span-glyph" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <i key={i} className={i % 2 < w && Math.floor(i / 2) < h ? "on" : ""} />
      ))}
    </span>
  );
}

/**
 * The photos in one scene. Empty means the scene shows brand graphics; add
 * photos and it switches to them. Drag to reorder, click one to set its
 * focal point and (in the bento grid) its tile size.
 */
export function GalleryControl({
  label,
  value,
  spans,
  max,
  store,
  sceneUid,
  paramKey,
  sceneName,
  onChange,
}: {
  label: string;
  value: string;
  spans?: boolean;
  max?: number;
  store: Store;
  sceneUid: string;
  paramKey: string;
  sceneName: string;
  onChange: (v: string) => void;
}) {
  const els = useMediaEls();
  const media = store.project.media;
  const list = parseGallery(value).filter((g) => media.some((m) => m.id === g.id));
  const [picker, setPicker] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const single = max === 1;
  const save = (next: GalleryItem[]) => onChange(JSON.stringify(next));
  const sel = list.find((g) => g.id === selected);
  const selItem = sel && media.find((m) => m.id === sel.id);

  const pickerEl = picker && (
    <PhotoPicker project={store.project} target={{ sceneUid, key: paramKey, max }} title={single ? `Background photo for ${sceneName}` : `Add photos to ${sceneName}`} onClose={() => setPicker(false)} />
  );

  if (!list.length) {
    return (
      <div className="field">
        <span className="field-label">{label}</span>
        <div className="gallery-empty">
          <span className="ge-icon">
            <Icon.Image size={20} />
          </span>
          <div>
            <strong>{single ? "No photo, brand colour only" : "Showing brand graphics"}</strong>
            <p>{single ? "Add a photo to put it behind the logo. Set how strong it shows with the opacity slider." : "Add photos and this scene switches to them. Remove them all to go back to graphics."}</p>
          </div>
          <button type="button" className="primary-btn compact" onClick={() => setPicker(true)}>
            <Icon.Plus size={15} /> {single ? "Choose photo" : "Add photos"}
          </button>
        </div>
        {pickerEl}
      </div>
    );
  }

  const move = (from: number, to: number) => {
    if (from === to) return;
    const next = [...list];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    save(next);
  };

  return (
    <div className="field">
      <span className="field-label gallery-label">
        {label}
        <span className="badge">{single ? "PHOTO" : `${list.length} PHOTO${list.length === 1 ? "" : "S"}`}</span>
      </span>
      <ul className={"gallery-grid" + (single ? " single" : "")}>
        {list.map((g, i) => {
          const el = els.get(g.id);
          const m = media.find((x) => x.id === g.id)!;
          return (
            <li
              key={g.id}
              className={(selected === g.id ? "selected " : "") + (drag === i ? "dragging" : "")}
              draggable={!single}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", g.id);
                setDrag(i);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (drag !== null) move(drag, i);
                setDrag(null);
              }}
              onDragEnd={() => setDrag(null)}
            >
              <button type="button" className="gallery-tile" onClick={() => setSelected(selected === g.id ? null : g.id)} aria-pressed={selected === g.id} title={single ? "Set focal point" : "Drag to reorder · click to edit"}>
                {el && !(el instanceof HTMLVideoElement) && <img src={el.src} alt={m.label} style={{ objectPosition: `${m.focusX * 100}% ${m.focusY * 100}%` }} draggable={false} />}
                {!single && <span className="gt-num">{i + 1}</span>}
                {spans && (
                  <span className="gt-span" title={`Tile size: ${SPANS.find((s) => s.value === g.span)?.label}`}>
                    <SpanGlyph span={g.span} />
                  </span>
                )}
              </button>
              <button type="button" className="gt-remove" aria-label={`Remove ${m.label} from this scene`} onClick={() => save(list.filter((x) => x.id !== g.id))}>
                <Icon.Close size={11} />
              </button>
            </li>
          );
        })}
        <li>
          <button type="button" className="gallery-tile add" onClick={() => setPicker(true)}>
            {single ? <Icon.Image size={18} /> : <Icon.Plus size={18} />}
            <span>{single ? "Replace" : "Add"}</span>
          </button>
        </li>
      </ul>

      {sel && selItem && (
        <div className="gallery-inspector">
          {spans && (
            <div className="span-picker" role="radiogroup" aria-label="Tile size">
              {SPANS.map((s) => (
                <button key={s.value} type="button" role="radio" aria-checked={sel.span === s.value} className={sel.span === s.value ? "active" : ""} onClick={() => save(list.map((x) => (x.id === sel.id ? { ...x, span: s.value } : x)))}>
                  <SpanGlyph span={s.value} />
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
          )}
          <FocusEditor item={selItem} store={store} />
        </div>
      )}

      <div className="gallery-actions">
        {!single && list.length > 1 && <span className="hint">Drag to reorder. Click a photo for {spans ? "its size and " : ""}focal point.</span>}
        <button type="button" className="link-btn" onClick={() => (save([]), setSelected(null))}>
          {single ? "Remove photo" : "Use brand graphics instead"}
        </button>
      </div>
      {pickerEl}
    </div>
  );
}

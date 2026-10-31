import type { Store } from "../state/store";
import { useMediaEls } from "../state/mediaContext";
import { parseGallery, type GalleryItem, type Span } from "../scenes/photos";
import { Help } from "./controls";
import { Icon } from "./icons";

const SPANS: { value: Span; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "1x1", label: "Small" },
  { value: "2x1", label: "Wide" },
  { value: "1x2", label: "Tall" },
  { value: "2x2", label: "Large" },
];

/**
 * Pick which photos a scene uses, in what order, and (for the bento grid) how
 * big each tile is. With nothing picked, the scene uses every photo.
 */
export function GalleryControl({ label, value, spans, store, onChange }: { label: string; value: string; spans?: boolean; store: Store; onChange: (v: string) => void }) {
  const els = useMediaEls();
  const photos = store.project.media.filter((m) => m.use === "photo");
  const picked = parseGallery(value).filter((g) => photos.some((p) => p.id === g.id));
  const auto = picked.length === 0;
  // In auto mode, show every photo as included so sizes can still be set.
  const list: GalleryItem[] = auto ? photos.map((p) => ({ id: p.id, span: "auto" })) : picked;
  const save = (next: GalleryItem[]) => onChange(next.length ? JSON.stringify(next) : "");
  const included = new Set(list.map((g) => g.id));

  if (!photos.length) {
    return (
      <div className="field">
        <span className="field-label">{label}</span>
        <Help>No photos yet. Add your own or pick free stock photos in the Media tab.</Help>
      </div>
    );
  }

  const move = (i: number, d: number) => {
    const next = [...list];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  };

  return (
    <div className="field">
      <span className="field-label">
        {label} {auto && <span className="badge">ALL PHOTOS</span>}
      </span>
      <ul className="gallery-list">
        {list.map((g, i) => {
          const el = els.get(g.id);
          const m = photos.find((p) => p.id === g.id)!;
          return (
            <li key={g.id}>
              <span className="gallery-thumb">{el && !(el instanceof HTMLVideoElement) ? <img src={el.src} alt="" style={{ objectPosition: `${m.focusX * 100}% ${m.focusY * 100}%` }} /> : null}</span>
              <span className="gallery-name">{m.label}</span>
              {spans && (
                <select value={g.span} aria-label="Tile size" onChange={(e) => save(list.map((x) => (x.id === g.id ? { ...x, span: e.target.value as Span } : x)))}>
                  {SPANS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              )}
              <button type="button" className="icon-btn sm" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                <Icon.Chevron size={14} style={{ transform: "rotate(180deg)" }} />
              </button>
              <button type="button" className="icon-btn sm" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === list.length - 1}>
                <Icon.Chevron size={14} />
              </button>
              <button type="button" className="icon-btn sm" aria-label="Leave out of this scene" onClick={() => save(list.filter((x) => x.id !== g.id))} disabled={list.length === 1}>
                <Icon.Close size={14} />
              </button>
            </li>
          );
        })}
      </ul>
      {photos.some((p) => !included.has(p.id)) && (
        <div className="gallery-add">
          {photos
            .filter((p) => !included.has(p.id))
            .map((p) => {
              const el = els.get(p.id);
              return (
                <button key={p.id} type="button" title={`Add ${p.label}`} onClick={() => save([...list, { id: p.id, span: "auto" }])}>
                  {el && !(el instanceof HTMLVideoElement) ? <img src={el.src} alt="" /> : null}
                  <Icon.Plus size={14} />
                </button>
              );
            })}
        </div>
      )}
      {!auto && (
        <button type="button" className="link-btn" onClick={() => onChange("")}>
          Use all photos again
        </button>
      )}
    </div>
  );
}

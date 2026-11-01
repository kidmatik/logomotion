import { useRef, useState } from "react";
import type { Store } from "../state/store";
import { useLibrary } from "../state/library";
import { useMediaEls } from "../state/mediaContext";
import { DEFAULT_QUAD, parseSurface, type SurfaceValue } from "../scenes/mockup";
import type { Quad } from "../mockup/geometry";
import { DropZone } from "./DropZone";
import { Slider } from "./controls";
import { Icon } from "./icons";

const CORNERS = ["Top left", "Top right", "Bottom right", "Bottom left"];

/** Drag the four corners of the logo area on the photo. */
function CornerEditor({ src, quad, onChange }: { src: string; quad: Quad; onChange: (q: Quad) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const move = (e: React.PointerEvent) => {
    if (drag === null || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    const next = quad.map((p) => [...p]) as Quad;
    next[drag] = [x, y];
    onChange(next);
  };
  const nudge = (i: number, dx: number, dy: number) => {
    const next = quad.map((p) => [...p]) as Quad;
    next[i] = [Math.min(1, Math.max(0, next[i][0] + dx)), Math.min(1, Math.max(0, next[i][1] + dy))];
    onChange(next);
  };
  const pts = quad.map(([x, y]) => `${x * 100},${y * 100}`).join(" ");
  return (
    <div className="corner-editor" ref={box} onPointerMove={move} onPointerUp={() => setDrag(null)} onPointerLeave={() => setDrag(null)}>
      <img src={src} alt="" draggable={false} />
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <polygon points={pts} />
      </svg>
      {quad.map(([x, y], i) => (
        <button
          key={i}
          type="button"
          className={"corner" + (drag === i ? " active" : "")}
          style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
          aria-label={`${CORNERS[i]} corner. Use the arrow keys to move it.`}
          onPointerDown={(e) => {
            e.preventDefault();
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            setDrag(i);
          }}
          onKeyDown={(e) => {
            const s = e.shiftKey ? 0.02 : 0.004;
            const d = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.key];
            if (d) {
              e.preventDefault();
              nudge(i, d[0], d[1]);
            }
          }}
        />
      ))}
    </div>
  );
}

/**
 * "Your photo" for the mockup scene: pick or upload a photo, then mark the
 * surface the logo goes on by dragging its four corners.
 */
export function SurfaceControl({ label, value, store, sceneUid, onChange }: { label: string; value: string; store: Store; sceneUid: string; onChange: (v: string) => void }) {
  const lib = useLibrary();
  const els = useMediaEls();
  const surface = parseSurface(value);
  const photos = store.project.media.filter((m) => m.kind === "image");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (s: SurfaceValue) => onChange(JSON.stringify(s));

  const onFiles = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) return setError(`${f.name} isn't an image.`);
    setError(null);
    setBusy(true);
    try {
      const item = await lib.ingest(f, { kind: "image", use: "photo", label: f.name.replace(/\.[^.]+$/, ""), origin: "upload", focusX: 0.5, focusY: 0.5 });
      store.update((d) => {
        d.media.push(item);
        const s = d.scenes.find((x) => x.uid === sceneUid);
        if (s) s.params.surface = JSON.stringify({ id: item.id, quad: DEFAULT_QUAD, bend: 0 });
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const el = surface && els.get(surface.id);
  return (
    <div className="field surface-control">
      <span className="field-label">{label}</span>
      {surface && el && !(el instanceof HTMLVideoElement) ? (
        <>
          <p className="hint">Drag the four corners onto the surface where the logo goes.</p>
          <CornerEditor src={el.src} quad={surface.quad} onChange={(quad) => set({ ...surface, quad })} />
          <Slider label="Curved surface" value={Math.round((surface.bend * 180) / Math.PI)} min={0} max={85} step={1} unit="°" onChange={(v) => set({ ...surface, bend: (v * Math.PI) / 180 })} />
          <button type="button" className="ghost-btn" onClick={() => set({ ...surface, quad: DEFAULT_QUAD })}>
            Reset corners
          </button>
        </>
      ) : (
        <p className="screen-empty">Upload a photo of a blank product or wall, then mark where the logo goes.</p>
      )}

      {photos.length > 0 && (
        <div className="screen-pick" role="radiogroup" aria-label="Choose a photo">
          {photos.map((m) => {
            const e = els.get(m.id);
            return (
              <button key={m.id} type="button" role="radio" aria-checked={surface?.id === m.id} className={surface?.id === m.id ? "active" : ""} onClick={() => set({ id: m.id, quad: surface?.id === m.id ? surface.quad : DEFAULT_QUAD, bend: surface?.bend ?? 0 })} title={m.label}>
                {e && !(e instanceof HTMLVideoElement) ? <img src={e.src} alt="" /> : null}
              </button>
            );
          })}
        </div>
      )}

      <DropZone accept="image/*" onFiles={onFiles} className="screen-drop">
        <Icon.Upload size={18} />
        <span>
          <strong>{busy ? "Adding…" : "Upload a photo"}</strong>
          <small>Only photos you own or have the rights to use</small>
        </span>
      </DropZone>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

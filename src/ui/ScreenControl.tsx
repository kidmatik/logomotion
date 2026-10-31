import { useState } from "react";
import type { Store } from "../state/store";
import { capturePage } from "../brand/media";
import { useLibrary } from "../state/library";
import { useMediaEls } from "../state/mediaContext";
import { DropZone } from "./DropZone";
import { Icon } from "./icons";

function prettyUrl(u: string) {
  try {
    const x = new URL(u);
    return (x.hostname.replace(/^www\./, "") + x.pathname).replace(/\/$/, "");
  } catch {
    return u;
  }
}

/**
 * The screen a "Your screens" scene shows, picked, uploaded or captured right
 * here in the scene's settings.
 */
export function ScreenControl({ label, value, store, sceneUid, paramKey, onChange }: { label: string; value: string; store: Store; sceneUid: string; paramKey: string; onChange: (v: string) => void }) {
  const lib = useLibrary();
  const els = useMediaEls();
  const screens = store.project.media.filter((m) => m.use !== "photo");
  const current = screens.find((m) => m.id === value) ?? (value ? undefined : screens[0]);
  const [url, setUrl] = useState("");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const target = { sceneUid, key: paramKey };

  const onFiles = async (files: File[]) => {
    setError(null);
    const f = files[0];
    if (!f) return;
    const kind = f.type.startsWith("video/") ? "video" : f.type.startsWith("image/") ? "image" : null;
    if (!kind) return setError(`${f.name} isn't an image or video.`);
    setBusy("Adding…");
    try {
      const item = await lib.ingest(f, { kind, use: "screen", label: f.name.replace(/\.[^.]+$/, ""), origin: "upload", focusX: 0.5, focusY: 0 });
      lib.commit([item], target);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const capture = async () => {
    let t = url.trim();
    if (!t) return;
    if (!/^https?:\/\//i.test(t)) t = "https://" + t;
    setBusy("Capturing… this takes a few seconds");
    setError(null);
    try {
      const blob = await capturePage(t, device);
      const item = await lib.ingest(blob, { kind: "image", use: "screen", label: `${prettyUrl(t)} (${device})`, origin: "capture", sourceUrl: t, device, focusX: 0.5, focusY: 0 });
      lib.commit([item], target);
      setUrl("");
    } catch (e) {
      setError((e as Error).message || "Capture failed.");
    } finally {
      setBusy(null);
    }
  };

  const el = current && els.get(current.id);
  return (
    <div className="field screen-control">
      <span className="field-label">{label}</span>
      {current ? (
        <div className="screen-current">
          <span className="screen-thumb">{el ? el instanceof HTMLVideoElement ? <video src={el.src} muted /> : <img src={el.src} alt="" /> : null}</span>
          <span className="screen-meta">
            <strong>{current.label}</strong>
            <small>
              {current.kind === "video" ? "Video" : "Image"} · {current.width}×{current.height}
            </small>
          </span>
        </div>
      ) : (
        <p className="screen-empty">No screen yet. Upload one or capture a link below.</p>
      )}

      {screens.length > 1 && (
        <div className="screen-pick" role="radiogroup" aria-label="Choose a screen">
          {screens.map((m) => {
            const e = els.get(m.id);
            return (
              <button key={m.id} type="button" role="radio" aria-checked={current?.id === m.id} className={current?.id === m.id ? "active" : ""} onClick={() => onChange(m.id)} title={m.label}>
                {e ? e instanceof HTMLVideoElement ? <video src={e.src} muted /> : <img src={e.src} alt="" /> : null}
              </button>
            );
          })}
        </div>
      )}

      <DropZone accept="image/*,video/mp4,video/webm,video/quicktime" onFiles={onFiles} className="screen-drop">
        <Icon.Upload size={18} />
        <span>
          <strong>Upload a screenshot or demo video</strong>
          <small>Drop, click or paste · PNG, JPG, MP4, WebM, MOV</small>
        </span>
      </DropZone>

      <div className="screen-capture">
        <div className="capture-row">
          <span className="capture-icon">
            <Icon.Link size={16} />
          </span>
          <input className="text" value={url} placeholder="Or capture a link: yourbrand.com" onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && capture()} aria-label="Link to capture" />
        </div>
        <div className="capture-actions">
          <div className="segmented mini" role="radiogroup" aria-label="Device">
            {(["desktop", "mobile"] as const).map((d) => (
              <button key={d} type="button" role="radio" aria-checked={device === d} className={device === d ? "active" : ""} onClick={() => setDevice(d)}>
                {d === "desktop" ? "Desktop" : "Mobile"}
              </button>
            ))}
          </div>
          <button type="button" className="primary-btn compact" disabled={!!busy || !url.trim()} onClick={capture}>
            <Icon.Camera size={15} /> Capture
          </button>
        </div>
      </div>
      {busy && <p className="hint-busy">{busy}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

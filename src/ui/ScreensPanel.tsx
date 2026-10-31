import { useState } from "react";
import type { Store } from "../state/store";
import type { MediaItem } from "../types";
import type { MediaEl } from "../engine/kit";
import { blobToElement, capturePage, deleteBlob, elementSize, newId, putBlob } from "../brand/media";
import { createScene } from "../scenes/registry";
import { Help, Section, Select } from "./controls";
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

export function ScreensPanel({ store, media, onAdded }: { store: Store; media: Map<string, MediaEl>; onAdded: (id: string, el: MediaEl) => void }) {
  const { project, update } = store;
  const [url, setUrl] = useState("");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (blob: Blob, meta: Omit<MediaItem, "id" | "width" | "height">) => {
    const id = newId();
    const el = await blobToElement(blob, meta.kind);
    await putBlob(id, blob);
    onAdded(id, el);
    const { width, height } = elementSize(el);
    const item: MediaItem = { id, width, height, ...meta };
    update((d) => {
      d.media.push(item);
      // Make sure there's a scene to show it: reuse an unused screens scene, else add one.
      const used = new Set(d.scenes.filter((s) => s.type === "screens").map((s) => s.params.media));
      const idle = d.scenes.find((s) => s.type === "screens" && (!s.params.media || !d.media.some((m) => m.id === s.params.media)) && !used.has(id));
      if (idle && !idle.enabled) {
        idle.enabled = true;
        idle.params.media = id;
      } else if (!idle) {
        const s = createScene("screens", "slide");
        s.params.media = id;
        const at = d.scenes.findIndex((x) => x.type === "browser");
        d.scenes.splice(at >= 0 ? at + 1 : d.scenes.length, 0, s);
      } else {
        idle.params.media = id;
      }
    });
  };

  const onFiles = async (files: File[]) => {
    setError(null);
    for (const f of files) {
      const kind = f.type.startsWith("video/") ? "video" : f.type.startsWith("image/") ? "image" : null;
      if (!kind) {
        setError(`${f.name} isn't an image or video.`);
        continue;
      }
      try {
        await add(f, { kind, label: f.name.replace(/\.[^.]+$/, ""), origin: "upload" });
      } catch (e) {
        setError((e as Error).message);
      }
    }
  };

  const capture = async () => {
    let target = url.trim();
    if (!target) return;
    if (!/^https?:\/\//i.test(target)) target = "https://" + target;
    setBusy(true);
    setError(null);
    try {
      const blob = await capturePage(target, device);
      await add(blob, { kind: "image", label: `${prettyUrl(target)} (${device})`, origin: "capture", sourceUrl: target, device });
      setUrl("");
    } catch (e) {
      setError((e as Error).message || "Capture failed.");
    } finally {
      setBusy(false);
    }
  };

  const remove = (id: string) => {
    deleteBlob(id);
    update((d) => {
      d.media = d.media.filter((m) => m.id !== id);
      d.scenes.forEach((s) => {
        if (s.type === "screens" && s.params.media === id) s.params.media = "";
      });
    });
  };

  return (
    <div className="panel-scroll">
      <Section title="Capture a link">
        <Help>Paste your website, a product page, a social profile or a demo link. We take a screenshot and add it to the video in a “Your screens” scene.</Help>
        <div className="capture-row">
          <span className="capture-icon">
            <Icon.Link size={16} />
          </span>
          <input className="text" value={url} placeholder="yourbrand.com" onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && capture()} aria-label="Link to capture" />
        </div>
        <div className="capture-actions">
          <Select
            value={device}
            options={[
              { value: "desktop", label: "Desktop" },
              { value: "mobile", label: "Mobile" },
            ]}
            onChange={setDevice}
          />
          <button type="button" className="primary-btn" disabled={busy || !url.trim()} onClick={capture}>
            <Icon.Camera size={16} /> {busy ? "Capturing…" : "Capture"}
          </button>
        </div>
        <Help>Sites that need a login (Instagram, LinkedIn and most apps) usually block automatic screenshots. For those, take the screenshot yourself and drop it below.</Help>
      </Section>

      <Section title="Upload screens">
        <DropZone accept="image/*,video/mp4,video/webm,video/quicktime" multiple onFiles={onFiles} className="media-drop">
          <Icon.Image size={22} />
          <span>
            <strong>Drop screenshots or demo videos</strong>
            <small>PNG, JPG, WebP, MP4, WebM or MOV</small>
          </span>
        </DropZone>
        {error && <p className="error">{error}</p>}
      </Section>

      <Section title={`Your screens (${project.media.length})`}>
        {project.media.length === 0 ? (
          <Help>Nothing here yet. Captured and uploaded screens appear here, and each one gets its own scene.</Help>
        ) : (
          <ul className="media-list">
            {project.media.map((m) => {
              const el = media.get(m.id);
              return (
                <li key={m.id}>
                  <span className="media-thumb">{el ? el instanceof HTMLVideoElement ? <video src={el.src} muted /> : <img src={el.src} alt="" /> : null}</span>
                  <span className="media-meta">
                    <input
                      value={m.label}
                      aria-label="Screen name"
                      onChange={(e) =>
                        update((d) => {
                          const x = d.media.find((y) => y.id === m.id);
                          if (x) x.label = e.target.value;
                        }, "label:" + m.id)
                      }
                    />
                    <small>
                      {m.kind === "video" ? "Video" : "Image"} · {m.width}×{m.height}
                      {m.origin === "capture" ? " · captured" : ""}
                    </small>
                  </span>
                  <button type="button" className="icon-btn" aria-label={`Remove ${m.label}`} onClick={() => remove(m.id)}>
                    <Icon.Trash size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}

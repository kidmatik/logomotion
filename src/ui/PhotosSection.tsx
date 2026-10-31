import { useEffect, useState } from "react";
import type { Store } from "../state/store";
import type { MediaItem } from "../types";
import { useMediaEls } from "../state/mediaContext";
import { PROVIDERS, creditLine, defaultProvider, downloadStock, searchStock, suggestions, type Provider, type StockPhoto } from "../brand/stock";
import { Help, Section, Select } from "./controls";
import { DropZone } from "./DropZone";
import { Icon } from "./icons";

type AddFn = (blob: Blob, meta: Omit<MediaItem, "id" | "width" | "height">) => Promise<void>;

/** Click on the photo to choose the point that must stay in frame when it's cropped. */
function FocusEditor({ item, store }: { item: MediaItem; store: Store }) {
  const el = useMediaEls().get(item.id);
  if (!el || el instanceof HTMLVideoElement) return null;
  return (
    <div className="focus-editor">
      <div
        className="focus-img"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const fx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
          const fy = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
          store.update((d) => {
            const m = d.media.find((x) => x.id === item.id);
            if (m) {
              m.focusX = Math.round(fx * 100) / 100;
              m.focusY = Math.round(fy * 100) / 100;
            }
          });
        }}
      >
        <img src={el.src} alt="" />
        <span className="focus-dot" style={{ left: `${item.focusX * 100}%`, top: `${item.focusY * 100}%` }} />
      </div>
      <Help>Click the part of the photo that must always stay visible. Every layout and format crops around this point.</Help>
      {item.credit && (
        <p className="credit">
          <a href={item.credit.sourceUrl} target="_blank" rel="noreferrer">
            {creditLine(item.credit)}
          </a>
        </p>
      )}
    </div>
  );
}

export function PhotosSection({ store, add, onRemove }: { store: Store; add: AddFn; onRemove: (id: string) => void }) {
  const { project } = store;
  const els = useMediaEls();
  const photos = project.media.filter((m) => m.use === "photo");
  const [provider, setProvider] = useState<Provider>(defaultProvider());
  const [q, setQ] = useState("");
  const [orientation, setOrientation] = useState<"any" | "landscape" | "portrait" | "squarish">("any");
  const [results, setResults] = useState<StockPhoto[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const ideas = suggestions(project.brand.tagline);
  const addedKeys = new Set(photos.map((p) => p.credit && `${p.credit.provider}:${p.credit.sourceUrl}`));

  const search = async (query = q, nextPage = 1) => {
    if (!query.trim()) return;
    setQ(query);
    setLoading(true);
    setError(null);
    try {
      const found = await searchStock(provider, query.trim(), nextPage, orientation);
      setResults(nextPage === 1 ? found : [...results, ...found]);
      setPage(nextPage);
      if (!found.length && nextPage === 1) setError("No photos found. Try a broader word.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Re-run the search when the source or shape changes.
  useEffect(() => {
    if (q) search(q, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, orientation]);

  const pick = async (photo: StockPhoto) => {
    setAdding(photo.id);
    setError(null);
    try {
      const blob = await downloadStock(photo);
      await add(blob, {
        kind: "image",
        use: "photo",
        label: photo.alt.length > 40 ? photo.alt.slice(0, 38) + "…" : photo.alt,
        origin: "stock",
        credit: photo.credit,
        focusX: 0.5,
        focusY: 0.5,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(null);
    }
  };

  const onFiles = async (files: File[]) => {
    setError(null);
    for (const f of files) {
      if (!f.type.startsWith("image/")) {
        setError(`${f.name} isn't an image.`);
        continue;
      }
      await add(f, { kind: "image", use: "photo", label: f.name.replace(/\.[^.]+$/, ""), origin: "upload", focusX: 0.5, focusY: 0.5 }).catch((e) => setError((e as Error).message));
    }
  };

  const credits = [...new Set(photos.filter((p) => p.credit).map((p) => creditLine(p.credit!)))];

  return (
    <>
      <Section title="Free stock photos">
        <div className="provider-row">
          <Select value={provider} options={PROVIDERS.filter((p) => p.enabled).map((p) => ({ value: p.id, label: p.name }))} onChange={setProvider} />
          <Select
            value={orientation}
            options={[
              { value: "any", label: "Any shape" },
              { value: "landscape", label: "Landscape" },
              { value: "portrait", label: "Portrait" },
              { value: "squarish", label: "Square" },
            ]}
            onChange={setOrientation}
          />
        </div>
        <div className="capture-row">
          <span className="capture-icon">
            <Icon.Image size={16} />
          </span>
          <input className="text" value={q} placeholder="Search photos, e.g. workspace" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} aria-label="Search stock photos" />
          <button type="button" className="primary-btn compact" onClick={() => search()} disabled={loading || !q.trim()}>
            {loading ? "…" : "Search"}
          </button>
        </div>
        <div className="chips">
          {ideas.map((s) => (
            <button key={s} type="button" className="chip" onClick={() => search(s)}>
              {s}
            </button>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
        {results.length > 0 && (
          <>
            <div className="stock-grid">
              {results.map((r) => {
                const added = addedKeys.has(`${r.credit.provider}:${r.credit.sourceUrl}`);
                return (
                  <button key={r.provider + r.id} type="button" className={"stock-item" + (added ? " added" : "")} disabled={added || adding === r.id} onClick={() => pick(r)} title={`${r.alt}\n${creditLine(r.credit)}`}>
                    <img src={r.thumb} alt={r.alt} loading="lazy" />
                    <span className="stock-badge">{added ? "Added" : adding === r.id ? "Adding…" : <Icon.Plus size={14} />}</span>
                  </button>
                );
              })}
            </div>
            <button type="button" className="ghost-btn wide" onClick={() => search(q, page + 1)} disabled={loading}>
              {loading ? "Loading…" : "Show more"}
            </button>
          </>
        )}
        <Help>
          Photos come from {PROVIDERS.filter((p) => p.enabled).map((p) => p.name).join(", ")} under free licences. Picked photos are saved on this device and credited automatically.
        </Help>
      </Section>

      <Section title="Upload photos">
        <DropZone accept="image/*" multiple onFiles={onFiles} className="media-drop">
          <Icon.Upload size={22} />
          <span>
            <strong>Drop your own photos</strong>
            <small>PNG, JPG or WebP · they stay in your browser</small>
          </span>
        </DropZone>
      </Section>

      <Section title={`Photos (${photos.length})`}>
        {photos.length === 0 ? (
          <Help>Photos you add show up here. The slideshow and bento grid scenes use them.</Help>
        ) : (
          <ul className="photo-grid">
            {photos.map((m) => {
              const el = els.get(m.id);
              return (
                <li key={m.id} className={open === m.id ? "open" : ""}>
                  <button type="button" className="photo-thumb" onClick={() => setOpen(open === m.id ? null : m.id)} aria-expanded={open === m.id} title="Set focal point">
                    {el && !(el instanceof HTMLVideoElement) ? <img src={el.src} alt="" style={{ objectPosition: `${m.focusX * 100}% ${m.focusY * 100}%` }} /> : null}
                  </button>
                  <button type="button" className="photo-remove" aria-label={`Remove ${m.label}`} onClick={() => onRemove(m.id)}>
                    <Icon.Close size={12} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {open && photos.find((p) => p.id === open) && <FocusEditor item={photos.find((p) => p.id === open)!} store={store} />}
        {credits.length > 0 && (
          <button type="button" className="link-btn" onClick={() => navigator.clipboard.writeText(credits.join("\n"))}>
            Copy photo credits ({credits.length})
          </button>
        )}
      </Section>
    </>
  );
}

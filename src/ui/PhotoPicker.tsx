import { useEffect, useMemo, useRef, useState } from "react";
import type { MediaItem, Project } from "../types";
import { deleteBlob } from "../brand/media";
import { PROVIDERS, availableProviders, creditLine, downloadStock, searchStock, suggestions, type Orientation, type Provider, type StockPhoto } from "../brand/stock";
import { useLibrary, type GalleryTarget } from "../state/library";
import { useMediaEls } from "../state/mediaContext";
import { DropZone } from "./DropZone";
import { Icon } from "./icons";

type Source = Provider | "upload" | "library";

/** Something the person has ticked, from any source. */
type Pick =
  | { kind: "stock"; key: string; photo: StockPhoto }
  | { kind: "upload"; key: string; item: MediaItem; url: string }
  | { kind: "library"; key: string; id: string };

const SHAPES: { value: Orientation; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "landscape", label: "Wide" },
  { value: "portrait", label: "Tall" },
  { value: "squarish", label: "Square" },
];

/**
 * The "Add photos" window. Search free stock, upload your own or reuse photos
 * already in the project, tick as many as you like, and add them to a scene in one go.
 */
export function PhotoPicker({ project, target, title, onClose }: { project: Project; target: GalleryTarget; title: string; onClose: () => void }) {
  const lib = useLibrary();
  const els = useMediaEls();
  const single = target.max === 1;
  const library = project.media.filter((m) => m.use === "photo");
  const [providers, setProviders] = useState<Provider[]>(["openverse"]);
  const [source, setSource] = useState<Source>("openverse");
  const [q, setQ] = useState("");
  const [ran, setRan] = useState("");
  const [shape, setShape] = useState<Orientation>("any");
  const [results, setResults] = useState<StockPhoto[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [adding, setAdding] = useState<{ done: number; total: number } | null>(null);
  const ideas = useMemo(() => suggestions(project.brand.tagline), [project.brand.tagline]);
  const committed = useRef(false);
  const picksRef = useRef(picks);
  picksRef.current = picks;

  // Pick the best stock source available, then show something straight away.
  useEffect(() => {
    let live = true;
    availableProviders().then((list) => {
      if (!live) return;
      setProviders(list);
      setSource(list[0]);
      run(ideas[0] ?? "minimal workspace", 1, list[0]);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Uploads that were never added are thrown away when the window closes.
  useEffect(
    () => () => {
      if (committed.current) return;
      for (const p of picksRef.current) if (p.kind === "upload") deleteBlob(p.item.id);
    },
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !adding && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [adding, onClose]);

  const isStock = source !== "upload" && source !== "library";

  async function run(query: string, nextPage = 1, provider: Source = source, orientation = shape) {
    const words = query.trim();
    if (!words || provider === "upload" || provider === "library") return;
    setQ(words);
    setRan(words);
    setLoading(true);
    setError(null);
    try {
      const found = await searchStock(provider, words, nextPage, orientation);
      setResults((prev) => (nextPage === 1 ? found : [...prev, ...found]));
      setPage(nextPage);
      if (!found.length && nextPage === 1) setError("Nothing found. Try a broader word.");
    } catch (e) {
      if (nextPage === 1) setResults([]);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const toggle = (pick: Pick) =>
    setPicks((cur) => {
      if (cur.some((p) => p.key === pick.key)) return cur.filter((p) => p.key !== pick.key);
      if (single) {
        for (const p of cur) if (p.kind === "upload") deleteBlob(p.item.id);
        return [pick];
      }
      return [...cur, pick];
    });
  const order = (key: string) => picks.findIndex((p) => p.key === key);

  const onFiles = async (files: File[]) => {
    setError(null);
    for (const f of single ? files.slice(0, 1) : files) {
      if (!f.type.startsWith("image/")) {
        setError(`${f.name} isn't an image.`);
        continue;
      }
      try {
        const item = await lib.ingest(f, { kind: "image", use: "photo", label: f.name.replace(/\.[^.]+$/, ""), origin: "upload", focusX: 0.5, focusY: 0.5 });
        toggle({ kind: "upload", key: item.id, item, url: URL.createObjectURL(f) });
      } catch (e) {
        setError((e as Error).message);
      }
    }
  };

  const add = async () => {
    setError(null);
    const total = picks.length;
    setAdding({ done: 0, total });
    const fresh: MediaItem[] = [];
    const ordered: string[] = [];
    let failed = 0;
    for (const [i, p] of picks.entries()) {
      try {
        if (p.kind === "library") ordered.push(p.id);
        else if (p.kind === "upload") {
          fresh.push(p.item);
          ordered.push(p.item.id);
        } else {
          const blob = await downloadStock(p.photo);
          const item = await lib.ingest(blob, {
            kind: "image",
            use: "photo",
            label: p.photo.alt.length > 40 ? p.photo.alt.slice(0, 38) + "…" : p.photo.alt,
            origin: "stock",
            credit: p.photo.credit,
            focusX: 0.5,
            focusY: 0.5,
          });
          fresh.push(item);
          ordered.push(item.id);
        }
      } catch {
        failed++;
      }
      setAdding({ done: i + 1, total });
    }
    setAdding(null);
    if (!ordered.length) {
      setError("Those photos' hosts don't allow them to be used here. Try others.");
      return;
    }
    lib.commit(fresh, target, ordered);
    committed.current = true;
    if (failed) alert(`${failed} photo${failed === 1 ? "" : "s"} couldn't be downloaded and ${failed === 1 ? "was" : "were"} skipped.`);
    onClose();
  };

  const sources: { id: Source; name: string; blurb: string; icon: JSX.Element }[] = [
    ...PROVIDERS.map((p) => ({ id: p.id as Source, name: p.name, blurb: providers.includes(p.id) ? p.blurb : "Not set up yet", icon: <Icon.Search size={16} /> })),
    { id: "upload", name: "Upload", blurb: "Your own photos", icon: <Icon.Upload size={16} /> },
    { id: "library", name: "In this project", blurb: `${library.length} photo${library.length === 1 ? "" : "s"}`, icon: <Icon.Image size={16} /> },
  ];

  const missing = (source === "unsplash" || source === "pexels") && !providers.includes(source) ? source : null;
  const SETUP = {
    pexels: { name: "Pexels", env: "PEXELS_API_KEY", url: "https://www.pexels.com/api/", where: "pexels.com/api", key: "API key" },
    unsplash: { name: "Unsplash", env: "UNSPLASH_ACCESS_KEY", url: "https://unsplash.com/oauth/applications", where: "unsplash.com/oauth/applications", key: "Access Key" },
  };
  const setup = missing ? SETUP[missing] : null;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !adding && onClose()}>
      <div className="picker" role="dialog" aria-modal="true" aria-label={title}>
        <header className="picker-head">
          <div>
            <h2>{title}</h2>
            <p>{single ? "Pick one photo." : "Tick as many as you like. They play in the order you pick them."}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close" disabled={!!adding}>
            <Icon.Close />
          </button>
        </header>

        <div className="picker-body">
          <nav className="picker-sources" aria-label="Where to get photos">
            {sources.map((s) => (
              <button
                key={s.id}
                type="button"
                className={source === s.id ? "active" : ""}
                onClick={() => {
                  setSource(s.id);
                  setError(null);
                  if (s.id !== "upload" && s.id !== "library" && providers.includes(s.id as Provider)) run(ran || q || ideas[0], 1, s.id);
                }}
              >
                <span className="ps-icon">{s.icon}</span>
                <span className="ps-text">
                  <strong>{s.name}</strong>
                  <small>{s.blurb}</small>
                </span>
              </button>
            ))}
          </nav>

          <section className="picker-main">
            {isStock && !missing && (
              <>
                <div className="picker-toolbar">
                <form
                  className="picker-search"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(q);
                  }}
                >
                  <Icon.Search size={18} />
                  <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${PROVIDERS.find((p) => p.id === source)?.name}…`} aria-label="Search photos" />
                  <div className="segmented mini" role="radiogroup" aria-label="Photo shape">
                    {SHAPES.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        role="radio"
                        aria-checked={shape === s.value}
                        className={shape === s.value ? "active" : ""}
                        onClick={() => {
                          setShape(s.value);
                          run(ran || q, 1, source, s.value);
                        }}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </form>
                <div className="chips">
                  {ideas.map((s) => (
                    <button key={s} type="button" className={"chip" + (ran === s ? " on" : "")} onClick={() => run(s)}>
                      {s}
                    </button>
                  ))}
                </div>
                </div>
                {error && <p className="error">{error}</p>}
                <div className={"masonry" + (loading && page === 1 ? " loading" : "")}>
                  {results.map((r) => {
                    const key = `${r.provider}:${r.id}`;
                    const n = order(key);
                    return (
                      <button key={key} type="button" className={"tile" + (n >= 0 ? " picked" : "")} onClick={() => toggle({ kind: "stock", key, photo: r })} title={r.alt} style={{ aspectRatio: `${r.width} / ${r.height}` }}>
                        <img src={r.thumb} alt={r.alt} loading="lazy" />
                        <span className="tile-check">{n >= 0 ? (single ? <Icon.Check size={14} /> : n + 1) : <Icon.Plus size={14} />}</span>
                        <span className="tile-credit">{r.credit.author}</span>
                      </button>
                    );
                  })}
                  {loading && page === 1 && !results.length && Array.from({ length: 9 }, (_, i) => <span key={i} className="tile skeleton" style={{ aspectRatio: i % 3 ? "4 / 3" : "3 / 4" }} />)}
                </div>
                {results.length > 0 && (
                  <button type="button" className="ghost-btn wide" onClick={() => run(ran, page + 1)} disabled={loading}>
                    {loading ? "Loading…" : "Show more"}
                  </button>
                )}
                <p className="picker-note">
                  Free to use in your videos. Credits are saved with each photo, and you can show them in the scene.
                </p>
              </>
            )}

            {setup && (
              <div className="setup-card">
                <h3>Turn on {setup.name}</h3>
                <p>{setup.name} is free, but it needs a key on the server. It takes about two minutes:</p>
                <ol>
                  <li>
                    Get your {setup.key} at{" "}
                    <a href={setup.url} target="_blank" rel="noreferrer">
                      {setup.where}
                    </a>
                    .
                  </li>
                  <li>
                    In Vercel, open the project's <strong>Settings → Environment Variables</strong> and add <code>{setup.env}</code>.
                  </li>
                  <li>Redeploy. {setup.name} then works right here.</li>
                </ol>
                <button type="button" className="ghost-btn" onClick={() => (setSource("openverse"), run(ran || ideas[0], 1, "openverse"))}>
                  Search Openverse instead
                </button>
              </div>
            )}

            {source === "upload" && (
              <>
                <DropZone accept="image/*" multiple={!single} onFiles={onFiles} className="picker-drop">
                  <Icon.Upload size={28} />
                  <strong>Drop photos here or click to browse</strong>
                  <small>PNG, JPG or WebP. They stay on this device.</small>
                </DropZone>
                {error && <p className="error">{error}</p>}
                <div className="masonry">
                  {picks
                    .filter((p): p is Extract<Pick, { kind: "upload" }> => p.kind === "upload")
                    .map((p) => (
                      <button key={p.key} type="button" className="tile picked" onClick={() => toggle(p)} style={{ aspectRatio: `${p.item.width} / ${p.item.height}` }}>
                        <img src={p.url} alt="" />
                        <span className="tile-check">{single ? <Icon.Check size={14} /> : order(p.key) + 1}</span>
                      </button>
                    ))}
                </div>
              </>
            )}

            {source === "library" &&
              (library.length ? (
                <div className="masonry">
                  {library.map((m) => {
                    const el = els.get(m.id);
                    const n = order(m.id);
                    return (
                      <button key={m.id} type="button" className={"tile" + (n >= 0 ? " picked" : "")} onClick={() => toggle({ kind: "library", key: m.id, id: m.id })} style={{ aspectRatio: `${m.width} / ${m.height}` }} title={m.credit ? creditLine(m.credit) : m.label}>
                        {el && !(el instanceof HTMLVideoElement) && <img src={el.src} alt="" />}
                        <span className="tile-check">{n >= 0 ? (single ? <Icon.Check size={14} /> : n + 1) : <Icon.Plus size={14} />}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="picker-empty">No photos in this project yet. Search stock photos or upload your own.</p>
              ))}
          </section>
        </div>

        <footer className="picker-foot">
          <div className="tray">
            {picks.slice(0, 8).map((p) => (
              <span key={p.key} className="tray-thumb">
                <img src={p.kind === "stock" ? p.photo.thumb : p.kind === "upload" ? p.url : (els.get(p.id) as HTMLImageElement | undefined)?.src} alt="" />
              </span>
            ))}
            {picks.length > 8 && <span className="tray-more">+{picks.length - 8}</span>}
            <span className="tray-count">{picks.length ? `${picks.length} selected` : "Nothing selected yet"}</span>
          </div>
          <button type="button" className="ghost-btn" onClick={onClose} disabled={!!adding}>
            Cancel
          </button>
          <button type="button" className="primary-btn" onClick={add} disabled={!picks.length || !!adding}>
            {adding ? `Adding ${adding.done}/${adding.total}…` : single ? "Use this photo" : `Add ${picks.length || ""} photo${picks.length === 1 ? "" : "s"}`}
          </button>
        </footer>
      </div>
    </div>
  );
}

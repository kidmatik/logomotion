/**
 * Free stock photo search. Openverse needs no key and only returns openly
 * licensed images; Unsplash and Pexels switch on when their keys are set.
 * Picked photos are downloaded once and kept on the device like uploads, so
 * the preview and export never depend on a remote server.
 */
import type { MediaCredit } from "../types";

export type Provider = MediaCredit["provider"];

export interface StockPhoto {
  provider: Provider;
  id: string;
  /** Small preview for the results grid. */
  thumb: string;
  /** Large image to download when picked; fallbacks are tried in order. */
  full: string[];
  width: number;
  height: number;
  alt: string;
  credit: MediaCredit;
  /** Unsplash asks apps to ping this when a photo is used. */
  trackUrl?: string;
}

const UNSPLASH_KEY = import.meta.env.VITE_UNSPLASH_ACCESS_KEY as string | undefined;
const PEXELS_KEY = import.meta.env.VITE_PEXELS_API_KEY as string | undefined;

export const PROVIDERS: { id: Provider; name: string; enabled: boolean; site: string }[] = [
  { id: "unsplash", name: "Unsplash", enabled: !!UNSPLASH_KEY, site: "https://unsplash.com" },
  { id: "pexels", name: "Pexels", enabled: !!PEXELS_KEY, site: "https://www.pexels.com" },
  { id: "openverse", name: "Openverse", enabled: true, site: "https://openverse.org" },
];

export function defaultProvider(): Provider {
  return PROVIDERS.find((p) => p.enabled)!.id;
}

const UTM = "utm_source=logomotion&utm_medium=referral";

type Orientation = "landscape" | "portrait" | "squarish" | "any";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(res.status === 429 || res.status === 403 ? "The photo service is busy. Try again in a minute." : `Search failed (${res.status}).`);
  return res.json() as Promise<T>;
}

interface UnsplashPhoto {
  id: string;
  width: number;
  height: number;
  alt_description: string | null;
  urls: { raw: string; regular: string; small: string };
  links: { html: string; download_location: string };
  user: { name: string; links: { html: string } };
}

async function searchUnsplash(q: string, page: number, orientation: Orientation): Promise<StockPhoto[]> {
  const o = orientation === "any" ? "" : `&orientation=${orientation}`;
  const res = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&page=${page}&per_page=24&content_filter=high${o}`, {
    headers: { Authorization: `Client-ID ${UNSPLASH_KEY}`, "Accept-Version": "v1" },
  });
  const data = await json<{ results: UnsplashPhoto[] }>(res);
  return data.results.map((p) => ({
    provider: "unsplash",
    id: p.id,
    thumb: p.urls.small,
    full: [`${p.urls.raw}&w=2400&q=85&fm=jpg&fit=max`, p.urls.regular],
    width: p.width,
    height: p.height,
    alt: p.alt_description ?? "Unsplash photo",
    trackUrl: p.links.download_location,
    credit: {
      provider: "unsplash",
      author: p.user.name,
      authorUrl: `${p.user.links.html}?${UTM}`,
      sourceUrl: `${p.links.html}?${UTM}`,
      license: "Unsplash License",
      licenseUrl: "https://unsplash.com/license",
    },
  }));
}

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  alt: string;
  photographer: string;
  photographer_url: string;
  src: { original: string; large2x: string; large: string; medium: string };
}

async function searchPexels(q: string, page: number, orientation: Orientation): Promise<StockPhoto[]> {
  const o = orientation === "any" ? "" : `&orientation=${orientation === "squarish" ? "square" : orientation}`;
  const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&page=${page}&per_page=24${o}`, {
    headers: { Authorization: PEXELS_KEY! },
  });
  const data = await json<{ photos: PexelsPhoto[] }>(res);
  return data.photos.map((p) => ({
    provider: "pexels",
    id: String(p.id),
    thumb: p.src.medium,
    full: [`${p.src.original}?auto=compress&cs=tinysrgb&w=2400`, p.src.large2x],
    width: p.width,
    height: p.height,
    alt: p.alt || "Pexels photo",
    credit: {
      provider: "pexels",
      author: p.photographer,
      authorUrl: p.photographer_url,
      sourceUrl: p.url,
      license: "Pexels License",
      licenseUrl: "https://www.pexels.com/license/",
    },
  }));
}

interface OpenversePhoto {
  id: string;
  title: string | null;
  url: string;
  thumbnail: string;
  width: number | null;
  height: number | null;
  creator: string | null;
  creator_url: string | null;
  foreign_landing_url: string;
  license: string;
  license_version: string | null;
  license_url: string | null;
}

async function searchOpenverse(q: string, page: number, orientation: Orientation): Promise<StockPhoto[]> {
  // Only licences that allow commercial use and modification, since these end up in brand videos.
  const aspect = orientation === "landscape" ? "&aspect_ratio=wide" : orientation === "portrait" ? "&aspect_ratio=tall" : orientation === "squarish" ? "&aspect_ratio=square" : "";
  const res = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page=${page}&page_size=24&license_type=commercial,modification&mature=false${aspect}`);
  const data = await json<{ results: OpenversePhoto[] }>(res);
  return data.results.map((p) => {
    const license = p.license === "cc0" || p.license === "pdm" ? p.license.toUpperCase() : `CC ${p.license.toUpperCase()} ${p.license_version ?? ""}`.trim();
    return {
      provider: "openverse",
      id: p.id,
      thumb: p.thumbnail,
      // The original host may not allow canvas use; the Openverse thumbnail proxy always does.
      full: [p.url, `${p.thumbnail}?full_size=true`, p.thumbnail],
      width: p.width ?? 1600,
      height: p.height ?? 1000,
      alt: p.title ?? "Openverse photo",
      credit: {
        provider: "openverse",
        author: p.creator ?? "Unknown",
        authorUrl: p.creator_url ?? undefined,
        sourceUrl: p.foreign_landing_url,
        license,
        licenseUrl: p.license_url ?? undefined,
      },
    };
  });
}

export function searchStock(provider: Provider, q: string, page = 1, orientation: Orientation = "any"): Promise<StockPhoto[]> {
  if (provider === "unsplash" && UNSPLASH_KEY) return searchUnsplash(q, page, orientation);
  if (provider === "pexels" && PEXELS_KEY) return searchPexels(q, page, orientation);
  return searchOpenverse(q, page, orientation);
}

/** Download a picked photo as a blob. Throws if no source allows it. */
export async function downloadStock(photo: StockPhoto): Promise<Blob> {
  if (photo.provider === "unsplash" && photo.trackUrl && UNSPLASH_KEY) {
    fetch(photo.trackUrl, { headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` } }).catch(() => undefined);
  }
  for (const url of photo.full) {
    try {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) continue;
      const blob = await res.blob();
      if (blob.type.startsWith("image/") && blob.size > 1000) return blob;
    } catch {
      /* try the next source */
    }
  }
  throw new Error("This photo's host doesn't allow it to be used here. Try another one.");
}

/** One line of credit text, e.g. "Photo by Ana Silva on Unsplash". */
export function creditLine(c: MediaCredit): string {
  const where = c.provider === "openverse" ? `${c.license} via Openverse` : c.provider === "unsplash" ? "Unsplash" : "Pexels";
  return `Photo by ${c.author} on ${where}`;
}

/** Quick search ideas that suit brand videos, plus words taken from the brand itself. */
export function suggestions(tagline: string): string[] {
  const base = ["workspace", "architecture", "abstract texture", "team at work", "city at night", "minimal interior", "nature detail", "gradient light"];
  const words = tagline
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 3 && !["with", "your", "from", "that", "this", "intent", "design"].includes(w));
  return [...new Set([...words.slice(0, 3), ...base])].slice(0, 9);
}

/** Client side of "paste your website": ask /api/brand, then turn the answer into brand kit values. */
import type { BrandKit } from "../types";
import { GOOGLE_FONTS } from "./fonts";
import { bitmapToSvg, cleanSiteSvg, isMultiColor } from "./logoImport";

export interface SiteLogo {
  kind: "svg" | "image";
  svg?: string;
  dataUrl?: string;
  from: string;
  url?: string;
}

export interface SiteBrand {
  url: string;
  website: string;
  name: string;
  tagline: string;
  description: string;
  handle: string;
  rtl: boolean;
  lang: string;
  colors: { primary: string | null; secondary: string | null; black: string | null; white: string | null; palette: string[]; theme: string | null };
  fonts: { family: string; original: string; google: boolean; lookalike: boolean }[];
  logos: SiteLogo[];
}

/** A logo option ready for the brand kit. */
export interface LogoOption {
  id: string;
  svg: string;
  /** Keep the logo's own colours rather than tinting it. */
  original: boolean;
  label: string;
}

export async function readSite(url: string, signal?: AbortSignal): Promise<SiteBrand> {
  const res = await fetch(`/api/brand?url=${encodeURIComponent(url.trim())}`, { signal });
  let body: (SiteBrand & { error?: string }) | null = null;
  try {
    body = await res.json();
  } catch {
    /* not JSON */
  }
  if (!res.ok || !body) throw new Error(body?.error ?? `We couldn't read that website (${res.status}).`);
  return body;
}

/** Turn the site's logo candidates into SVGs the editor can use, best first. */
export async function logoOptions(site: SiteBrand): Promise<LogoOption[]> {
  const out: LogoOption[] = [];
  for (const [i, l] of site.logos.entries()) {
    if (l.kind === "svg" && l.svg) {
      const svg = cleanSiteSvg(l.svg);
      if (svg) out.push({ id: `site-${i}`, svg, original: isMultiColor(svg), label: l.from === "icon" ? "Site icon" : "From your site" });
    } else if (l.kind === "image" && l.dataUrl) {
      const r = await bitmapToSvg(l.dataUrl).catch(() => null);
      if (r) out.push({ id: `site-${i}`, svg: r.svg, original: true, label: l.from === "app icon" ? "App icon" : "From your site" });
    }
  }
  // Drop exact duplicates (sites often repeat the header logo in the footer).
  return out.filter((o, i) => out.findIndex((p) => p.svg === o.svg) === i);
}

/** The brand kit fields a site fills in. Missing values keep what's there now. */
export function brandFromSite(site: SiteBrand, current: BrandKit): Partial<BrandKit> {
  const c = site.colors;
  const font = site.fonts[0];
  const patch: Partial<BrandKit> = {
    name: site.name || current.name,
    nameLine2: "",
    tagline: site.tagline || current.tagline,
    website: site.website || current.website,
    handle: site.handle || site.website.split(".")[0] || current.handle,
    credit: site.name ? `by ${site.name}` : current.credit,
    colors: {
      primary: c.primary ?? current.colors.primary,
      secondary: c.secondary ?? current.colors.secondary,
      black: c.black ?? "#0E0F14",
      white: c.white ?? "#FFFFFF",
    },
    secondaryAuto: !c.secondary,
    direction: site.rtl ? "rtl" : "auto",
  };
  if (font) patch.font = { family: font.family, source: "google", weight: current.font.weight || 600 };
  return patch;
}

/** Font families to offer: the site's fonts first, then the usual list. */
export function fontChoices(site: SiteBrand | null) {
  const fromSite = site?.fonts.map((f) => f.family) ?? [];
  return [...new Set([...fromSite, ...GOOGLE_FONTS])];
}

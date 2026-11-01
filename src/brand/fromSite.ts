/** Client side of "paste your website": ask /api/brand, then turn the answer into brand kit values. */
import type { BrandGradient, BrandKit } from "../types";
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
  /** The site blocks automatic visitors: only its name (from the address) and icon are known. */
  blocked?: boolean;
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
  gradients?: { type: "linear" | "radial"; angle: number; stops: string[] }[];
}

/** A logo option ready for the brand kit. */
export interface LogoOption {
  id: string;
  svg: string;
  /** Keep the logo's own colours rather than tinting it. */
  original: boolean;
  /** A small bitmap (usually the site icon): it will look soft when large. */
  small?: boolean;
  /** The site's icon (favicon, touch icon) rather than the logo shown on the page. */
  icon?: boolean;
  label: string;
}

// Hebrew keyboard layout -> the English key in the same place.
const HE_KEYS: Record<string, string> = {
  "'": "w", "ק": "e", "ר": "r", "א": "t", "ט": "y", "ו": "u", "ן": "i", "ם": "o", "פ": "p",
  "ש": "a", "ד": "s", "ג": "d", "כ": "f", "ע": "g", "י": "h", "ח": "j", "ל": "k", "ך": "l", "ף": ";",
  "ז": "z", "ס": "x", "ב": "c", "ה": "v", "נ": "b", "מ": "n", "צ": "m", "ת": ",", "ץ": ".",
};

/**
 * A web address typed with the Hebrew keyboard on ("צשאשמץגקדןעמ" for "matan.design"):
 * swap each key back to its English letter. Works key by key, so it fixes the field as you type.
 * ("/" stays, since it's also a real address character; an apostrophe never is, so it becomes "w".)
 */
export function fixAddressLayout(input: string): string {
  if (!/[\u05D0-\u05EA']/.test(input)) return input;
  return [...input].map((c) => HE_KEYS[c] ?? c).join("");
}

export async function readSite(url: string, signal?: AbortSignal): Promise<SiteBrand> {
  const res = await fetch(`/api/brand?url=${encodeURIComponent(fixAddressLayout(url.trim()))}`, { signal });
  let body: (SiteBrand & { error?: string }) | null = null;
  try {
    body = await res.json();
  } catch {
    /* not JSON */
  }
  if (!res.ok || !body) throw new Error(body?.error ?? `We couldn't read that website (${res.status}).`);
  return body;
}

/** The main colours of a small image (a site icon), most used first. Greys, white and black are skipped. */
export async function imageColors(dataUrl: string, max = 3): Promise<string[]> {
  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => resolve(null);
    i.src = dataUrl;
  });
  if (!img || !img.naturalWidth) return [];
  const S = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, S, S);
  const px = ctx.getImageData(0, 0, S, S).data;
  // Group pixels into 30-degree hue buckets and average each bucket.
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < px.length; i += 4) {
    const [r, g, b, a] = [px[i], px[i + 1], px[i + 2], px[i + 3]];
    if (a < 200) continue;
    const hi = Math.max(r, g, b);
    const lo = Math.min(r, g, b);
    if (hi - lo < 40 || hi < 40) continue;
    const d = hi - lo;
    const h = hi === r ? ((g - b) / d + 6) % 6 : hi === g ? (b - r) / d + 2 : (r - g) / d + 4;
    const key = Math.floor(h * 2) % 12;
    const bin = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bin.n++;
    bin.r += r;
    bin.g += g;
    bin.b += b;
    bins.set(key, bin);
  }
  const hex = (v: number) => Math.round(v).toString(16).padStart(2, "0");
  return [...bins.values()]
    .filter((b) => b.n >= 6)
    .sort((a, b) => b.n - a.n)
    .slice(0, max)
    .map((b) => `#${hex(b.r / b.n)}${hex(b.g / b.n)}${hex(b.b / b.n)}`.toUpperCase());
}

/** For a blocked site, take the colours from its icon. */
export async function fillColorsFromIcon(site: SiteBrand): Promise<SiteBrand> {
  const icon = site.logos.find((l) => l.kind === "image" && l.dataUrl);
  if (!site.blocked || site.colors.primary || !icon?.dataUrl) return site;
  const found = await imageColors(icon.dataUrl).catch(() => []);
  if (!found.length) return site;
  return { ...site, colors: { ...site.colors, primary: found[0], secondary: found[1] ?? null, palette: found } };
}

/** Above this many distinct colours an image is a picture, not a logo (see colourVariety). */
const LOGO_MAX_VARIETY = 60;

/**
 * The logo's own colours beat the colours counted in the site's CSS (which
 * include the website builder's defaults). For a bitmap logo, put its main
 * colour first and keep the site's best other colour as secondary.
 */
export async function preferLogoColors(site: SiteBrand, logo: LogoOption | undefined): Promise<SiteBrand> {
  const png = logo?.svg.match(/href="(data:image\/png;base64,[^"]+)"/)?.[1];
  if (!png) return site;
  const found = await imageColors(png).catch((): string[] => []);
  if (!found.length) return site;
  const c = site.colors;
  const others = [c.primary, c.secondary, ...c.palette].filter((h): h is string => !!h && !found.includes(h));
  return { ...site, colors: { ...c, primary: found[0], secondary: found[1] ?? others[0] ?? null, palette: [...found, ...others.filter((h, i) => others.indexOf(h) === i)].slice(0, 10) } };
}

/** Turn the site's logo candidates into SVGs the editor can use, best first. */
export async function logoOptions(site: SiteBrand): Promise<LogoOption[]> {
  const out: LogoOption[] = [];
  for (const [i, l] of site.logos.entries()) {
    if (l.kind === "svg" && l.svg) {
      const svg = cleanSiteSvg(l.svg);
      if (svg) out.push({ id: `site-${i}`, svg, original: isMultiColor(svg), icon: /icon/.test(l.from), label: l.from === "icon" ? "Site icon" : "From your site" });
    } else if (l.kind === "image" && l.dataUrl) {
      const r = await bitmapToSvg(l.dataUrl).catch(() => null);
      // A big picture with a busy background is a banner or a screenshot, not a logo.
      if (r && r.opaque && (Math.max(r.width, r.height) > 320 || !/icon/.test(l.from))) continue;
      // Too many colours for a logo: a screenshot, product shot or photo, even on a transparent background.
      if (r && r.variety > LOGO_MAX_VARIETY) continue;
      if (r) out.push({ id: `site-${i}`, svg: r.svg, original: true, small: r.small, icon: /icon/.test(l.from), label: l.from === "app icon" ? "App icon" : "From your site" });
    }
  }
  // The site's real logo (header, home link, structured data) before its icon, which is often
  // just the symbol or a tiny square; within each, vectors first since they stay sharp.
  const rank = (o: LogoOption) => (o.icon ? 2 : 0) + (/<image\b/.test(o.svg) ? 1 : 0);
  out.sort((a, b) => rank(a) - rank(b));
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
    gradients: siteGradients(site),
  };
  if (font) patch.font = { family: font.family, source: "google", weight: current.font.weight || 600 };
  return patch;
}

/** Font families to offer: the site's fonts first, then the usual list. */
export function fontChoices(site: SiteBrand | null) {
  const fromSite = site?.fonts.map((f) => f.family) ?? [];
  return [...new Set([...fromSite, ...GOOGLE_FONTS])];
}

/** The site's own gradients, ready for the brand kit. */
export function siteGradients(site: SiteBrand): BrandGradient[] {
  return (site.gradients ?? []).map((g, i) => ({ id: `site-${i + 1}`, name: `From ${site.website || "your site"}${i ? ` ${i + 1}` : ""}`, type: g.type, angle: g.angle, stops: g.stops }));
}

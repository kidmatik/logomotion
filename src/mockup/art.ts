/**
 * The logo artwork for a mockup surface: the logo laid out on a canvas with the
 * surface's real proportions, plus a packed "height map" of the logo shape at
 * three blur sizes (R small, G medium, B large). Every material (emboss, foil,
 * neon, embroidery...) is built from these, so it works with any logo.
 */
import { RenderCtx, type BrandAssets } from "../engine/kit";
import type { BrandKit } from "../types";

export type ArtContent = "mark" | "lockup" | "stacked" | "wordmark";

export interface ArtSpec {
  content: ArtContent;
  /** Colour to draw in, or null to keep the logo's own colours. */
  ink: string | null;
  /** Surface width / height. */
  aspect: number;
  /** Share of the surface the logo fills, 0..1. */
  fit: number;
  /** Vertical nudge, -1..1 of the free space. */
  offsetY: number;
}

export interface Art {
  key: string;
  color: HTMLCanvasElement;
  height: HTMLCanvasElement;
  width: number;
  heightPx: number;
}

const LONG = 1400;
const cache = new Map<string, Art>();

function artKey(brand: BrandKit, assets: BrandAssets, s: ArtSpec) {
  return [assets.logo?.id ?? 0, assets.lettermark?.id ?? 0, brand.useLettermark, brand.name, brand.font.family, brand.font.weight, brand.logoScale, brand.lettermarkScale, s.content, s.ink ?? "orig", s.aspect.toFixed(3), s.fit.toFixed(3), s.offsetY.toFixed(3), brand.colors.primary].join("|");
}

/** Draw the chosen content centred in a w×h box. */
function layout(rc: RenderCtx, s: ArtSpec, ink: string) {
  const { w, h } = rc;
  const boxW = w * s.fit, boxH = h * s.fit;
  const hasLogo = !!rc.assets.logo;
  const content: ArtContent = !hasLogo ? "wordmark" : s.content;
  const ratio = rc.assets.logo?.ratio ?? 1;
  // Work in a nominal size, then scale everything to fit the box.
  const N = 100;
  const word = rc.measureWordmark(N * 0.62);
  let bw = 0, bh = 0;
  if (content === "mark") (bw = N * ratio), (bh = N);
  else if (content === "wordmark") (bw = word.w), (bh = word.h);
  else if (content === "lockup") (bw = N * ratio + N * 0.3 + word.w), (bh = N);
  else (bw = Math.max(N * ratio, word.w)), (bh = N + N * 0.28 + word.h);
  const k = Math.min(boxW / bw, boxH / bh);
  const cx = w / 2;
  const cy = h / 2 + ((h - bh * k) / 2) * s.offsetY;
  const M = N * k, size = N * 0.62 * k;
  const wm = rc.measureWordmark(size);
  if (content === "mark") rc.drawLogo(cx, cy, M, ink, { knockout: s.ink !== null });
  else if (content === "wordmark") rc.drawWordmark(cx - wm.w / 2, cy, size, ink);
  else if (content === "lockup") {
    const total = M * ratio + M * 0.3 + wm.w;
    const x0 = cx - total / 2;
    // Right-to-left brands put the mark on the right.
    const markX = rc.rtl ? x0 + wm.w + M * 0.3 + (M * ratio) / 2 : x0 + (M * ratio) / 2;
    const wordX = rc.rtl ? x0 : x0 + M * ratio + M * 0.3;
    rc.drawLogo(markX, cy, M, ink, { knockout: s.ink !== null });
    rc.drawWordmark(wordX, cy, size, ink);
  } else {
    const top = cy - (M + M * 0.28 + wm.h) / 2;
    rc.drawLogo(cx, top + M / 2, M, ink, { knockout: s.ink !== null });
    rc.drawWordmark(cx - wm.w / 2, top + M + M * 0.28 + wm.h / 2, size, ink);
  }
  return Math.min(bw, bh) * k;
}

function blurred(src: HTMLCanvasElement, r: number) {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, c.width, c.height);
  g.filter = `blur(${Math.max(0.5, r)}px)`;
  g.drawImage(src, 0, 0);
  g.filter = "none";
  return g.getImageData(0, 0, c.width, c.height).data;
}

export function buildArt(brand: BrandKit, assets: BrandAssets, s: ArtSpec): Art {
  const key = artKey(brand, assets, s);
  const hit = cache.get(key);
  if (hit) return hit;

  const aspect = Math.max(0.15, Math.min(8, s.aspect || 1));
  const W = aspect >= 1 ? LONG : Math.round(LONG * aspect);
  const H = aspect >= 1 ? Math.round(LONG / aspect) : LONG;
  const color = document.createElement("canvas");
  color.width = W;
  color.height = H;
  const g = color.getContext("2d")!;
  const artBrand: BrandKit = s.ink === null ? { ...brand, logoColorMode: "original" } : brand;
  const rc = new RenderCtx(g, W, H, artBrand, assets);
  const ink = s.ink ?? rc.colors.primary;
  const logoSize = layout(rc, s, ink);

  // White silhouette of the artwork, blurred at three sizes and packed into RGB.
  const sil = document.createElement("canvas");
  sil.width = W;
  sil.height = H;
  const sg = sil.getContext("2d")!;
  sg.drawImage(color, 0, 0);
  sg.globalCompositeOperation = "source-in";
  sg.fillStyle = "#fff";
  sg.fillRect(0, 0, W, H);
  const base = Math.max(8, logoSize);
  const r1 = blurred(sil, base * 0.012), r2 = blurred(sil, base * 0.035), r3 = blurred(sil, base * 0.12);
  const height = document.createElement("canvas");
  height.width = W;
  height.height = H;
  const hg = height.getContext("2d")!;
  const out = hg.createImageData(W, H);
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = r1[i];
    out.data[i + 1] = r2[i];
    out.data[i + 2] = r3[i];
    out.data[i + 3] = 255;
  }
  hg.putImageData(out, 0, 0);

  const art: Art = { key, color, height, width: W, heightPx: H };
  cache.set(key, art);
  // Keep a handful: thumbnails and the live preview often want different looks at once.
  if (cache.size > 12) cache.delete(cache.keys().next().value!);
  return art;
}

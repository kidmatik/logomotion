/**
 * Brand colours from the logo alone, for when the logo is all there is.
 * Vector logos give their fills; bitmap logos their main hues.
 */
import type { BrandKit } from "../types";
import { autoSecondary, hexToRgb, luminance, normalizeHex, rgbToHex } from "../brand/color";
import { imageColors } from "../brand/fromSite";

function saturation(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const hi = Math.max(r, g, b), lo = Math.min(r, g, b);
  return hi === 0 ? 0 : (hi - lo) / hi;
}

/** Every colour painted in the SVG, most used first. */
export function svgPaints(svg: string): string[] {
  const count = new Map<string, number>();
  const add = (raw: string) => {
    let hex: string | null = null;
    const rgb = raw.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
    if (rgb) hex = rgbToHex({ r: +rgb[1], g: +rgb[2], b: +rgb[3] });
    else hex = normalizeHex(raw);
    if (hex) count.set(hex.toUpperCase(), (count.get(hex.toUpperCase()) ?? 0) + 1);
  };
  for (const m of svg.matchAll(/(?:fill|stroke|stop-color)\s*[:=]\s*["']?\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))/g)) add(m[1]);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h);
}

/** The logo's colours (vector paints, or the main hues of an embedded picture). */
export async function logoColors(svg: string): Promise<string[]> {
  const png = svg.match(/href="(data:image\/[a-z]+;base64,[^"]+)"/)?.[1];
  if (png) return imageColors(png, 4).catch(() => []);
  return svgPaints(svg);
}

/**
 * Colour roles from the logo: the most saturated colours become primary and
 * secondary, a near-black becomes the dark colour. A one-colour black logo
 * keeps the current colours, since there's nothing to learn from it.
 */
export async function colorsFromLogo(svg: string, current: BrandKit): Promise<Partial<BrandKit> | null> {
  const all = await logoColors(svg);
  if (!all.length) return null;
  const vivid = all.filter((h) => saturation(h) > 0.25 && luminance(h) > 0.02 && luminance(h) < 0.9);
  const darks = all.filter((h) => luminance(h) < 0.03);
  if (!vivid.length && !darks.length) return null;
  const primary = vivid[0] ?? current.colors.primary;
  const secondary = vivid[1] ?? null;
  return {
    colors: {
      primary,
      secondary: secondary ?? autoSecondary(primary),
      black: darks[0] ?? current.colors.black,
      white: current.colors.white,
    },
    secondaryAuto: !secondary,
  };
}

/** "acme-logo-final.svg" -> "Acme". */
export function nameFromFile(file: string) {
  const base = file.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").replace(/\b(logo|final|copy|vector|svg|png|rgb|cmyk|horizontal|vertical|primary|main|black|white|color|colour|v\d+)\b/gi, " ").replace(/\s+/g, " ").trim();
  if (!base || /^\d+$/.test(base)) return "";
  return base.replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

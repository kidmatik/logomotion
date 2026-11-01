/**
 * Turn whatever logo a website gives us into the SVG the editor works with.
 * Vector logos are kept as they are. Bitmaps (PNG, JPG, icons) are cleaned up,
 * a flat background is knocked out so the logo can be tinted, the empty margin
 * is trimmed, and the result is wrapped in an SVG.
 */
import { prepareSvg } from "./logo";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read that image."));
    img.src = src;
  });
}

/** Clean an inline SVG lifted from a web page so it draws on its own. */
export function cleanSiteSvg(svg: string): string | null {
  const check = prepareSvg(svg);
  if (!check.ok || !check.svg) return null;
  const doc = new DOMParser().parseFromString(check.svg, "image/svg+xml");
  const root = doc.documentElement;
  // Page CSS doesn't come along, so "currentColor" would draw black: keep it black (the editor tints it).
  root.querySelectorAll("[fill='currentColor'], [stroke='currentColor']").forEach((el) => {
    if (el.getAttribute("fill") === "currentColor") el.setAttribute("fill", "#111111");
    if (el.getAttribute("stroke") === "currentColor") el.setAttribute("stroke", "#111111");
  });
  if (root.getAttribute("fill") === "currentColor") root.setAttribute("fill", "#111111");
  root.removeAttribute("class");
  root.removeAttribute("style");
  root.removeAttribute("aria-hidden");
  return new XMLSerializer().serializeToString(root);
}

/** A bitmap logo as a tintable SVG. Returns null when the image is unusable. */
export async function bitmapToSvg(dataUrl: string): Promise<{ svg: string; opaque: boolean; width: number; height: number } | null> {
  const img = await loadImage(dataUrl).catch(() => null);
  if (!img || !img.naturalWidth) return null;
  const scale = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, w, h);
  const data = g.getImageData(0, 0, w, h);
  const px = data.data;
  const at = (x: number, y: number) => (y * w + x) * 4;
  const corners = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)];
  const opaqueCorners = corners.every((i) => px[i + 3] > 240);
  let opaque = false;
  if (opaqueCorners) {
    // Same colour in every corner: that's a background, so knock it out with a soft edge.
    const [r0, g0, b0] = [px[corners[0]], px[corners[0] + 1], px[corners[0] + 2]];
    const same = corners.every((i) => Math.abs(px[i] - r0) + Math.abs(px[i + 1] - g0) + Math.abs(px[i + 2] - b0) < 40);
    if (same) {
      for (let i = 0; i < px.length; i += 4) {
        const d = Math.abs(px[i] - r0) + Math.abs(px[i + 1] - g0) + Math.abs(px[i + 2] - b0);
        if (d < 30) px[i + 3] = 0;
        else if (d < 90) px[i + 3] = Math.round((px[i + 3] * (d - 30)) / 60);
      }
    } else opaque = true;
  }
  // Trim the empty margin.
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[at(x, y) + 3] > 16) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < x0 || y1 < y0) return null;
  g.putImageData(data, 0, 0);
  const tw = x1 - x0 + 1;
  const th = y1 - y0 + 1;
  const out = document.createElement("canvas");
  out.width = tw;
  out.height = th;
  out.getContext("2d")!.drawImage(c, x0, y0, tw, th, 0, 0, tw, th);
  const png = out.toDataURL("image/png");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${tw} ${th}" width="${tw}" height="${th}"><image width="${tw}" height="${th}" href="${png}" xlink:href="${png}"/></svg>`;
  return { svg, opaque, width: tw, height: th };
}

/** True when the SVG keeps its own colours (more than one fill), so "original colours" is the better default. */
export function isMultiColor(svg: string) {
  const fills = new Set((svg.match(/(?:fill|stop-color)\s*[:=]\s*["']?\s*(#[0-9a-fA-F]{3,6})/g) ?? []).map((s) => s.replace(/.*#/, "#").toLowerCase()));
  fills.delete("#111111");
  fills.delete("#000000");
  fills.delete("#000");
  return fills.size > 1 || /<image\b/.test(svg);
}

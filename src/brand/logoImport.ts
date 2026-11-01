/**
 * Turn whatever logo a website gives us into the SVG the editor works with.
 * Vector logos are kept as they are. Bitmaps (PNG, JPG, icons) are cleaned up,
 * a flat background is knocked out so the logo can be tinted, the empty margin
 * is trimmed, and the result is wrapped in an SVG.
 */
import { prepareSvg } from "./logo";
import ImageTracer from "imagetracerjs";

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
/** Bitmaps with up to this many colours (see colourVariety) are flat enough to trace into vectors. */
const MAX_TRACE_VARIETY = 40;

/**
 * Turn a flat-colour bitmap into real vector paths, so a logo we only found as
 * a PNG (often a small site icon) stays crisp at any size. Returns null when
 * tracing doesn't give a usable result.
 */
function traceToSvg(canvas: HTMLCanvasElement): string | null {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  // The logo's few flat colours: coarse colour buckets that each cover at least 2% of the logo.
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  let solid = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) continue;
    solid++;
    const key = ((px[i] >> 5) << 6) | ((px[i + 1] >> 5) << 3) | (px[i + 2] >> 5);
    const b = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    b.n++;
    b.r += px[i];
    b.g += px[i + 1];
    b.b += px[i + 2];
    bins.set(key, b);
  }
  if (!solid) return null;
  const avg = (b: { n: number; r: number; g: number; b: number }) => ({ r: Math.round(b.r / b.n), g: Math.round(b.g / b.n), b: Math.round(b.b / b.n), a: 255, n: b.n });
  type C = ReturnType<typeof avg>;
  const dist = (a: C, b: C) => Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
  // How far c is from the line between a and b: a small value means c is just the soft edge where a meets b.
  const offBlend = (c: C, a: C, b: C) => {
    const ab = [b.r - a.r, b.g - a.g, b.b - a.b];
    const ac = [c.r - a.r, c.g - a.g, c.b - a.b];
    const len = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1;
    const t = Math.max(0, Math.min(1, (ac[0] * ab[0] + ac[1] * ab[1] + ac[2] * ab[2]) / len));
    return Math.sqrt((ac[0] - t * ab[0]) ** 2 + (ac[1] - t * ab[1]) ** 2 + (ac[2] - t * ab[2]) ** 2);
  };
  // Big colours always count; small ones (an accent dot) only when they're clearly their own colour,
  // not a blend along the edge between two colours already kept.
  const pal: C[] = [];
  for (const b of [...bins.values()].sort((x, y) => y.n - x.n)) {
    if (pal.length >= 8 || b.n < solid * 0.003) break;
    const c = avg(b);
    if (pal.some((p) => dist(p, c) < 60)) continue;
    if (b.n < solid * 0.05 && pal.some((p, i) => pal.slice(i + 1).some((q) => offBlend(c, p, q) < 40))) continue;
    if (b.n < solid * 0.05 && pal.length && Math.min(...pal.map((p) => dist(p, c))) < 110) continue;
    pal.push(c);
  }
  // Most of the logo has to be close to those colours. If not, it's a gradient or a picture: tracing would band it.
  let near = 0;
  for (const b of bins.values()) if (pal.some((p) => dist(p, avg(b)) < 60)) near += b.n;
  if (!pal.length || near < solid * 0.85) return null;
  // Snap every pixel to its nearest logo colour, or to fully transparent, so edges don't become extra layers.
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) {
      px[i] = px[i + 1] = px[i + 2] = px[i + 3] = 0;
      continue;
    }
    let best = pal[0];
    let bd = Infinity;
    for (const c of pal) {
      const d = (c.r - px[i]) ** 2 + (c.g - px[i + 1]) ** 2 + (c.b - px[i + 2]) ** 2;
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    px[i] = best.r;
    px[i + 1] = best.g;
    px[i + 2] = best.b;
    px[i + 3] = 255;
  }
  let svg: string;
  try {
    svg = ImageTracer.imagedataToSVG(data, {
      pal: [{ r: 0, g: 0, b: 0, a: 0 }, ...pal],
      numberofcolors: pal.length + 1,
      colorquantcycles: 1,
      ltres: 0.5,
      qtres: 0.5,
      pathomit: 16,
      rightangleenhance: false,
      blurradius: 0,
      strokewidth: 0,
      linefilter: true,
      roundcoords: 1,
      viewbox: true,
      desc: false,
    });
  } catch {
    return null;
  }
  // Drop the transparent layer; keep each colour as a solid fill.
  const paths = (svg.match(/<path\b[^>]*\/>/g) ?? []).filter((p) => {
    const o = p.match(/opacity="([\d.]+)"/);
    return !o || parseFloat(o[1]) > 0.5;
  });
  if (!paths.length || paths.length > 600) return null;
  const clean = paths.map((p) => p.replace(/\s*(?:opacity|stroke|stroke-width)="[^"]*"/g, ""));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas.width} ${canvas.height}" width="${canvas.width}" height="${canvas.height}">${clean.join("")}</svg>`;
}

/**
 * How busy an image is: the number of distinct colours (in coarse steps) in
 * its visible pixels, sampled at about 200px. Logos and icons use a few dozen
 * at most; screenshots and photos use many more.
 */
function colourVariety(px: Uint8ClampedArray, w: number, h: number) {
  const step = Math.max(1, Math.floor(Math.max(w, h) / 200));
  const counts = new Map<number, number>();
  let seen = 0;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      if (px[i + 3] < 128) continue;
      seen++;
      const key = ((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const floor = 2;
  let n = 0;
  for (const c of counts.values()) if (c >= floor) n++;
  return n;
}

export async function bitmapToSvg(dataUrl: string): Promise<{ svg: string; opaque: boolean; width: number; height: number; variety: number; small: boolean; traced: boolean } | null> {
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
    // Only a light backdrop is knocked out. A dark square is the icon's own tile:
    // removing it would leave a white mark that vanishes on a light video.
    const light = 0.299 * r0 + 0.587 * g0 + 0.114 * b0 > 200;
    if (same && light) {
      for (let i = 0; i < px.length; i += 4) {
        const d = Math.abs(px[i] - r0) + Math.abs(px[i + 1] - g0) + Math.abs(px[i + 2] - b0);
        if (d < 30) px[i + 3] = 0;
        else if (d < 90) px[i + 3] = Math.round((px[i + 3] * (d - 30)) / 60);
      }
    } else if (!same) opaque = true;
  }
  const variety = colourVariety(px, w, h);
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
  let out = document.createElement("canvas");
  out.width = tw;
  out.height = th;
  out.getContext("2d")!.drawImage(c, x0, y0, tw, th, 0, 0, tw, th);
  // A tiny logo (a site icon) gets stretched across the video and turns blocky.
  // Enlarge it in smooth steps now, so it reads as soft rather than pixelated.
  const small = Math.max(tw, th) < 256;
  while (Math.max(out.width, out.height) < 512) {
    const up = document.createElement("canvas");
    up.width = out.width * 2;
    up.height = out.height * 2;
    const ug = up.getContext("2d")!;
    ug.imageSmoothingEnabled = true;
    ug.imageSmoothingQuality = "high";
    ug.drawImage(out, 0, 0, up.width, up.height);
    out = up;
  }
  // Flat-colour logos become real vectors; pictures stay pictures.
  // Below ~48px there are too few pixels to tell a flat logo from a gradient, so leave it as an image.
  if (variety <= MAX_TRACE_VARIETY && Math.max(tw, th) >= 48) {
    const traced = traceToSvg(out);
    if (traced) return { svg: traced, opaque, width: tw, height: th, variety, small: false, traced: true };
  }
  const png = out.toDataURL("image/png");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${tw} ${th}" width="${tw}" height="${th}"><image width="${tw}" height="${th}" href="${png}" xlink:href="${png}"/></svg>`;
  return { svg, opaque, width: tw, height: th, variety, small, traced: false };
}

/** True when the SVG keeps its own colours (more than one fill), so "original colours" is the better default. */
export function isMultiColor(svg: string) {
  const fills = new Set((svg.match(/(?:fill|stop-color)\s*[:=]\s*["']?\s*(#[0-9a-fA-F]{3,6})/g) ?? []).map((s) => s.replace(/.*#/, "#").toLowerCase()));
  fills.delete("#111111");
  fills.delete("#000000");
  fills.delete("#000");
  return fills.size > 1 || /<image\b/.test(svg);
}

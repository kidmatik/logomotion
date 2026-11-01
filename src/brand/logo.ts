/**
 * Logo handling: SVG markup is turned into an <img> (scripts never run inside an
 * image), then drawn tinted or in its own colours. Tinted rasters are cached
 * per colour and size so scenes can draw the logo every frame cheaply.
 */

export interface LogoAsset {
  id: number;
  img: HTMLImageElement;
  /** width / height */
  ratio: number;
}

export interface SvgCheck {
  ok: boolean;
  error?: string;
  svg?: string;
}

/** Validate SVG text and make sure it carries an explicit width and height. */
export function prepareSvg(text: string): SvgCheck {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const svg = doc.documentElement;
  if (svg.nodeName.toLowerCase() !== "svg" || doc.getElementsByTagName("parsererror").length) {
    return { ok: false, error: "That file isn't a valid SVG." };
  }
  // Drop anything executable; it would not run in an <img> anyway, but keep saved projects clean.
  svg.querySelectorAll("script, foreignObject").forEach((n) => n.remove());
  let vb = svg.getAttribute("viewBox")?.split(/[\s,]+/).map(Number);
  const w = parseFloat(svg.getAttribute("width") ?? "");
  const h = parseFloat(svg.getAttribute("height") ?? "");
  if (!vb || vb.length !== 4 || vb.some(isNaN)) {
    if (w > 0 && h > 0) {
      vb = [0, 0, w, h];
      svg.setAttribute("viewBox", vb.join(" "));
    } else {
      return { ok: false, error: "The SVG needs a viewBox or a width and height." };
    }
  }
  // Render at a generous intrinsic size so rasters stay sharp.
  const scale = 1024 / Math.max(vb[2], vb[3]);
  svg.setAttribute("width", String(vb[2] * scale));
  svg.setAttribute("height", String(vb[3] * scale));
  if (!svg.getAttribute("xmlns")) svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return { ok: true, svg: new XMLSerializer().serializeToString(svg) };
}

let assetCounter = 0;

export function loadSvg(svgText: string): Promise<LogoAsset> {
  const prepared = prepareSvg(svgText);
  if (!prepared.ok || !prepared.svg) return Promise.reject(new Error(prepared.error));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ id: ++assetCounter, img, ratio: img.naturalWidth / img.naturalHeight || 1 });
    img.onerror = () => reject(new Error("Couldn't draw that SVG."));
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(prepared.svg!);
  });
}

const tintCache = new Map<string, HTMLCanvasElement>();

/** Return a canvas holding the logo filled with one flat colour (or its own colours when tint is null). */
export function rasterLogo(asset: LogoAsset, height: number, tint: string | null): HTMLCanvasElement {
  // Bucket sizes so animations that scale the logo don't create a raster every frame.
  const bucket = Math.max(16, Math.ceil(height / 64) * 64);
  const key = `${asset.id}|${bucket}|${tint ?? "orig"}`;
  if (tintCache.size > 300) tintCache.clear();
  const hit = tintCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.height = bucket;
  c.width = Math.max(1, Math.round(bucket * asset.ratio));
  const g = c.getContext("2d")!;
  g.drawImage(asset.img, 0, 0, c.width, c.height);
  if (tint) {
    g.globalCompositeOperation = "source-in";
    g.fillStyle = tint;
    g.fillRect(0, 0, c.width, c.height);
  }
  tintCache.set(key, c);
  return c;
}

export function readFileText(file: File): Promise<string> {
  return file.text();
}

const SHAPES = "path, rect, circle, ellipse, polygon, polyline, line";

/** Make a line-art version of a logo: every shape drawn as a thin outline with no fill. */
export function outlineSvg(svgText: string, strokeFraction = 0.012): string | null {
  const prepared = prepareSvg(svgText);
  if (!prepared.ok || !prepared.svg) return null;
  const doc = new DOMParser().parseFromString(prepared.svg, "image/svg+xml");
  const svg = doc.documentElement;
  const vb = (svg.getAttribute("viewBox") ?? "0 0 100 100").split(/[\s,]+/).map(Number);
  const sw = Math.max(vb[2], vb[3]) * strokeFraction;
  svg.querySelectorAll("style").forEach((n) => n.remove());
  // Knocked-out letters (a mask) become plain outlines next to their shape.
  svg.querySelectorAll("mask").forEach((mask) => {
    mask.querySelectorAll("path").forEach((p) => svg.appendChild(p));
    mask.remove();
  });
  svg.querySelectorAll("[mask]").forEach((el) => el.removeAttribute("mask"));
  svg.querySelectorAll(SHAPES).forEach((el) => {
    el.setAttribute("style", `fill:none;stroke:#000;stroke-width:${sw};stroke-linejoin:round`);
    el.removeAttribute("fill");
    el.removeAttribute("stroke");
  });
  // Keep the stroke inside the canvas by padding the viewBox.
  svg.setAttribute("viewBox", [vb[0] - sw, vb[1] - sw, vb[2] + sw * 2, vb[3] + sw * 2].join(" "));
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  return new XMLSerializer().serializeToString(svg);
}

/**
 * Studio mockups made from layered PSDs. Each mockup is an empty photo (plate)
 * plus, for every design slot, two renders of the PSD with the slot filled solid
 * black (K) and solid white (W). Those carry every shadow, highlight, mask and
 * blend of the original file, so a design composites as
 *   show = a * clamp((max|W-K| - 0.02) / 0.06, 0, 1)
 *   out  = mix(base, K + (W - K) * design, show)
 * The design is warped into the slot through its quad, or a 4x4 Bezier mesh for
 * curved surfaces, by drawing it as many small triangles.
 *
 * The packs are loaded from /mockups/studio/index.json at runtime, so the app
 * works (with the scene hidden) when they aren't deployed.
 */
import type { Pt, Quad } from "./geometry";

export interface StudioSlot {
  quad: Quad;
  mesh?: Pt[][];
  aspect: number;
  /** [x, y, w, h] of the K/W renders in plate pixels. */
  crop: [number, number, number, number];
  k: string;
  w: string;
}

export interface StudioMockup {
  id: string;
  name: string;
  size: [number, number];
  plate: string;
  slots: StudioSlot[];
}

const BASE = "/mockups/studio/";
let index: StudioMockup[] | null = null;
let indexPromise: Promise<StudioMockup[]> | null = null;
const listeners = new Set<() => void>();

export function onStudioAsset(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
const ping = () => listeners.forEach((f) => f());

/** The pack list, or null while it loads (an empty list when none is deployed). */
export function studioIndex(): StudioMockup[] | null {
  if (!indexPromise) loadStudioIndex();
  return index;
}

export function loadStudioIndex() {
  if (!indexPromise)
    indexPromise = fetch(BASE + "index.json")
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
      .then((list: StudioMockup[]) => {
        index = Array.isArray(list) ? list : [];
        ping();
        return index;
      });
  return indexPromise;
}

const images = new Map<string, HTMLImageElement>();

function image(src: string): HTMLImageElement | null {
  let img = images.get(src);
  if (!img) {
    img = new Image();
    img.decoding = "async";
    img.onload = ping;
    img.src = src;
    images.set(src, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

function waitImage(src: string) {
  image(src);
  const img = images.get(src)!;
  if (img.complete) return Promise.resolve();
  return new Promise<void>((res) => {
    img.addEventListener("load", () => res(), { once: true });
    img.addEventListener("error", () => res(), { once: true });
  });
}

const files = (m: StudioMockup) => [m.plate, ...m.slots.flatMap((s) => [s.k, s.w])].map((f) => `${BASE}${m.id}/${f}`);

/** Every file of the mockup if loaded, else null (and loading starts). */
export function studioImages(m: StudioMockup) {
  const imgs = files(m).map(image);
  return imgs.every(Boolean) ? (imgs as HTMLImageElement[]) : null;
}

export async function preloadStudio(ids: string[]) {
  const list = await loadStudioIndex();
  await Promise.all(list.filter((m) => ids.includes(m.id) || ids.includes("*")).flatMap((m) => files(m).map(waitImage)));
}

/* ---------- warping ---------- */

function bezier(mesh: Pt[][], u: number, v: number): Pt {
  const b = (t: number) => [(1 - t) ** 3, 3 * t * (1 - t) ** 2, 3 * t * t * (1 - t), t ** 3];
  const bu = b(u), bv = b(v);
  let x = 0, y = 0;
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      const w = bv[i] * bu[j];
      x += mesh[i][j][0] * w;
      y += mesh[i][j][1] * w;
    }
  return [x, y];
}

function bilinearQuad(q: Quad, u: number, v: number): Pt {
  // Projective would be exact for flat surfaces; at this grid density bilinear in each cell is indistinguishable.
  const top: Pt = [q[0][0] + (q[1][0] - q[0][0]) * u, q[0][1] + (q[1][1] - q[0][1]) * u];
  const bot: Pt = [q[3][0] + (q[2][0] - q[3][0]) * u, q[3][1] + (q[2][1] - q[3][1]) * u];
  return [top[0] + (bot[0] - top[0]) * v, top[1] + (bot[1] - top[1]) * v];
}

/** Draw image triangle (s0,s1,s2) onto destination triangle (d0,d1,d2), slightly grown to hide seams. */
function tri(g: CanvasRenderingContext2D, img: CanvasImageSource, s: Pt[], d: Pt[]) {
  const cx = (d[0][0] + d[1][0] + d[2][0]) / 3, cy = (d[0][1] + d[1][1] + d[2][1]) / 3;
  g.save();
  g.beginPath();
  for (let i = 0; i < 3; i++) {
    const dx = d[i][0] - cx, dy = d[i][1] - cy, l = Math.hypot(dx, dy) || 1;
    const x = d[i][0] + (dx / l) * 0.6, y = d[i][1] + (dy / l) * 0.6;
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  }
  g.closePath();
  g.clip();
  const [[x0, y0], [x1, y1], [x2, y2]] = s;
  const [[u0, v0], [u1, v1], [u2, v2]] = d;
  const den = x0 * (y1 - y2) + x1 * (y2 - y0) + x2 * (y0 - y1);
  if (Math.abs(den) < 1e-9) return g.restore();
  const a = (u0 * (y1 - y2) + u1 * (y2 - y0) + u2 * (y0 - y1)) / den;
  const b = (v0 * (y1 - y2) + v1 * (y2 - y0) + v2 * (y0 - y1)) / den;
  const c = (u0 * (x2 - x1) + u1 * (x0 - x2) + u2 * (x1 - x0)) / den;
  const dd = (v0 * (x2 - x1) + v1 * (x0 - x2) + v2 * (x1 - x0)) / den;
  const e = (u0 * (x1 * y2 - x2 * y1) + u1 * (x2 * y0 - x0 * y2) + u2 * (x0 * y1 - x1 * y0)) / den;
  const f = (v0 * (x1 * y2 - x2 * y1) + v1 * (x2 * y0 - x0 * y2) + v2 * (x0 * y1 - x1 * y0)) / den;
  g.setTransform(a, b, c, dd, e, f);
  g.drawImage(img, 0, 0);
  g.restore();
}

/** The design warped into the slot, on a canvas the size of the slot's crop. */
function warpDesign(slot: StudioSlot, size: [number, number], design: HTMLCanvasElement) {
  const [cx, cy, cw, ch] = slot.crop;
  const c = document.createElement("canvas");
  c.width = cw;
  c.height = ch;
  const g = c.getContext("2d")!;
  const N = 24;
  const at = (u: number, v: number): Pt => {
    const p = slot.mesh ? bezier(slot.mesh, u, v) : bilinearQuad(slot.quad, u, v);
    return [p[0] * size[0] - cx, p[1] * size[1] - cy];
  };
  const grid: Pt[][] = [];
  for (let j = 0; j <= N; j++) {
    grid.push([]);
    for (let i = 0; i <= N; i++) grid[j].push(at(i / N, j / N));
  }
  const W = design.width, H = design.height;
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const s00: Pt = [(i / N) * W, (j / N) * H], s10: Pt = [((i + 1) / N) * W, (j / N) * H];
      const s01: Pt = [(i / N) * W, ((j + 1) / N) * H], s11: Pt = [((i + 1) / N) * W, ((j + 1) / N) * H];
      tri(g, design, [s00, s10, s11], [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1]]);
      tri(g, design, [s00, s11, s01], [grid[j][i], grid[j + 1][i + 1], grid[j + 1][i]]);
    }
  return c;
}

function pixels(img: CanvasImageSource, w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, w, h);
  return g.getImageData(0, 0, w, h).data;
}

const finished = new Map<string, HTMLCanvasElement>();

/**
 * The plate with a design in every slot. `designFor(slotIndex, aspect)` draws
 * each slot's artwork. Cached by key; keeps a few.
 */
export function composeStudio(m: StudioMockup, imgs: HTMLImageElement[], key: string, designFor: (i: number, slot: StudioSlot) => HTMLCanvasElement) {
  const k = `${m.id}|${key}`;
  const hit = finished.get(k);
  if (hit) return hit;
  const [PW, PH] = m.size;
  const out = document.createElement("canvas");
  out.width = PW;
  out.height = PH;
  const og = out.getContext("2d", { willReadFrequently: true })!;
  og.drawImage(imgs[0], 0, 0, PW, PH);
  m.slots.forEach((slot, i) => {
    const [cx, cy, cw, ch] = slot.crop;
    const K = pixels(imgs[1 + i * 2], cw, ch), Wt = pixels(imgs[2 + i * 2], cw, ch);
    const D = warpDesign(slot, m.size, designFor(i, slot)).getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, cw, ch).data;
    const base = og.getImageData(cx, cy, cw, ch);
    const B = base.data;
    for (let p = 0; p < B.length; p += 4) {
      const a = D[p + 3] / 255;
      if (a <= 0) continue;
      const dr = Math.abs(Wt[p] - K[p]), dg = Math.abs(Wt[p + 1] - K[p + 1]), db = Math.abs(Wt[p + 2] - K[p + 2]);
      const show = a * Math.min(1, Math.max(0, (Math.max(dr, dg, db) / 255 - 0.02) / 0.06));
      if (show <= 0) continue;
      for (let ch3 = 0; ch3 < 3; ch3++) {
        const v = K[p + ch3] + (Wt[p + ch3] - K[p + ch3]) * (D[p + ch3] / 255);
        B[p + ch3] = B[p + ch3] + (v - B[p + ch3]) * show;
      }
    }
    og.putImageData(base, cx, cy);
  });
  finished.set(k, out);
  if (finished.size > 6) finished.delete(finished.keys().next().value!);
  return out;
}

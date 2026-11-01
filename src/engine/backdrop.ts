/**
 * Scene backgrounds: a brand colour or a brand gradient painted behind any
 * scene, optionally moving. Gradients come from the brand kit (read from the
 * website or made by hand) plus a few built from the colour roles.
 */
import type { Backdrop, BrandGradient, BrandKit } from "../types";
import { mix } from "../brand/color";
import { resolveColors } from "./kit";

export const DEFAULT_BACKDROP: Backdrop = { mode: "scene", color: "primary", gradient: "auto-duo", motion: "drift" };

/** Every gradient a scene can use: the brand's own first, then ones made from the colour roles. */
export function brandGradients(brand: BrandKit): BrandGradient[] {
  const c = resolveColors(brand);
  const auto: BrandGradient[] = [
    { id: "auto-duo", name: "Primary to secondary", type: "linear", angle: 135, stops: [c.primary, c.secondary] },
    { id: "auto-deep", name: "Primary into dark", type: "linear", angle: 160, stops: [c.primary, mix(c.primary, c.black, 0.55), c.black] },
    { id: "auto-glow", name: "Glow", type: "radial", angle: 0, stops: [mix(c.primary, c.white, 0.15), c.primary, mix(c.primary, c.black, 0.6)] },
    { id: "auto-aurora", name: "Aurora", type: "mesh", angle: 0, stops: [c.black, c.primary, c.secondary] },
    { id: "auto-soft", name: "Soft light", type: "mesh", angle: 0, stops: [c.white, mix(c.white, c.primary, 0.35), mix(c.white, c.secondary, 0.4)] },
  ];
  return [...(brand.gradients ?? []), ...auto];
}

export function findGradient(brand: BrandKit, id: string): BrandGradient {
  const all = brandGradients(brand);
  return all.find((g) => g.id === id) ?? all[0];
}

/** CSS for a swatch in the editor (a still of the gradient). */
export function gradientCss(g: BrandGradient) {
  if (g.type === "radial") return `radial-gradient(circle at 50% 50%, ${g.stops.join(", ")})`;
  if (g.type === "mesh") {
    const [base, ...blobs] = g.stops;
    const spots = ["20% 25%", "80% 70%", "70% 15%"];
    return [...blobs.map((s, i) => `radial-gradient(circle at ${spots[i % 3]}, ${s} 0%, transparent 60%)`), base].join(", ");
  }
  return `linear-gradient(${g.angle}deg, ${g.stops.join(", ")})`;
}

function addStops(grad: CanvasGradient, stops: string[]) {
  stops.forEach((s, i) => grad.addColorStop(stops.length === 1 ? 0 : i / (stops.length - 1), s));
}

/** Paint a gradient over the whole frame. t (seconds) drives the motion. */
export function paintGradient(ctx: CanvasRenderingContext2D, w: number, h: number, g: BrandGradient, t: number, motion: Backdrop["motion"]) {
  ctx.save();
  if (g.type === "linear") {
    let angle = g.angle;
    if (motion === "rotate") angle += t * 24;
    const shift = motion === "drift" ? Math.sin(t * 0.7) * 0.18 : 0;
    const rad = ((angle - 90) * Math.PI) / 180;
    // CSS-style length so the gradient reaches the corners.
    const len = (Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad))) / 2;
    const cx = w / 2 + Math.cos(rad) * len * shift;
    const cy = h / 2 + Math.sin(rad) * len * shift;
    const grad = ctx.createLinearGradient(cx - Math.cos(rad) * len, cy - Math.sin(rad) * len, cx + Math.cos(rad) * len, cy + Math.sin(rad) * len);
    addStops(grad, g.stops);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  } else if (g.type === "radial") {
    const pulse = motion === "pulse" ? 1 + Math.sin(t * 2.2) * 0.12 : 1;
    const cx = w / 2 + (motion === "drift" ? Math.sin(t * 0.6) * w * 0.12 : 0);
    const cy = h / 2 + (motion === "drift" ? Math.cos(t * 0.5) * h * 0.1 : 0);
    const r = Math.hypot(w, h) * 0.62 * pulse;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    addStops(grad, g.stops);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  } else {
    // Mesh: the first colour as a base with soft blobs of the others drifting over it.
    const [base, ...blobs] = g.stops;
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    const m = Math.max(w, h);
    const speed = motion === "none" ? 0 : motion === "rotate" ? 0.9 : 0.45;
    const pulse = motion === "pulse" ? 1 + Math.sin(t * 2.2) * 0.15 : 1;
    const spots = [
      [0.22, 0.28, 0.0],
      [0.78, 0.72, 2.1],
      [0.7, 0.18, 4.2],
      [0.3, 0.8, 1.3],
    ];
    blobs.forEach((color, i) => {
      const [sx, sy, phase] = spots[i % spots.length];
      const a = t * speed + phase;
      const x = w * (sx + Math.sin(a) * 0.12);
      const y = h * (sy + Math.cos(a * 0.8) * 0.12);
      const r = m * 0.62 * pulse;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, color);
      grad.addColorStop(1, transparent(color));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    });
  }
  ctx.restore();
}

function transparent(hex: string) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},0)`;
}

/** Paint a backdrop. Returns false when the scene should keep its own background. */
export function paintBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number, brand: BrandKit, b: Backdrop | undefined, t: number): boolean {
  if (!b || b.mode === "scene") return false;
  if (b.mode === "solid") {
    ctx.save();
    ctx.fillStyle = resolveColors(brand)[b.color] ?? brand.colors.primary;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    return true;
  }
  paintGradient(ctx, w, h, findGradient(brand, b.gradient), t, b.motion);
  return true;
}

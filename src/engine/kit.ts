import type { BrandKit, ColorRole, MediaItem, ParamValue } from "../types";
import { autoSecondary, hexToRgb } from "../brand/color";
import { rasterLogo, type LogoAsset } from "../brand/logo";

/* ---------- easing and timing ---------- */

export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Progress (0..1) of t through the window [start, end]. */
export const seg = (t: number, start: number, end: number) => clamp((t - start) / (end - start));

export const ease = {
  linear: (t: number) => t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number) => t * t * t,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuint: (t: number) => 1 - Math.pow(1 - t, 5),
  inOutQuint: (t: number) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),
  outBack: (t: number) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outExpo: (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
};

/* ---------- brand resolution ---------- */

export interface ResolvedColors {
  primary: string;
  secondary: string;
  black: string;
  white: string;
}

export function resolveColors(brand: BrandKit): ResolvedColors {
  return {
    ...brand.colors,
    secondary: brand.secondaryAuto ? autoSecondary(brand.colors.primary) : brand.colors.secondary,
  };
}

export type MediaEl = HTMLImageElement | HTMLVideoElement;

export interface BrandAssets {
  logo: LogoAsset | null;
  /** Line-art version of the logo, for construction and wireframe looks. */
  logoOutline: LogoAsset | null;
  lettermark: LogoAsset | null;
  media: Map<string, MediaEl>;
  /** Metadata (focal point, use, credit) for each media element. */
  mediaInfo: Map<string, MediaItem>;
}

/** Brand colour treatments for photos. */
export type Treatment = "none" | "duotone" | "mono" | "tint";

const treated = new WeakMap<MediaEl, Map<string, HTMLCanvasElement>>();

/**
 * Return the image with a brand colour treatment applied, cached per colours.
 * Duotone maps shadows to the brand Black and highlights to the chosen colour.
 */
function treatedImage(el: MediaEl, treatment: Treatment, dark: string, light: string): CanvasImageSource {
  if (treatment === "none" || el instanceof HTMLVideoElement) return el;
  const key = `${treatment}|${dark}|${light}`;
  let m = treated.get(el);
  if (!m) treated.set(el, (m = new Map()));
  const hit = m.get(key);
  if (hit) return hit;
  const sw = el.naturalWidth, sh = el.naturalHeight;
  const k = Math.min(1, 1600 / Math.max(sw, sh));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(sw * k));
  c.height = Math.max(1, Math.round(sh * k));
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(el, 0, 0, c.width, c.height);
  if (treatment === "tint") {
    g.globalCompositeOperation = "color";
    g.fillStyle = light;
    g.globalAlpha = 0.55;
    g.fillRect(0, 0, c.width, c.height);
  } else {
    const data = g.getImageData(0, 0, c.width, c.height);
    const d = data.data;
    const A = hexToRgb(dark), B = hexToRgb(treatment === "mono" ? "#FFFFFF" : light);
    const D = treatment === "mono" ? { r: 0, g: 0, b: 0 } : A;
    for (let i = 0; i < d.length; i += 4) {
      // Luminance with a gentle S-curve for punchier tones.
      let l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      l = l * l * (3 - 2 * l);
      d[i] = D.r + (B.r - D.r) * l;
      d[i + 1] = D.g + (B.g - D.g) * l;
      d[i + 2] = D.b + (B.b - D.b) * l;
    }
    g.putImageData(data, 0, 0);
  }
  m.set(key, c);
  return c;
}

/** A scene asking for a video to show a given time; the renderer seeks videos to match. */
export interface VideoRequest {
  el: HTMLVideoElement;
  time: number;
}

/* ---------- scene definitions ---------- */

export type ParamDef =
  | { key: string; label: string; type: "role"; default: ColorRole; roles?: ColorRole[]; help?: string }
  | { key: string; label: string; type: "text"; default: string; placeholder?: string; help?: string }
  | { key: string; label: string; type: "number"; default: number; min: number; max: number; step: number; unit?: string; help?: string }
  | { key: string; label: string; type: "select"; default: string; options: { value: string; label: string }[]; help?: string }
  | { key: string; label: string; type: "boolean"; default: boolean; help?: string }
  | { key: string; label: string; type: "media"; default: string; help?: string }
  /** An ordered list of photos, stored as JSON: [{ id, span }]. Empty means "all photos". */
  | { key: string; label: string; type: "gallery"; default: string; spans?: boolean; help?: string };

export interface SceneDef {
  type: string;
  name: string;
  description: string;
  defaultDuration: number;
  minDuration: number;
  maxDuration: number;
  params: ParamDef[];
  /** Draw one frame. t is seconds into the scene (may run past duration during a transition). */
  render(rc: RenderCtx, t: number, duration: number, params: Record<string, ParamValue>): void;
}

/* ---------- render context ---------- */

export class RenderCtx {
  readonly u: number;
  readonly colors: ResolvedColors;
  readonly videoRequests: VideoRequest[] = [];

  constructor(
    readonly ctx: CanvasRenderingContext2D,
    readonly w: number,
    readonly h: number,
    readonly brand: BrandKit,
    readonly assets: BrandAssets,
  ) {
    // One unit = 1px at a 1080px short side, so layouts scale with any export size.
    this.u = Math.min(w, h) / 1080;
    this.colors = resolveColors(brand);
  }

  /**
   * Get a media element to draw. For videos, t is the time within the clip that
   * should be visible; the renderer keeps the element in sync with it.
   */
  media(id: string, t = 0): MediaEl | null {
    const el = this.assets.media.get(id) ?? null;
    if (el instanceof HTMLVideoElement) {
      const d = el.duration || 0;
      this.videoRequests.push({ el, time: d > 0 ? t % d : 0 });
    }
    return el;
  }

  /** Media metadata (focal point, credit) by id. */
  mediaInfo(id: string): MediaItem | undefined {
    return this.assets.mediaInfo.get(id);
  }

  /**
   * Draw media to fill a rectangle (cover), keeping its focal point in frame.
   * zoom > 1 crops in further; pan (-1..1) drifts within the spare room.
   */
  drawCover(
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    opts: { zoom?: number; panX?: number; panY?: number; treatment?: Treatment; tint?: string; time?: number; alpha?: number } = {},
  ) {
    const el = this.media(id, opts.time ?? 0);
    if (!el) return false;
    const info = this.mediaInfo(id);
    const sw = el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth;
    const sh = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight;
    if (!sw || !sh) return false;
    const zoom = opts.zoom ?? 1;
    const scale = Math.max(w / sw, h / sh) * zoom;
    const dw = sw * scale, dh = sh * scale;
    const spareX = dw - w, spareY = dh - h;
    const fx = info?.focusX ?? 0.5, fy = info?.focusY ?? 0.5;
    // Centre on the focal point, then drift, never showing past the image edge.
    let ox = -(dw * fx - w / 2) + (opts.panX ?? 0) * spareX * 0.25;
    let oy = -(dh * fy - h / 2) + (opts.panY ?? 0) * spareY * 0.25;
    ox = Math.min(0, Math.max(-spareX, ox));
    oy = Math.min(0, Math.max(-spareY, oy));
    const src = treatedImage(el, opts.treatment ?? "none", this.colors.black, opts.tint ?? this.colors.primary);
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha *= opts.alpha ?? 1;
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.drawImage(src, x + ox, y + oy, dw, dh);
    ctx.restore();
    return true;
  }

  get portrait() {
    return this.h > this.w;
  }

  role(r: ColorRole | ParamValue): string {
    return this.colors[(r as ColorRole) in this.colors ? (r as ColorRole) : "primary"];
  }

  font(size: number, weight = this.brand.font.weight) {
    return `${weight} ${size}px "${this.brand.font.family}", system-ui, sans-serif`;
  }

  fill(color: string) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.w, this.h);
  }

  /** Logo size in px for a nominal height, with the brand's global logo scale applied. */
  logoHeight(nominal: number) {
    return nominal * this.u * this.brand.logoScale;
  }

  /**
   * Draw the logo mark centred at (cx, cy).
   * color: the colour to use when the brand tints its logo. With "keep my logo's
   * own colours", the original artwork is used unless knockout is true (for
   * placements such as a white mark on a coloured tile, where it must be flat).
   */
  drawLogo(cx: number, cy: number, height: number, color: string, opts: { alpha?: number; knockout?: boolean; asset?: LogoAsset | null } = {}) {
    const asset = opts.asset ?? this.assets.logo;
    if (!asset || height <= 0.5) return { w: 0, h: 0 };
    const tint = this.brand.logoColorMode === "primary" || opts.knockout ? color : null;
    const r = rasterLogo(asset, height, tint);
    const w = height * asset.ratio;
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha *= opts.alpha ?? 1;
    ctx.drawImage(r, cx - w / 2, cy - height / 2, w, height);
    ctx.restore();
    return { w, h: height };
  }

  /** Draw the logo filled with a gradient (chrome, glass and similar finishes). */
  drawLogoGradient(cx: number, cy: number, height: number, stops: [number, string][], angle = Math.PI / 3, opts: { alpha?: number } = {}) {
    const asset = this.assets.logo;
    if (!asset || height <= 0.5) return;
    const base = rasterLogo(asset, height, "#000");
    const c = document.createElement("canvas");
    c.width = base.width;
    c.height = base.height;
    const g = c.getContext("2d")!;
    g.drawImage(base, 0, 0);
    g.globalCompositeOperation = "source-in";
    const r = Math.hypot(c.width, c.height) / 2;
    const gr = g.createLinearGradient(c.width / 2 - Math.cos(angle) * r, c.height / 2 - Math.sin(angle) * r, c.width / 2 + Math.cos(angle) * r, c.height / 2 + Math.sin(angle) * r);
    stops.forEach(([o, col]) => gr.addColorStop(o, col));
    g.fillStyle = gr;
    g.fillRect(0, 0, c.width, c.height);
    const w = height * asset.ratio;
    this.ctx.save();
    this.ctx.globalAlpha *= opts.alpha ?? 1;
    this.ctx.drawImage(c, cx - w / 2, cy - height / 2, w, height);
    this.ctx.restore();
  }

  /** Line-art logo, tinted. Falls back to a faint filled logo if no outline could be made. */
  drawLogoOutline(cx: number, cy: number, height: number, color: string, alpha = 1) {
    const asset = this.assets.logoOutline;
    if (!asset) return this.drawLogo(cx, cy, height, color, { alpha: alpha * 0.25, knockout: true });
    // The outline art has padding, so scale it up a touch to line up with the solid logo.
    const pad = this.assets.logo ? (asset.ratio > 0 ? 1.024 : 1) : 1;
    const r = rasterLogo(asset, height * pad, color);
    const w = height * pad * asset.ratio;
    this.ctx.save();
    this.ctx.globalAlpha *= alpha;
    this.ctx.drawImage(r, cx - w / 2, cy - (height * pad) / 2, w, height * pad);
    this.ctx.restore();
  }

  /** A design-tool arrow cursor with its tip at (x, y). */
  drawCursor(x: number, y: number, size: number, color: string) {
    const { ctx } = this;
    const s = size / 24;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 19);
    ctx.lineTo(5, 14.5);
    ctx.lineTo(8.5, 22);
    ctx.lineTo(11.5, 20.5);
    ctx.lineTo(8, 13.5);
    ctx.lineTo(14.5, 13.5);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 1.6;
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }

  /** Tiny monospace caption at the bottom centre, as used in reels. */
  caption(str: string, color: string, alpha = 1) {
    if (!str) return;
    this.text(str.toUpperCase(), this.w / 2, this.h - 70 * this.u, 20 * this.u, color, { family: `"JetBrains Mono", ui-monospace, monospace`, weight: 500, align: "center", alpha, tracking: 0.08 });
  }

  logoWidth(height: number, asset = this.assets.logo) {
    return asset ? height * asset.ratio : 0;
  }

  /** Name size in px at the current frame size. */
  nameSize(mult = 1) {
    return this.brand.nameSize * this.u * mult;
  }

  /** Whether the brand name should be rendered as the lettermark SVG instead of text. */
  get usesLettermark() {
    return this.brand.useLettermark && !!this.assets.lettermark;
  }

  /** Measure the wordmark (typed name or lettermark) at a given name size. */
  measureWordmark(size: number) {
    if (this.usesLettermark) {
      const h = size * 0.9 * this.brand.lettermarkScale;
      return { w: this.logoWidth(h, this.assets.lettermark), h };
    }
    this.ctx.save();
    this.ctx.font = this.font(size);
    const w = this.ctx.measureText(this.brand.name).width;
    this.ctx.restore();
    return { w, h: size };
  }

  /** Draw the wordmark with its left edge at x and vertical centre at cy. */
  drawWordmark(x: number, cy: number, size: number, color: string, alpha = 1) {
    const { ctx } = this;
    if (this.usesLettermark) {
      const m = this.measureWordmark(size);
      this.drawLogo(x + m.w / 2, cy, m.h, color, { alpha, asset: this.assets.lettermark });
      return m;
    }
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.font = this.font(size);
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(this.brand.name, x, cy + size * 0.04);
    const w = ctx.measureText(this.brand.name).width;
    ctx.restore();
    return { w, h: size };
  }

  text(str: string, x: number, y: number, size: number, color: string, opts: { weight?: number; align?: CanvasTextAlign; baseline?: CanvasTextBaseline; alpha?: number; tracking?: number; family?: string } = {}) {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha *= opts.alpha ?? 1;
    ctx.font = opts.family
      ? `${opts.weight ?? 500} ${size}px ${opts.family}`
      : this.font(size, opts.weight ?? this.brand.font.weight);
    ctx.fillStyle = color;
    ctx.textAlign = opts.align ?? "left";
    ctx.textBaseline = opts.baseline ?? "alphabetic";
    if (opts.tracking) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${opts.tracking * size}px`;
    ctx.fillText(str, x, y);
    const w = ctx.measureText(str).width;
    ctx.restore();
    return w;
  }

  roundRect(x: number, y: number, w: number, h: number, r: number) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  }
}

/** UI-chrome font used for mockup details (not brand copy). */
export const UI_FONT = `"Inter", system-ui, sans-serif`;

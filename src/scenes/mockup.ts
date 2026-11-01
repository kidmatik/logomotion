/**
 * Photo mockup: the logo placed on a real product photo (business card, sign,
 * shirt, cup...) or on the user's own photo, with a material treatment built
 * from the logo's shape and a slow camera and light move.
 */
import { bestOn, contrast, hexToRgb, mix } from "../brand/color";
import { clamp, ease, lerp, seg, type ParamDef, type RenderCtx, type SceneDef } from "../engine/kit";
import { buildArt, type ArtContent } from "../mockup/art";
import { estimateAspect, invert, quadBounds, quadCenter, quadToPx, type Mat3, type Quad } from "../mockup/geometry";
import { composite, surfaceStats } from "../mockup/gl";
import { CAMERA_OPTIONS, cameraAt, covers, perspectiveView, type CameraStyle } from "../mockup/camera";
import { MATERIALS, MOCKUPS, mockupById, mockupPhoto, type MaterialId, type MockupDef } from "../mockup/library";
import type { ParamValue } from "../types";

/** What the "Your photo" setting stores. */
export interface SurfaceValue {
  /** Media id of the photo in the library. */
  id: string;
  /** Logo area on the photo, normalised, TL TR BR BL. */
  quad: Quad;
  /** Cylinder wrap in radians (0 = flat). */
  bend: number;
}

export const DEFAULT_QUAD: Quad = [
  [0.3, 0.32],
  [0.7, 0.32],
  [0.7, 0.68],
  [0.3, 0.68],
];

export function parseSurface(v: ParamValue | undefined): SurfaceValue | null {
  if (typeof v !== "string" || !v) return null;
  try {
    const o = JSON.parse(v);
    if (!o || typeof o.id !== "string") return null;
    const quad = Array.isArray(o.quad) && o.quad.length === 4 ? (o.quad as Quad) : DEFAULT_QUAD;
    return { id: o.id, quad, bend: Number(o.bend) || 0 };
  } catch {
    return null;
  }
}

const METALS: Record<string, [[number, number, number], [number, number, number]]> = {
  gold: [[0.4, 0.28, 0.1], [1.0, 0.89, 0.6]],
  silver: [[0.36, 0.38, 0.41], [0.97, 0.98, 1.0]],
  copper: [[0.4, 0.18, 0.1], [1.0, 0.74, 0.58]],
};

const rgb01 = (hex: string): [number, number, number] => {
  const { r, g, b } = hexToRgb(hex);
  return [r / 255, g / 255, b / 255];
};

const params: ParamDef[] = [
  {
    key: "base",
    label: "Mockup",
    type: "select",
    default: MOCKUPS[0]?.id ?? "custom",
    visual: true,
    previewAt: "settled",
    options: [...MOCKUPS.map((m) => ({ value: m.id, label: m.name })), { value: "custom", label: "Your photo" }],
  },
  { key: "surface", label: "Your photo", type: "surface", default: "", showIf: (p) => p.base === "custom" },
  {
    key: "material",
    label: "Finish",
    type: "select",
    default: "suggested",
    group: "Logo",
    visual: true,
    previewAt: "settled",
    options: [{ value: "suggested", label: "Suggested" }, ...MATERIALS.map((m) => ({ value: m.value, label: m.label }))],
  },
  {
    key: "foilTone",
    label: "Foil",
    type: "select",
    default: "gold",
    group: "Logo",
    showIf: (p) => p.material === "foil" || (p.material === "suggested" && mockupById(String(p.base))?.material === "foil"),
    options: [
      { value: "gold", label: "Gold" },
      { value: "silver", label: "Silver" },
      { value: "copper", label: "Copper" },
      { value: "brand", label: "Brand colour" },
    ],
  },
  {
    key: "content",
    label: "Show",
    type: "select",
    default: "mark",
    group: "Logo",
    options: [
      { value: "mark", label: "Logo mark" },
      { value: "lockup", label: "Logo and name side by side" },
      { value: "stacked", label: "Logo above name" },
      { value: "wordmark", label: "Name only" },
    ],
  },
  {
    key: "ink",
    label: "Colour",
    type: "select",
    default: "suggested",
    group: "Logo",
    options: [
      { value: "suggested", label: "Suggested for this photo" },
      { value: "primary", label: "Primary" },
      { value: "secondary", label: "Secondary" },
      { value: "black", label: "Black" },
      { value: "white", label: "White" },
      { value: "original", label: "Logo's own colours" },
    ],
  },
  { key: "size", label: "Size", type: "number", default: 100, min: 40, max: 160, step: 1, unit: "%", group: "Logo" },
  { key: "offsetY", label: "Move up or down", type: "number", default: 0, min: -100, max: 100, step: 1, unit: "%", group: "Logo" },
  { key: "strength", label: "Intensity", type: "number", default: 60, min: 0, max: 100, step: 1, unit: "%", group: "Logo", help: "Ink strength, depth or glow, depending on the finish." },
  {
    key: "reveal",
    label: "Logo appears",
    type: "select",
    default: "light",
    group: "Motion",
    options: [
      { value: "light", label: "Light sweep" },
      { value: "fade", label: "Fade in" },
      { value: "press", label: "Pressed in" },
      { value: "wipe", label: "Wipe" },
      { value: "none", label: "Already there" },
    ],
  },
  {
    key: "camera",
    label: "Camera",
    type: "select",
    default: "orbit",
    group: "Motion",
    options: CAMERA_OPTIONS,
  },
  { key: "sweep", label: "Moving light", type: "boolean", default: true, group: "Motion" },
  { key: "grade", label: "Brand colour grade", type: "number", default: 0, min: 0, max: 100, step: 1, unit: "%", group: "Look", help: "Tints the whole photo towards your brand colours, for a campaign look." },
];

interface Resolved {
  photo: CanvasImageSource & TexImageSource;
  pw: number;
  ph: number;
  quad: Quad;
  aspect: number;
  bend: number;
  arc: number;
  def: MockupDef | null;
}

function resolve(rc: RenderCtx, p: Record<string, ParamValue>): Resolved | "loading" | "missing" {
  if (p.base === "custom") {
    const s = parseSurface(p.surface);
    if (!s) return "missing";
    const el = rc.media(s.id);
    if (!el || el instanceof HTMLVideoElement || !el.naturalWidth) return el ? "loading" : "missing";
    const quad = quadToPx(s.quad, el.naturalWidth, el.naturalHeight);
    const flat = estimateAspect(quad);
    // A wrapped surface is wider than its straight-on outline.
    const aspect = s.bend > 0 ? flat * (s.bend / Math.sin(s.bend)) : flat;
    return { photo: el, pw: el.naturalWidth, ph: el.naturalHeight, quad, aspect, bend: s.bend, arc: 0, def: null };
  }
  const def = mockupById(String(p.base)) ?? MOCKUPS[0];
  if (!def) return "missing";
  const img = mockupPhoto(def.src);
  if (!img) return "loading";
  const quad = quadToPx(def.quad, img.naturalWidth, img.naturalHeight);
  return { photo: img, pw: img.naturalWidth, ph: img.naturalHeight, quad, aspect: def.aspect || estimateAspect(quad), bend: def.bend ?? 0, arc: def.arc ?? 0, def };
}

function placeholder(rc: RenderCtx, text: string) {
  const { ctx, w, h, u } = rc;
  rc.fill(mix(rc.colors.white, rc.colors.black, 0.06));
  ctx.strokeStyle = mix(rc.colors.white, rc.colors.black, 0.25);
  ctx.setLineDash([10 * u, 8 * u]);
  ctx.lineWidth = 2 * u;
  rc.roundRect(w * 0.2, h * 0.3, w * 0.6, h * 0.4, 18 * u);
  ctx.stroke();
  ctx.setLineDash([]);
  if (text) rc.text(text, w / 2, h / 2, 26 * u, mix(rc.colors.white, rc.colors.black, 0.55), { align: "center", baseline: "middle", weight: 500 });
}

export const mockupScene: SceneDef = {
  type: "mockup",
  name: "Photo mockup",
  description: "Your logo on a real product photo, printed, embossed, foiled, stitched or in neon, with a slow camera move. Pick a photo from the pack or use your own.",
  defaultDuration: 3.5,
  minDuration: 1.5,
  maxDuration: 10,
  params,
  render(rc, t, duration, p) {
    renderMockup(rc, t, duration, p, String(p.base));
  },
};

export interface MockupShotOptions {
  /** Camera style override (the montage picks one per shot). */
  camera?: CameraStyle;
  /** Mirror the camera's moves (alternate shots swing the other way). */
  mirror?: number;
  /** Time the logo takes to appear; 0 = already there. */
  revealTime?: number;
}

/** Draw one mockup photo with the logo and the camera move. Shared by the mockup and montage scenes. */
export function renderMockup(rc: RenderCtx, t: number, duration: number, p: Record<string, ParamValue>, base: string, opt: MockupShotOptions = {}) {
    const { ctx, w, h } = rc;
    const r = resolve(rc, { ...p, base });
    if (r === "loading") return placeholder(rc, "");
    if (r === "missing") return placeholder(rc, "Add a photo in this scene's settings");

    const material: MaterialId = p.material === "suggested" || !p.material ? (r.def?.material ?? "print") : (String(p.material) as MaterialId);
    const surface = surfaceStats(r.photo, r.pw, r.ph, r.quad);

    // Ink colour: the brand role asked for, or one that reads on this surface.
    let inkChoice = String(p.ink || "suggested");
    if (inkChoice === "suggested") inkChoice = r.def?.ink ?? "auto";
    if (material === "neon" && inkChoice === "auto") inkChoice = "primary";
    let ink = rc.colors.primary;
    if (inkChoice === "auto") ink = surface.lum < 0.4 ? rc.colors.white : contrast(surface.color, rc.colors.primary) >= 1.6 ? rc.colors.primary : bestOn(surface.color, [rc.colors.black, rc.colors.white]);
    else if (inkChoice !== "original") ink = rc.role(inkChoice);
    const useArtColor = inkChoice === "original" && (material === "print" || material === "embroidery");

    const style = (opt.camera ?? String(p.camera || "orbit")) as CameraStyle;
    const cam = cameraAt(style, t, duration, opt.mirror ?? 1);
    const k = duration > 0 ? clamp(t / duration) : 0;
    const b = quadBounds(r.quad);
    const surfW = b.x1 - b.x0, surfH = b.y1 - b.y0;
    const cover = Math.max(w / r.pw, h / r.ph);

    // Logo size comes from the wide framing so it never jumps between shots.
    const baseHw = w / 2 / (cover * 1.1), baseHh = h / 2 / (cover * 1.1);
    let fit = (r.def?.fit ?? 0.6) * (Number(p.size ?? 100) / 100);
    fit = Math.min(fit, (baseHw * 2 * 0.86) / surfW, (baseHh * 2 * 0.86) / surfH, 0.96);

    // Camera: wide framing at close 0, the logo filling ~45% of the frame at close 1.
    const pose = cam.pose;
    const wide = r.def?.focus ? [r.def.focus[0] * r.pw, r.def.focus[1] * r.ph] : quadCenter(r.quad);
    const qc = quadCenter(r.quad);
    const logoCy = qc[1] + Number(p.offsetY ?? 0) / 100 * surfH * (1 - fit) * 0.5;
    const focus = [lerp(wide[0], qc[0], pose.close), lerp(wide[1], logoCy, pose.close)];
    const zClose = Math.max(1, 0.45 * Math.min(w / (surfW * fit * cover), h / (surfH * fit * cover)));
    let s = cover * lerp(1, zClose, pose.close) * pose.zoom;
    const hw = w / 2 / s, hh = h / 2 / s;
    let cx = focus[0] + pose.dx * hw, cy = focus[1] + pose.dy * hh;
    // Keep the logo itself in view (tall and square photos get cropped hard in wide formats).
    const lw = (surfW * fit) / 2, lh = (surfH * fit) / 2;
    if (hw > lw * 1.15) cx = clamp(cx, qc[0] + lw * 1.15 - hw, qc[0] - lw * 1.15 + hw);
    if (hh > lh * 1.15) cy = clamp(cy, logoCy + lh * 1.15 - hh, logoCy - lh * 1.15 + hh);
    cx = clamp(cx, Math.min(hw, r.pw / 2), Math.max(r.pw - hw, r.pw / 2));
    cy = clamp(cy, Math.min(hh, r.ph / 2), Math.max(r.ph - hh, r.ph / 2));
    let view = perspectiveView(w, h, cx, cy, s, pose.yaw, pose.pitch, pose.roll);
    // Swings and rolls reveal the photo's edges; zoom in until they are out of frame.
    for (let i = 0; i < 30 && !covers(view, w, h, r.pw, r.ph); i++) {
      s *= 1.035;
      const hw2 = w / 2 / s, hh2 = h / 2 / s;
      cx = clamp(cx, Math.min(hw2, r.pw / 2), Math.max(r.pw - hw2, r.pw / 2));
      cy = clamp(cy, Math.min(hh2, r.ph / 2), Math.max(r.ph - hh2, r.ph / 2));
      view = perspectiveView(w, h, cx, cy, s, pose.yaw, pose.pitch, pose.roll);
    }

    const art = buildArt(rc.brand, rc.assets, {
      content: String(p.content || "mark") as ArtContent,
      ink: useArtColor ? null : ink,
      aspect: r.aspect,
      fit,
      offsetY: Number(p.offsetY ?? 0) / 100,
    });

    // The logo appears in the first shot, then the light keeps moving over it.
    const mode = String(p.reveal || "light");
    const revealEnd = opt.revealTime ?? (style === "cuts" || style === "punch" ? Math.max(0.6, Math.min(1.5, duration * 0.3)) : mode === "light" ? 1.5 : 1.1);
    const noReveal = mode === "none" || revealEnd <= 0 || !cam.firstShot;
    let reveal = noReveal ? 1 : ease.outCubic(seg(t, Math.min(0.25, revealEnd * 0.2), revealEnd));
    if (material === "neon" && !noReveal) {
      // Neon flickers on.
      const f = seg(t, Math.min(0.2, revealEnd * 0.15), revealEnd * 0.8);
      reveal = f >= 1 ? 1 : [0.15, 0.32, 0.4, 0.55, 0.62].some((x, i) => f > x && f < x + (i % 2 ? 0.06 : 0.04)) || f > 0.7 ? 1 : 0.08;
    }
    const tone = String(p.foilTone || r.def?.foilTone || "gold");
    const [metalA, metalB] = tone === "brand" ? [rgb01(mix(ink, "#000000", 0.55)), rgb01(mix(ink, "#FFFFFF", 0.55))] : METALS[tone] ?? METALS.gold;
    const baseLight = Math.atan2(r.def?.light[1] ?? -0.7, r.def?.light[0] ?? -0.7);
    // The light follows the camera's swing a little, so foil and bevels glint as it orbits.
    const la = baseLight + 0.45 * Math.sin(t * 0.9) + pose.yaw * 1.6;
    const short = Math.min(w, h);

    const ok = composite(ctx, w, h, {
      photo: r.photo,
      photoW: r.pw,
      photoH: r.ph,
      quad: r.quad,
      view,
      art,
      material,
      ink: rgb01(ink),
      useArtColor,
      strength: Number(p.strength ?? 60) / 100,
      bend: r.bend,
      arc: r.arc,
      light: [Math.cos(la), Math.sin(la)],
      time: t,
      reveal,
      revealMode: mode === "none" ? "fade" : (mode as "fade" | "wipe" | "press" | "light"),
      sweep: p.sweep === false ? 0 : 1,
      sweepPos: lerp(-0.5, 1.6, k) + pose.yaw * 0.8,
      metalA,
      metalB,
      dim: material === "neon" ? 0.45 : 0,
      surfaceLum: surface.lum,
      grade: Number(p.grade ?? 0) / 100,
      gradeDark: rgb01(mix(rc.colors.black, rc.colors.primary, 0.25)),
      gradeLight: rgb01(mix(rc.colors.white, rc.colors.primary, 0.35)),
      blur: [cam.blur[0] * short, cam.blur[1] * short],
      flash: cam.flash,
    });
    if (!ok) drawFallback(rc, r, view, art.color, reveal);
}

/** Without WebGL: the photo plus the logo multiplied on in perspective-free (affine) form. */
function drawFallback(rc: RenderCtx, r: Resolved, view: Mat3, art: HTMLCanvasElement, alpha: number) {
  const { ctx } = rc;
  const inv = invert(view);
  ctx.save();
  ctx.setTransform(inv[0], inv[3], inv[1], inv[4], inv[2], inv[5]);
  ctx.drawImage(r.photo, 0, 0);
  const [p0, p1, , p3] = r.quad;
  ctx.transform((p1[0] - p0[0]) / art.width, (p1[1] - p0[1]) / art.width, (p3[0] - p0[0]) / art.height, (p3[1] - p0[1]) / art.height, p0[0], p0[1]);
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "multiply";
  ctx.drawImage(art, 0, 0);
  ctx.restore();
}

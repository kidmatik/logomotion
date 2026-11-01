/**
 * Studio mockups: high-end photo mockups built from layered PSDs (phones in
 * hand, cups, cards, notebooks, stickers, a t-shirt). Every design slot is
 * filled with the brand: a brand-colour surface with the logo and name, lit by
 * the PSD's own shading, then shot with the same camera moves as the photo
 * mockups.
 */
import { bestOn, hexToRgb, mix } from "../brand/color";
import { RenderCtx, clamp, ease, lerp, seg, type ParamDef, type SceneDef } from "../engine/kit";
import { CAMERA_OPTIONS, cameraAt, frameView, type CameraStyle } from "../mockup/camera";
import { drawPlate } from "../mockup/gl";
import { composeStudio, loadStudioIndex, studioImages, studioIndex, type StudioMockup, type StudioSlot } from "../mockup/studio";
import type { ParamValue } from "../types";

const roles = [
  { value: "primary", label: "Primary" },
  { value: "secondary", label: "Secondary" },
  { value: "black", label: "Black" },
  { value: "white", label: "White" },
];

const params: ParamDef[] = [
  { key: "base", label: "Mockup", type: "select", default: "matcha-cup", options: [] },
  { key: "fill", label: "Surface colour", type: "select", default: "black", group: "Design", options: roles, help: "The colour printed on the cup, card, screen or shirt." },
  { key: "ink", label: "Logo colour", type: "select", default: "auto", group: "Design", options: [{ value: "auto", label: "Best contrast" }, ...roles] },
  {
    key: "content",
    label: "Show",
    type: "select",
    default: "stacked",
    group: "Design",
    options: [
      { value: "stacked", label: "Logo above name" },
      { value: "mark", label: "Logo mark" },
      { value: "wordmark", label: "Name only" },
    ],
  },
  { key: "camera", label: "Camera", type: "select", default: "orbit", group: "Motion", options: CAMERA_OPTIONS },
  {
    key: "reveal",
    label: "Design appears",
    type: "select",
    default: "fade",
    group: "Motion",
    options: [
      { value: "fade", label: "Fade in" },
      { value: "wipe", label: "Wipe" },
      { value: "none", label: "Already there" },
    ],
  },
  { key: "grade", label: "Brand colour grade", type: "number", default: 0, min: 0, max: 100, step: 1, unit: "%", group: "Look" },
];

// Start fetching the pack list as soon as the scene is known, so the menu fills in early.
if (typeof window !== "undefined") loadStudioIndex().then(syncOptions);

/** The mockup list comes from the deployed packs; fill the options in once known. */
function syncOptions(list: StudioMockup[]) {
  const p = params[0];
  if (p.type === "select" && p.options.length !== list.length) {
    p.options.splice(0, p.options.length, ...list.map((m) => ({ value: m.id, label: m.name })));
    if (list.length && !list.some((m) => m.id === p.default)) p.default = list[0].id;
  }
}

const rgb01 = (hex: string): [number, number, number] => {
  const { r, g, b } = hexToRgb(hex);
  return [r / 255, g / 255, b / 255];
};

function slotBox(s: StudioSlot) {
  const [x, y, w, h] = s.crop;
  return { x0: x, y0: y, x1: x + w, y1: y + h };
}

function designCanvas(rc: RenderCtx, slot: StudioSlot, m: StudioMockup, fill: string, ink: string, content: string) {
  const a = Math.max(0.2, Math.min(5, slot.aspect || 1));
  const L = 1200;
  const W = a >= 1 ? L : Math.round(L * a), H = a >= 1 ? Math.round(L / a) : L;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const r = new RenderCtx(g, W, H, { ...rc.brand, logoColorMode: "primary" }, rc.assets);
  r.fill(fill);
  // Small slots (sleeves, stickers seen edge-on) get just the mark.
  const small = (slot.crop[2] * slot.crop[3]) / (m.size[0] * m.size[1]) < 0.02;
  const mode = small || !rc.assets.logo ? (rc.assets.logo ? "mark" : "wordmark") : content;
  const box = Math.min(W, H);
  if (mode === "mark") r.drawLogo(W / 2, H / 2, box * 0.36, ink, { knockout: true });
  else if (mode === "wordmark") {
    let size = box * 0.16;
    const mw = r.measureWordmark(size).w;
    if (mw > W * 0.7) size *= (W * 0.7) / mw;
    const wm = r.measureWordmark(size);
    r.drawWordmark(W / 2 - wm.w / 2, H / 2, size, ink);
  } else {
    const M = box * 0.3;
    let size = M * 0.42;
    const mw = r.measureWordmark(size).w;
    if (mw > W * 0.72) size *= (W * 0.72) / mw;
    const wm = r.measureWordmark(size);
    const total = M + M * 0.22 + wm.h;
    const top = H / 2 - total / 2;
    r.drawLogo(W / 2, top + M / 2, M, ink, { knockout: true });
    r.drawWordmark(W / 2 - wm.w / 2, top + M + M * 0.22 + wm.h / 2, size, ink);
  }
  return c;
}

function placeholder(rc: RenderCtx, text: string) {
  rc.fill(mix(rc.colors.white, rc.colors.black, 0.06));
  if (text) rc.text(text, rc.w / 2, rc.h / 2, 26 * rc.u, mix(rc.colors.white, rc.colors.black, 0.55), { align: "center", baseline: "middle", weight: 500 });
}

export function renderStudioMockup(rc: RenderCtx, t: number, duration: number, p: Record<string, ParamValue>, opt: { camera?: CameraStyle; mirror?: number; revealTime?: number } = {}) {
  const { ctx, w, h } = rc;
  const list = studioIndex();
  if (!list) return placeholder(rc, "");
  syncOptions(list);
  if (!list.length) return placeholder(rc, "Studio mockups aren't installed");
  const m = list.find((x) => x.id === p.base) ?? list[0];
  const imgs = studioImages(m);
  if (!imgs) return placeholder(rc, "");

  const fill = rc.role(p.fill || "black");
  const pool = [rc.colors.white, rc.colors.black, rc.colors.primary, rc.colors.secondary].filter((c) => c !== fill);
  const ink = p.ink && p.ink !== "auto" ? rc.role(p.ink) : bestOn(fill, pool);
  const content = String(p.content || "stacked");
  const key = [fill, ink, content, rc.assets.logo?.id ?? 0, rc.brand.name, rc.brand.font.family, rc.brand.font.weight, rc.brand.useLettermark].join("|");
  const full = composeStudio(m, imgs, key, (_, slot) => designCanvas(rc, slot, m, fill, ink, content));

  // Frame the biggest slot for close-ups; the wide shot frames all slots.
  const boxes = m.slots.map(slotBox);
  const all = boxes.reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }));
  const big = boxes.reduce((a, b) => ((b.x1 - b.x0) * (b.y1 - b.y0) > (a.x1 - a.x0) * (a.y1 - a.y0) ? b : a));
  const [PW, PH] = m.size;
  const style = (opt.camera ?? String(p.camera || "orbit")) as CameraStyle;
  const cam = cameraAt(style, t, duration, opt.mirror ?? 1);
  const wide: [number, number] = [lerp(PW / 2, (all.x0 + all.x1) / 2, 0.6), lerp(PH / 2, (all.y0 + all.y1) / 2, 0.6)];
  const view = frameView(w, h, PW, PH, cam.pose, wide, { cx: (big.x0 + big.x1) / 2, cy: (big.y0 + big.y1) / 2, w: big.x1 - big.x0, h: big.y1 - big.y0 });

  const mode = String(p.reveal || "fade");
  const revealEnd = opt.revealTime ?? (style === "cuts" || style === "punch" ? Math.max(0.5, Math.min(1.2, duration * 0.3)) : 1.2);
  const reveal = mode === "none" || revealEnd <= 0 || !cam.firstShot ? 1 : ease.outCubic(seg(t, Math.min(0.2, revealEnd * 0.2), revealEnd));
  const k = duration > 0 ? clamp(t / duration) : 0;
  const short = Math.min(w, h);
  const ok = drawPlate(ctx, w, h, {
    empty: imgs[0],
    full,
    photoW: PW,
    photoH: PH,
    view,
    reveal,
    mode: mode === "wipe" ? 1 : 0,
    sweep: 1,
    sweepPos: lerp(-0.5, 1.6, k) + cam.pose.yaw * 0.8,
    grade: Number(p.grade ?? 0) / 100,
    gradeDark: rgb01(mix(rc.colors.black, rc.colors.primary, 0.25)),
    gradeLight: rgb01(mix(rc.colors.white, rc.colors.primary, 0.35)),
    blur: [cam.blur[0] * short, cam.blur[1] * short],
    flash: cam.flash,
  });
  if (!ok) {
    const s = Math.max(w / PW, h / PH);
    ctx.drawImage(full, (w - PW * s) / 2, (h - PH * s) / 2, PW * s, PH * s);
  }
}

export const studioMockupScene: SceneDef = {
  type: "studio",
  name: "Studio mockup",
  description: "Premium photo mockups (phones in hand, cups, cards, notebooks, stickers, a t-shirt) printed in your brand colours with the photo's real light and shadows.",
  defaultDuration: 3.5,
  minDuration: 1.2,
  maxDuration: 10,
  params,
  render(rc, t, duration, p) {
    renderStudioMockup(rc, t, duration, p);
  },
};

/**
 * 3D product: a can, coffee cup, box or business cards in the brand's colours,
 * with a real camera orbit all the way round, fast cuts between angles, or a
 * spin-in reveal.
 */
import { bestOn, mix } from "../brand/color";
import { clamp, ease, lerp, seg, type ParamDef, type RenderCtx, type SceneDef } from "../engine/kit";
import { drawBlurred } from "../mockup/gl";
import { renderStudio, type ProductKind, type StudioCamera, type StudioPose } from "../mockup/studio3d";

const roles = [
  { value: "primary", label: "Primary" },
  { value: "secondary", label: "Secondary" },
  { value: "black", label: "Black" },
  { value: "white", label: "White" },
];

const params: ParamDef[] = [
  {
    key: "object",
    label: "Object",
    type: "select",
    default: "can",
    visual: true,
    previewAt: "settled",
    options: [
      { value: "can", label: "Drink can" },
      { value: "cup", label: "Coffee cup" },
      { value: "box", label: "Product box" },
      { value: "cards", label: "Business cards" },
    ],
  },
  {
    key: "camera",
    label: "Camera",
    type: "select",
    default: "orbit",
    group: "Motion",
    options: [
      { value: "orbit", label: "Orbit 360°" },
      { value: "cuts", label: "Fast cuts: wide, macro, top, hero" },
      { value: "spin", label: "Spin in, then settle" },
      { value: "float", label: "Floating" },
    ],
  },
  { key: "body", label: "Object colour", type: "select", default: "primary", group: "Colours", options: roles },
  { key: "ink", label: "Logo colour", type: "select", default: "auto", group: "Colours", options: [{ value: "auto", label: "Best contrast" }, ...roles] },
  { key: "accent", label: "Accent", type: "select", default: "secondary", group: "Colours", options: roles },
  { key: "backdrop", label: "Backdrop", type: "select", default: "white", group: "Colours", options: [...roles, { value: "tint", label: "Soft tint of the object colour" }] },
];

interface Shot {
  start: number;
  end: number;
  from: Partial<StudioCamera>;
  to: Partial<StudioCamera>;
  whip?: number;
  ease?: (t: number) => number;
}

const CAM: StudioCamera = { azimuth: -0.5, elevation: 0.18, distance: 1, fov: 28, targetY: 0, roll: 0 };
const sine = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t);

const CUTS: Shot[] = [
  { start: 0, end: 0.3, from: { azimuth: -0.8, elevation: 0.22, distance: 1.05 }, to: { azimuth: -0.45, elevation: 0.18, distance: 0.98 } },
  { start: 0.3, end: 0.52, from: { azimuth: 0.3, elevation: 0.04, distance: 0.42, targetY: 0.02, roll: -0.04 }, to: { azimuth: 0.08, elevation: 0.06, distance: 0.38, targetY: 0.02, roll: 0 }, whip: 1 },
  { start: 0.52, end: 0.74, from: { azimuth: 2.1, elevation: 1.05, distance: 0.8 }, to: { azimuth: 2.7, elevation: 1.0, distance: 0.75 }, whip: -1 },
  { start: 0.74, end: 1, from: { azimuth: 0.7, elevation: 0.0, distance: 0.82, fov: 24 }, to: { azimuth: 0.15, elevation: 0.12, distance: 0.95, fov: 24 }, whip: 1, ease: ease.outQuint },
];

function interp(a: Partial<StudioCamera>, b: Partial<StudioCamera>, e: number): StudioCamera {
  const out = {} as StudioCamera;
  for (const k of Object.keys(CAM) as (keyof StudioCamera)[]) out[k] = lerp(a[k] ?? CAM[k], b[k] ?? a[k] ?? CAM[k], e);
  return out;
}

function move(style: string, t: number, dur: number): { cam: StudioCamera; pose: StudioPose; blur: number; flash: number } {
  const k = dur > 0 ? clamp(t / dur) : 0;
  const pose: StudioPose = { spin: 0, lift: 0, tilt: 0, scale: 1 };
  let blur = 0, flash = 0;
  if (style === "cuts") {
    let i = CUTS.findIndex((s) => k < s.end);
    if (i < 0) i = CUTS.length - 1;
    const s = CUTS[i];
    const t0 = s.start * dur, t1 = s.end * dur;
    const e = (s.ease ?? ease.inOutCubic)(clamp((t - t0) / Math.max(1e-3, t1 - t0)));
    const cam = interp(s.from, s.to, e);
    const W = 0.09;
    if (s.whip && i > 0) {
      const w = clamp(1 - (t - t0) / W);
      blur = s.whip * 0.22 * w * w;
      cam.azimuth -= s.whip * 0.25 * w * w;
      flash = 0.15 * clamp(1 - (t - t0) / 0.06);
    }
    const next = CUTS[i + 1];
    if (next?.whip) {
      const w = clamp(1 - (t1 - t) / W);
      if (w > 0) {
        blur = next.whip * 0.22 * w * w;
        cam.azimuth += next.whip * 0.25 * w * w;
      }
    }
    // The object settles in during the first shot.
    pose.scale = ease.outBack(seg(t, 0, 0.5));
    return { cam, pose, blur, flash };
  }
  if (style === "spin") {
    const cam = interp({ azimuth: -0.35, elevation: 0.2, distance: 1.05 }, { azimuth: -0.25, elevation: 0.14, distance: 0.92 }, ease.inOutCubic(k));
    const sp = ease.outExpo(seg(t, 0, Math.max(0.8, dur * 0.65)));
    pose.spin = -Math.PI * 4 * (1 - sp);
    pose.scale = ease.outBack(seg(t, 0, 0.45));
    pose.lift = 0.6 * (1 - ease.outCubic(seg(t, 0, 0.6)));
    // Fast spin smears a little.
    blur = 0.05 * (1 - sp);
    return { cam, pose, blur, flash };
  }
  if (style === "float") {
    const cam = interp({ azimuth: -0.6, elevation: 0.12, distance: 1.02 }, { azimuth: 0.45, elevation: 0.2, distance: 0.96 }, sine(k));
    pose.lift = 0.12 + 0.05 * Math.sin(t * 2.2);
    pose.tilt = 0.07 * Math.sin(t * 1.4);
    pose.spin = 0.35 * Math.sin(t * 0.9);
    pose.scale = ease.outCubic(seg(t, 0, 0.5));
    return { cam, pose, blur, flash };
  }
  // Orbit 360: one full turn, easing in and out so it loops cleanly.
  const e = sine(k);
  const cam: StudioCamera = { ...CAM, azimuth: -0.5 + Math.PI * 2 * e, elevation: 0.16 + 0.14 * Math.sin(Math.PI * k), distance: 1.02 - 0.1 * Math.sin(Math.PI * k) };
  return { cam, pose, blur, flash };
}

export const product3dScene: SceneDef = {
  type: "product3d",
  name: "3D product",
  description: "A can, coffee cup, box or business cards in your colours, with a real 360° camera orbit, fast cuts or a spin-in.",
  defaultDuration: 4,
  minDuration: 1.5,
  maxDuration: 12,
  params,
  render(rc: RenderCtx, t, duration, p) {
    const { ctx, w, h } = rc;
    const body = rc.role(p.body || "primary");
    const accent0 = rc.role(p.accent || "secondary");
    const accent = accent0 === body ? mix(body, rc.colors.white, 0.6) : accent0;
    const ink = p.ink && p.ink !== "auto" ? rc.role(p.ink) : bestOn(body, [rc.colors.white, rc.colors.black, accent]);
    const backdrop = p.backdrop === "tint" ? mix(body, "#FFFFFF", 0.82) : rc.role(p.backdrop || "white");
    const m = move(String(p.camera || "orbit"), t, duration);
    const src = renderStudio(ctx, w, h, rc.brand, rc.assets, { object: String(p.object || "can") as ProductKind, body, ink, accent, backdrop }, m.cam, m.pose);
    if (!src) {
      rc.fill(backdrop);
      rc.text("3D needs WebGL", w / 2, h / 2, 28 * rc.u, ink, { align: "center", baseline: "middle" });
      return;
    }
    if (Math.abs(m.blur) > 0.002) drawBlurred(ctx, src, w, h, [m.blur * Math.min(w, h), 0]);
    if (m.flash > 0) {
      ctx.save();
      ctx.globalAlpha = m.flash;
      rc.fill("#FFFFFF");
      ctx.restore();
    }
  },
};

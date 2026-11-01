/**
 * Camera moves for photo mockups. A move is a list of shots; each shot eases
 * between two poses. Between shots the camera cuts, with a short whip blur and
 * a zoom punch so the cut lands like an edit, not a slideshow.
 *
 * A pose can swing the photo in 3D (yaw / pitch) with real perspective, which
 * gives an orbit feel around the product. The view is always zoomed enough to
 * keep the photo's edges out of frame.
 */
import { clamp, ease, lerp } from "../engine/kit";
import { apply, invert, mul, type Mat3 } from "./geometry";

export interface Pose {
  /** 0 = the photo's wide framing, 1 = close on the logo. */
  close: number;
  /** Extra zoom on top of the framing. */
  zoom: number;
  /** 3D swing around the vertical (yaw) and horizontal (pitch) axes, radians. */
  yaw: number;
  pitch: number;
  roll: number;
  /** Pan, as a share of the visible half-width / half-height. */
  dx: number;
  dy: number;
}

export interface Shot {
  /** Share of the scene's duration, 0..1. */
  start: number;
  end: number;
  from: Partial<Pose>;
  to: Partial<Pose>;
  ease?: (t: number) => number;
  /** Direction of the whip into this shot (-1 left, 1 right, 0 none). */
  whip?: number;
}

export interface CameraFrame {
  pose: Pose;
  /** Motion blur vector in units of the frame's short side. */
  blur: [number, number];
  /** 0..1 white flash. */
  flash: number;
  /** Which shot, and how far through it (seconds). */
  shot: number;
  shotTime: number;
  /** Shot 0 is where the logo appears; later shots show it already there. */
  firstShot: boolean;
}

export type CameraStyle = "orbit" | "cuts" | "whip" | "punch" | "push" | "pull" | "drift" | "tilt" | "still" | "snap" | "snapClose" | "snapLow";

export const CAMERA_OPTIONS: { value: CameraStyle; label: string }[] = [
  { value: "orbit", label: "Orbit around it" },
  { value: "cuts", label: "Fast cuts: wide, close, detail" },
  { value: "whip", label: "Whip in, then push" },
  { value: "punch", label: "Punch in on the beat" },
  { value: "push", label: "Slow push in" },
  { value: "pull", label: "Slow pull out" },
  { value: "drift", label: "Drift sideways" },
  { value: "tilt", label: "Gentle tilt" },
  { value: "still", label: "Still" },
];

const BASE: Pose = { close: 0, zoom: 1.05, yaw: 0, pitch: 0, roll: 0, dx: 0, dy: 0 };
const sine = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t);

function shotsFor(style: CameraStyle, mirror: number): Shot[] {
  const m = mirror;
  switch (style) {
    case "orbit":
      return [{ start: 0, end: 1, from: { zoom: 1.03, yaw: -0.22 * m, pitch: 0.06, close: 0 }, to: { zoom: 1.1, yaw: 0.22 * m, pitch: -0.03, close: 0.15 }, ease: sine }];
    case "cuts":
      return [
        { start: 0, end: 0.34, from: { zoom: 1.1, yaw: -0.12 * m, pitch: 0.04 }, to: { zoom: 1.2, yaw: -0.03 * m, pitch: 0.01 } },
        { start: 0.34, end: 0.56, from: { close: 1, zoom: 1.05, yaw: 0.2 * m, roll: -0.02 * m }, to: { close: 1, zoom: 1.16, yaw: 0.1 * m, roll: 0 }, whip: 1 },
        { start: 0.56, end: 0.76, from: { close: 0.75, zoom: 1.5, yaw: -0.24 * m, pitch: 0.2, dx: -0.25, dy: 0.15 }, to: { close: 0.75, zoom: 1.45, yaw: -0.16 * m, pitch: 0.16, dx: 0.25, dy: 0.1 }, whip: -1 },
        { start: 0.76, end: 1, from: { zoom: 1.4, yaw: 0.14 * m, pitch: -0.05, close: 0.3 }, to: { zoom: 1.1, yaw: 0.02 * m, pitch: 0, close: 0 }, ease: ease.outQuint, whip: 1 },
      ];
    case "whip":
      return [{ start: 0, end: 1, from: { zoom: 1.12, yaw: -0.18 * m, dx: -0.9 * m }, to: { zoom: 1.3, yaw: 0.08 * m, close: 0.35 }, ease: (t) => ease.outExpo(clamp(t * 1.6)) * 0.7 + t * 0.3 }];
    case "punch":
      return [
        { start: 0, end: 0.4, from: { zoom: 1.08, yaw: -0.08 * m }, to: { zoom: 1.14, yaw: -0.04 * m } },
        { start: 0.4, end: 0.7, from: { close: 0.55, zoom: 1.2, yaw: 0.06 * m }, to: { close: 0.55, zoom: 1.26, yaw: 0.1 * m } },
        { start: 0.7, end: 1, from: { close: 1, zoom: 1.1, yaw: 0.12 * m }, to: { close: 1, zoom: 1.18, yaw: 0.16 * m } },
      ];
    // Short montage shots: a whip in, then a quick settle with a swing.
    case "snap":
      return [{ start: 0, end: 1, from: { zoom: 1.3, yaw: -0.22 * m, pitch: 0.05, close: 0.2 }, to: { zoom: 1.12, yaw: 0.08 * m, pitch: 0, close: 0.1 }, ease: ease.outQuint }];
    case "snapClose":
      return [{ start: 0, end: 1, from: { close: 1, zoom: 1.28, yaw: 0.2 * m, roll: -0.03 * m }, to: { close: 1, zoom: 1.08, yaw: 0.06 * m, roll: 0 }, ease: ease.outQuint }];
    case "snapLow":
      return [{ start: 0, end: 1, from: { close: 0.6, zoom: 1.35, yaw: -0.18 * m, pitch: 0.22, dx: -0.2 * m }, to: { close: 0.6, zoom: 1.25, yaw: -0.08 * m, pitch: 0.14, dx: 0.15 * m }, ease: ease.outCubic }];
    case "push":
      return [{ start: 0, end: 1, from: { zoom: 1.04 }, to: { zoom: 1.16 }, ease: ease.inOutCubic }];
    case "pull":
      return [{ start: 0, end: 1, from: { zoom: 1.18 }, to: { zoom: 1.05 }, ease: ease.inOutCubic }];
    case "drift":
      return [{ start: 0, end: 1, from: { zoom: 1.12, dx: -0.08 }, to: { zoom: 1.12, dx: 0.08 }, ease: ease.inOutCubic }];
    case "tilt":
      return [{ start: 0, end: 1, from: { zoom: 1.12, roll: -0.012 }, to: { zoom: 1.12, roll: 0.012 }, ease: ease.inOutCubic }];
    default:
      return [{ start: 0, end: 1, from: {}, to: {} }];
  }
}

/** Shot lengths shorter than this get no whip blur (it would eat the shot). */
const WHIP = 0.09;

export function cameraAt(style: CameraStyle, t: number, duration: number, mirror = 1): CameraFrame {
  const shots = shotsFor(style, mirror);
  const k = duration > 0 ? clamp(t / duration) : 0;
  let i = shots.findIndex((s) => k < s.end);
  if (i < 0) i = shots.length - 1;
  const s = shots[i];
  const t0 = s.start * duration, t1 = s.end * duration;
  const local = clamp((t - t0) / Math.max(1e-3, t1 - t0));
  const e = (s.ease ?? ease.inOutCubic)(local);
  const pose = {} as Pose;
  for (const key of Object.keys(BASE) as (keyof Pose)[]) {
    pose[key] = lerp(s.from[key] ?? BASE[key], s.to[key] ?? s.from[key] ?? BASE[key], e);
  }

  let blur: [number, number] = [0, 0];
  let flash = 0;
  // Whip in: the first frames of a shot are smeared and slightly over-zoomed.
  if (s.whip && i > 0) {
    const since = t - t0;
    const w = clamp(1 - since / WHIP);
    if (w > 0) {
      blur = [s.whip * 0.22 * w * w, 0];
      pose.dx += -s.whip * 0.35 * w * w;
    }
    pose.zoom *= 1 + 0.08 * (1 - ease.outExpo(clamp(since / 0.35)));
    flash = Math.max(flash, 0.12 * clamp(1 - since / 0.06));
  }
  // Whip out: the last frames before the next shot smear in the next shot's direction.
  const next = shots[i + 1];
  if (next?.whip) {
    const until = t1 - t;
    const w = clamp(1 - until / WHIP);
    if (w > 0) {
      blur = [next.whip * 0.22 * w * w, 0];
      pose.dx += next.whip * 0.35 * w * w;
    }
  }
  // Montage shots whip in from the side.
  if (style === "snap" || style === "snapClose" || style === "snapLow") {
    const w = clamp(1 - t / WHIP);
    if (w > 0) {
      blur = [mirror * 0.2 * w * w, 0];
      pose.dx -= mirror * 0.3 * w * w;
    }
  }
  // The single "whip" move starts with a big blur.
  if (style === "whip") {
    const w = clamp(1 - t / 0.35);
    blur = [mirror * 0.3 * w * w, 0];
  }
  // Punch-in: small zoom pop at each cut.
  if (style === "punch" && i > 0) pose.zoom *= 1 + 0.06 * (1 - ease.outExpo(clamp((t - t0) / 0.3)));
  return { pose, blur, flash, shot: i, shotTime: t - t0, firstShot: i === 0 };
}

/**
 * Output pixel -> photo pixel for a camera looking at (cx, cy) on the photo,
 * with scale s (photo px -> output px), swung in 3D by yaw / pitch, rolled, and
 * seen through a lens with focal length f (in output px).
 */
export function perspectiveView(w: number, h: number, cx: number, cy: number, s: number, yaw: number, pitch: number, roll: number): Mat3 {
  const f = Math.max(w, h) * 1.4;
  const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  // R = Rz(roll) * Rx(pitch) * Ry(yaw); we need its first two columns.
  const Ry = [cyw, 0, syw, 0, 1, 0, -syw, 0, cyw];
  const Rx = [1, 0, 0, 0, cp, -sp, 0, sp, cp];
  const Rz = [cr, -sr, 0, sr, cr, 0, 0, 0, 1];
  const R = mul(Rz, mul(Rx, Ry));
  const r1 = [R[0], R[3], R[6]], r2 = [R[1], R[4], R[7]];
  const D = f; // camera distance: unrotated photo maps 1:1 at scale s
  const ox = w / 2, oy = h / 2;
  // [a, b, 1] (plane coords in output px) -> homogeneous screen.
  const M: Mat3 = [
    f * r1[0] + ox * r1[2], f * r2[0] + ox * r2[2], ox * D,
    f * r1[1] + oy * r1[2], f * r2[1] + oy * r2[2], oy * D,
    r1[2], r2[2], D,
  ];
  // Normalise so an unrotated camera gives scale 1 (M/D).
  const A: Mat3 = [s, 0, -s * cx, 0, s, -s * cy, 0, 0, 1];
  return invert(mul(M.map((v) => v / D), A));
}

/** True when every frame corner sees the photo (no empty edges). */
export function covers(view: Mat3, w: number, h: number, pw: number, ph: number) {
  const pts: [number, number][] = [[0, 0], [w, 0], [w, h], [0, h], [w / 2, 0], [w / 2, h], [0, h / 2], [w, h / 2]];
  return pts.every((p) => {
    const [x, y] = apply(view, p);
    return x >= 0 && y >= 0 && x <= pw && y <= ph;
  });
}

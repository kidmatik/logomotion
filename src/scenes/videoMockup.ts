/**
 * Video mockups: rendered device clips (a phone or a laptop on a desk, with a
 * real camera move) where the screen shows the brand. Each clip has its plate
 * stacked over its screen matte in one video, plus the screen's corners for
 * every frame, so the design stays locked to the screen while the camera moves.
 * The screen's glass reflections are kept by screen-blending the plate on top.
 */
import { bestOn, hexToRgb, mix } from "../brand/color";
import { clamp, ease, seg, type ParamDef, type RenderCtx, type SceneDef } from "../engine/kit";
import { drawVideoMockup } from "../mockup/gl";
import type { Mat3, Quad } from "../mockup/geometry";
import { brandSurface } from "./studioMockup";

interface VideoMockup {
  id: string;
  name: string;
  fps: number;
  frames: number;
  aspect: number;
  clip: string;
  corners: (Quad | null)[];
}

const BASE = "/mockups/studio/video/";
let list: VideoMockup[] | null = null;
let loading: Promise<VideoMockup[]> | null = null;
const els = new Map<string, HTMLVideoElement>();

function loadList() {
  if (!loading)
    loading = fetch(BASE + "index.json")
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
      .then((l: VideoMockup[]) => {
        list = Array.isArray(l) ? l : [];
        const p = params[0];
        if (p.type === "select") p.options.splice(0, p.options.length, ...list.map((m) => ({ value: m.id, label: m.name })));
        return list;
      });
  return loading;
}

function clip(m: VideoMockup) {
  let el = els.get(m.id);
  if (!el) {
    el = document.createElement("video");
    el.muted = true;
    el.playsInline = true;
    el.preload = "auto";
    el.loop = true;
    el.src = `${BASE}${m.id}/${m.clip}`;
    el.load();
    els.set(m.id, el);
  }
  return el;
}

/** Load the list and the clips a project uses (before export). */
export async function preloadVideoMockups(ids: string[]) {
  const l = await loadList();
  await Promise.all(
    l
      .filter((m) => ids.includes(m.id))
      .map((m) => {
        const el = clip(m);
        if (el.readyState >= 2) return;
        return new Promise<void>((res) => {
          el.addEventListener("loadeddata", () => res(), { once: true });
          el.addEventListener("error", () => res(), { once: true });
        });
      }),
  );
}

const roles = [
  { value: "primary", label: "Primary" },
  { value: "secondary", label: "Secondary" },
  { value: "black", label: "Black" },
  { value: "white", label: "White" },
];

const params: ParamDef[] = [
  { key: "base", label: "Clip", type: "select", default: "phone-desk", options: [] },
  { key: "start", label: "Start at", type: "number", default: 0, min: 0, max: 8, step: 0.1, unit: "s", help: "Which part of the camera move to use." },
  { key: "fill", label: "Screen colour", type: "select", default: "primary", group: "Design", options: roles },
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
  { key: "grade", label: "Brand colour grade", type: "number", default: 0, min: 0, max: 100, step: 1, unit: "%", group: "Look" },
];

if (typeof window !== "undefined") loadList();

const rgb01 = (hex: string): [number, number, number] => {
  const { r, g, b } = hexToRgb(hex);
  return [r / 255, g / 255, b / 255];
};

const designs = new Map<string, HTMLCanvasElement>();

export const videoMockupScene: SceneDef = {
  type: "videomockup",
  name: "Video mockup",
  description: "A phone or laptop on a desk with a real camera move, its screen showing your brand.",
  defaultDuration: 4,
  minDuration: 1,
  maxDuration: 10,
  params,
  render(rc: RenderCtx, t, _duration, p) {
    const { ctx, w, h } = rc;
    if (!list) {
      rc.fill(mix(rc.colors.white, rc.colors.black, 0.06));
      return;
    }
    const m = list.find((x) => x.id === p.base) ?? list[0];
    if (!m) {
      rc.fill(mix(rc.colors.white, rc.colors.black, 0.06));
      rc.text("Video mockups aren't installed", w / 2, h / 2, 26 * rc.u, mix(rc.colors.white, rc.colors.black, 0.55), { align: "center", baseline: "middle" });
      return;
    }
    const el = clip(m);
    const len = m.frames / m.fps;
    const want = (Number(p.start ?? 0) + Math.max(0, t)) % len;
    rc.videoRequests.push({ el, time: want });
    if (el.readyState < 2) {
      rc.fill(mix(rc.colors.white, rc.colors.black, 0.06));
      return;
    }

    const fill = rc.role(p.fill || "primary");
    const pool = [rc.colors.white, rc.colors.black, rc.colors.primary, rc.colors.secondary].filter((c) => c !== fill);
    const ink = p.ink && p.ink !== "auto" ? rc.role(p.ink) : bestOn(fill, pool);
    const content = String(p.content || "stacked");
    const key = [m.aspect, fill, ink, content, rc.assets.logo?.id ?? 0, rc.brand.name, rc.brand.font.family, rc.brand.font.weight].join("|");
    let design = designs.get(key);
    if (!design) {
      design = brandSurface(rc, m.aspect, false, fill, ink, content);
      designs.set(key, design);
      if (designs.size > 6) designs.delete(designs.keys().next().value!);
    }

    // Corners follow the frame actually on screen, so the design never slides.
    const f = clamp(Math.round(el.currentTime * m.fps), 0, m.corners.length - 1);
    const corners = m.corners[f];
    // Cover-fit the 16:9 clip into any format, centred on the screen.
    const cw = 1920, ch = 1080;
    const s = Math.max(w / cw, h / ch);
    let fx = cw / 2, fy = ch / 2;
    if (corners) {
      fx = (corners.reduce((a, c) => a + c[0], 0) / 4) * cw;
      fy = (corners.reduce((a, c) => a + c[1], 0) / 4) * ch;
    }
    const hw = w / 2 / s, hh = h / 2 / s;
    const cx = clamp(fx, hw, cw - hw), cy = clamp(fy, hh, ch - hh);
    // Output px -> clip uv.
    const view: Mat3 = [1 / s / cw, 0, (cx - hw) / cw, 0, 1 / s / ch, (cy - hh) / ch, 0, 0, 1];
    const reveal = ease.outCubic(seg(t, 0.1, 0.6));
    const ok = drawVideoMockup(ctx, w, h, {
      video: el,
      design,
      view,
      corners,
      reveal,
      grade: Number(p.grade ?? 0) / 100,
      gradeDark: rgb01(mix(rc.colors.black, rc.colors.primary, 0.25)),
      gradeLight: rgb01(mix(rc.colors.white, rc.colors.primary, 0.35)),
    });
    if (!ok) rc.fill(fill);
  },
};

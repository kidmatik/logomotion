/**
 * Mockup montage: a fast run of cuts across the mockup photos (people wearing
 * and holding the brand, then products), each shot with its own whip-in and 3D
 * swing, so it plays like an edit rather than a slideshow.
 */
import { clamp, type ParamDef, type SceneDef } from "../engine/kit";
import type { CameraStyle } from "../mockup/camera";
import { MOCKUPS } from "../mockup/library";
import { renderMockup } from "./mockup";

const params: ParamDef[] = [
  {
    key: "set",
    label: "Photos",
    type: "select",
    default: "mix",
    options: [
      { value: "mix", label: "People and products" },
      { value: "people", label: "People wearing and holding it" },
      { value: "products", label: "Products only" },
    ],
  },
  {
    key: "pace",
    label: "Cut every",
    type: "select",
    default: "0.5",
    options: [
      { value: "0.35", label: "Very fast (0.35s)" },
      { value: "0.5", label: "Fast (0.5s)" },
      { value: "0.75", label: "Medium (0.75s)" },
      { value: "1.1", label: "Relaxed (1.1s)" },
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
      { value: "suggested", label: "Suggested per photo" },
      { value: "primary", label: "Primary" },
      { value: "secondary", label: "Secondary" },
      { value: "black", label: "Black" },
      { value: "white", label: "White" },
      { value: "original", label: "Logo's own colours" },
    ],
  },
  { key: "flash", label: "Flash on cuts", type: "boolean", default: true, group: "Motion" },
  { key: "grade", label: "Brand colour grade", type: "number", default: 20, min: 0, max: 100, step: 1, unit: "%", group: "Look", help: "Tints every photo towards your brand colours so the run feels like one campaign." },
];

const SHOT_STYLES: CameraStyle[] = ["snap", "snapClose", "snap", "snapLow"];

export function montageList(set: string) {
  const people = MOCKUPS.filter((m) => m.kind === "people");
  const products = MOCKUPS.filter((m) => m.kind !== "people");
  if (set === "people") return people;
  if (set === "products") return products;
  // Interleave: person, product, person...
  const out = [];
  for (let i = 0; i < Math.max(people.length, products.length); i++) {
    if (people[i]) out.push(people[i]);
    if (products[i]) out.push(products[i]);
  }
  return out;
}

export const montageScene: SceneDef = {
  type: "montage",
  name: "Mockup montage",
  description: "Fast cuts across mockup photos: people wearing and holding your brand, then products, each with a whip-in and a 3D swing.",
  defaultDuration: 4,
  minDuration: 1,
  maxDuration: 12,
  params,
  render(rc, t, duration, p) {
    const list = montageList(String(p.set || "mix"));
    if (!list.length) return rc.fill(rc.colors.black);
    const pace = Number(p.pace) || 0.5;
    const n = Math.max(1, Math.round(duration / pace));
    const len = duration / n;
    const i = clamp(Math.floor(t / len), 0, n - 1);
    const local = t - i * len;
    const def = list[i % list.length];
    const style = SHOT_STYLES[i % SHOT_STYLES.length];
    renderMockup(
      rc,
      local,
      len,
      { ...p, material: "suggested", reveal: "fade", sweep: true, size: 100, offsetY: 0, strength: 60 },
      def.id,
      { camera: style, mirror: i % 2 ? -1 : 1, revealTime: i === 0 ? Math.min(0.4, len * 0.6) : 0 },
    );
    // A quick white pop on each cut.
    if (p.flash !== false && i > 0 && local < 0.05) {
      rc.ctx.save();
      rc.ctx.globalAlpha = 0.35 * (1 - local / 0.05);
      rc.fill("#FFFFFF");
      rc.ctx.restore();
    }
  },
};

/**
 * The built-in mockup photos. Each one is a blank product photo plus where the
 * logo goes: a four-point quad on the surface (normalised to the photo), the
 * real surface's shape, and the material that suits it. Lighting and texture
 * come from the photo itself, so any logo picks them up.
 */
import type { Quad } from "./geometry";
import type { Project } from "../types";

export type MaterialId = "print" | "emboss" | "deboss" | "foil" | "spotuv" | "neon" | "embroidery" | "engrave";

export const MATERIALS: { value: MaterialId; label: string; help: string }[] = [
  { value: "print", label: "Print", help: "Ink printed on the surface; it follows the folds and texture." },
  { value: "emboss", label: "Emboss", help: "Raised into the surface, no ink. Best on paper and card." },
  { value: "deboss", label: "Deboss", help: "Pressed into the surface, no ink." },
  { value: "foil", label: "Foil", help: "Metallic foil that catches a moving light." },
  { value: "spotuv", label: "Spot gloss", help: "Clear gloss varnish: only the shine shows." },
  { value: "neon", label: "Neon", help: "Glowing tubes along the logo's outline, for walls and signs." },
  { value: "embroidery", label: "Embroidery", help: "Stitched thread with a raised edge, for caps and clothing." },
  { value: "engrave", label: "Engrave", help: "Cut or burnt into wood, metal or stone." },
];

export interface MockupDef {
  id: string;
  name: string;
  /** Photo URL, served from /public/mockups. */
  src: string;
  /** Where the logo area sits on the photo, normalised 0..1, TL TR BR BL. */
  quad: Quad;
  /** Real width/height of the logo area (0 = estimate from the quad). */
  aspect: number;
  /** Cylinder wrap: half the visible angle in radians (cups, bottles). 0 = flat. */
  bend?: number;
  /** How much horizontal lines curve on a cylinder seen from above (+) or below (-). */
  arc?: number;
  material: MaterialId;
  /** Where light comes from on the surface, roughly (x right, y down). */
  light: [number, number];
  /** The point the camera frames and pushes towards (normalised). Defaults to the quad's centre. */
  focus?: [number, number];
  /** How much of the logo area the logo fills (0..1). */
  fit: number;
  /** Suggested logo colour: a brand role, or "auto" to pick for contrast with the surface. */
  ink: "auto" | "primary" | "secondary" | "black" | "white" | "original";
  /** Neon and similar looks darken the photo for a night feel. */
  night?: boolean;
  foilTone?: "gold" | "silver" | "copper";
}

const px = (w: number, h: number, pts: [number, number][]): Quad => pts.map(([x, y]) => [x / w, y / h]) as Quad;

/** The built-in pack: blank product photos generated for LogoMotion (Figma AI). */
export const MOCKUPS: MockupDef[] = [
  {
    id: "card",
    name: "Business card",
    src: "/mockups/card.jpg",
    quad: px(1024, 1024, [[212, 381], [756, 321], [813, 640], [248, 700]]),
    aspect: 1.75,
    material: "foil",
    light: [-0.7, -0.7],
    fit: 0.5,
    ink: "primary",
    foilTone: "gold",
  },
  {
    id: "storefront",
    name: "Shop sign",
    src: "/mockups/storefront.jpg",
    quad: px(1536, 1024, [[349, 131], [1188, 131], [1188, 302], [349, 302]]),
    aspect: 0,
    material: "print",
    light: [0, -1],
    focus: [0.5, 0.3],
    fit: 0.62,
    ink: "white",
  },
  {
    id: "tshirt",
    name: "T-shirt",
    src: "/mockups/tshirt.jpg",
    quad: px(1024, 1024, [[340, 250], [690, 250], [690, 520], [340, 520]]),
    aspect: 0,
    material: "print",
    light: [-0.5, -0.8],
    fit: 0.62,
    ink: "auto",
  },
  {
    id: "cup",
    name: "Coffee cup",
    src: "/mockups/cup.jpg",
    quad: px(1024, 1024, [[319, 380], [701, 380], [667, 760], [353, 760]]),
    aspect: 1.46,
    bend: 1.45,
    arc: 0.03,
    material: "print",
    light: [-1, -0.3],
    fit: 0.55,
    ink: "auto",
  },
  {
    id: "tote",
    name: "Tote bag",
    src: "/mockups/tote.jpg",
    quad: px(1024, 1024, [[262, 430], [748, 430], [752, 930], [266, 930]]),
    aspect: 0,
    material: "print",
    light: [-1, -0.4],
    focus: [0.5, 0.6],
    fit: 0.46,
    ink: "auto",
  },
  {
    id: "office",
    name: "Office wall",
    src: "/mockups/office.jpg",
    quad: px(1536, 1024, [[330, 150], [1206, 150], [1206, 510], [330, 510]]),
    aspect: 0,
    material: "print",
    light: [-1, -0.2],
    focus: [0.5, 0.42],
    fit: 0.6,
    ink: "primary",
  },
  {
    id: "billboard",
    name: "Billboard",
    src: "/mockups/billboard.jpg",
    quad: px(1536, 1024, [[243, 270], [1293, 265], [1318, 652], [222, 652]]),
    aspect: 0,
    material: "print",
    light: [-1, 0.2],
    focus: [0.5, 0.45],
    fit: 0.62,
    ink: "auto",
  },
  {
    id: "cap",
    name: "Cap",
    src: "/mockups/cap.jpg",
    quad: px(1024, 1024, [[300, 290], [724, 290], [732, 560], [292, 560]]),
    aspect: 1.75,
    bend: 0.85,
    arc: -0.02,
    material: "embroidery",
    light: [-0.6, -0.8],
    focus: [0.5, 0.45],
    fit: 0.5,
    ink: "auto",
  },
];

export const mockupById = (id: string) => MOCKUPS.find((m) => m.id === id);

/* ---------- photo loading, shared by every mockup scene ---------- */

const cache = new Map<string, HTMLImageElement>();
const listeners = new Set<() => void>();

/** Subscribe to "a mockup photo finished loading" so the preview can redraw. */
export function onMockupAsset(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** The photo if it is ready; starts loading it otherwise. */
export function mockupPhoto(src: string): HTMLImageElement | null {
  let img = cache.get(src);
  if (!img) {
    img = new Image();
    img.decoding = "async";
    img.onload = () => listeners.forEach((f) => f());
    img.src = src;
    cache.set(src, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/** Wait until every given photo has loaded (used before exporting). */
export async function preloadMockupPhotos(srcs: string[]) {
  await Promise.all(
    srcs.map(
      (src) =>
        new Promise<void>((resolve) => {
          const img = cache.get(src);
          if (img && img.complete) return resolve();
          mockupPhoto(src);
          const el = cache.get(src)!;
          el.addEventListener("load", () => resolve(), { once: true });
          el.addEventListener("error", () => resolve(), { once: true });
        }),
    ),
  );
}

/** Load every pack photo the project's mockup scenes use. */
export function preloadProjectMockups(project: Project) {
  const srcs = project.scenes
    .filter((s) => s.enabled && s.type === "mockup" && s.params.base !== "custom")
    .map((s) => (mockupById(String(s.params.base)) ?? MOCKUPS[0])?.src)
    .filter((x): x is string => !!x);
  return preloadMockupPhotos([...new Set(srcs)]);
}

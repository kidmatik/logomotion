/**
 * Photo scenes: a slideshow and a bento grid. Both read the photo library,
 * keep each image's focal point in frame at any format, and can apply a brand
 * colour treatment so stock photos sit inside the identity.
 */
import { bestOn, mix, rgba } from "../brand/color";
import { creditLine } from "../brand/stock";
import { clamp, ease, lerp, seg, type ParamDef, type RenderCtx, type SceneDef, type Treatment } from "../engine/kit";
import type { ParamValue } from "../types";

export type Span = "auto" | "1x1" | "2x1" | "1x2" | "2x2";
export interface GalleryItem {
  id: string;
  span: Span;
}

export function parseGallery(v: ParamValue | undefined): GalleryItem[] {
  if (typeof v !== "string" || !v) return [];
  try {
    const arr = JSON.parse(v);
    return Array.isArray(arr) ? arr.filter((x) => x && typeof x.id === "string").map((x) => ({ id: x.id, span: x.span ?? "auto" })) : [];
  } catch {
    return [];
  }
}

/** The photos a scene shows: its own picks, or every photo in the library when none are picked. */
function photosFor(rc: RenderCtx, v: ParamValue | undefined): GalleryItem[] {
  const picked = parseGallery(v).filter((g) => rc.assets.media.has(g.id));
  if (picked.length) return picked;
  return [...rc.assets.mediaInfo.values()].filter((m) => m.use === "photo" && rc.assets.media.has(m.id)).map((m) => ({ id: m.id, span: "auto" as Span }));
}

const treatmentParam: ParamDef = {
  key: "treatment",
  label: "Colour treatment",
  type: "select",
  default: "none",
  options: [
    { value: "none", label: "Original colours" },
    { value: "duotone", label: "Duotone (Black + accent)" },
    { value: "tint", label: "Brand tint" },
    { value: "mono", label: "Black and white" },
  ],
};

const accentParam: ParamDef = { key: "accent", label: "Accent colour", type: "role", default: "primary", roles: ["primary", "secondary"] };

const captionParam: ParamDef = {
  key: "caption",
  label: "Caption",
  type: "select",
  default: "none",
  options: [
    { value: "none", label: "None" },
    { value: "tagline", label: "Tagline" },
    { value: "website", label: "Website" },
    { value: "name", label: "Brand name" },
  ],
};

function captionFor(rc: RenderCtx, v: ParamValue) {
  return v === "tagline" ? rc.brand.tagline : v === "website" ? rc.brand.website : v === "name" ? rc.brand.name : "";
}

function emptyState(rc: RenderCtx, bg: string) {
  rc.fill(bg);
  const ink = bestOn(bg, [rc.colors.black, rc.colors.white]);
  rc.drawLogo(rc.w / 2, rc.h / 2 - 50 * rc.u, rc.logoHeight(140), rc.colors.primary);
  rc.text("Add photos in the Media tab", rc.w / 2, rc.h / 2 + 90 * rc.u, 32 * rc.u, ink, { align: "center", alpha: 0.6, family: `"Inter", system-ui` });
}

/** Small "Photo by …" line in the corner, for licences that ask for attribution. */
function drawCredits(rc: RenderCtx, ids: string[], x: number, y: number, color: string, align: CanvasTextAlign = "right") {
  const lines = [...new Set(ids.map((id) => rc.mediaInfo(id)?.credit).filter(Boolean).map((c) => creditLine(c!)))];
  if (!lines.length) return;
  rc.text(lines.join(" · "), x, y, 15 * rc.u, color, { align, alpha: 0.7, family: `"Inter", system-ui`, weight: 500 });
}

/* ============================== Slideshow ============================== */

type SlideAnim = "kenburns" | "push" | "zoom" | "reveal" | "split" | "stack" | "blinds";

export const slideshowScene: SceneDef = {
  type: "slideshow",
  name: "Photo slideshow",
  description: "Your photos one after another, with a choice of animated transitions, slow camera moves and brand colour treatments.",
  defaultDuration: 6,
  minDuration: 2,
  maxDuration: 30,
  params: [
    { key: "images", label: "Photos", type: "gallery", default: "" },
    {
      key: "animation",
      label: "Animation",
      type: "select",
      default: "kenburns",
      options: [
        { value: "kenburns", label: "Ken Burns (slow zoom + crossfade)" },
        { value: "push", label: "Push (slide across)" },
        { value: "zoom", label: "Zoom through" },
        { value: "reveal", label: "Brand wipe (colour panel)" },
        { value: "split", label: "Split strips" },
        { value: "blinds", label: "Blinds" },
        { value: "stack", label: "Stacked prints" },
      ],
    },
    {
      key: "frame",
      label: "Framing",
      type: "select",
      default: "full",
      options: [
        { value: "full", label: "Full bleed" },
        { value: "inset", label: "Inset card" },
      ],
    },
    { key: "background", label: "Background (inset)", type: "role", default: "white" },
    treatmentParam,
    accentParam,
    { key: "showLogo", label: "Logo badge on photos", type: "boolean", default: true },
    captionParam,
    { key: "credits", label: "Show photo credits", type: "boolean", default: true },
  ],
  render(rc, t, duration, p) {
    const { ctx, w, h, u } = rc;
    const bg = rc.role(p.background);
    const photos = photosFor(rc, p.images);
    if (!photos.length) return emptyState(rc, bg);

    const anim = String(p.animation) as SlideAnim;
    const treatment = String(p.treatment) as Treatment;
    const accent = rc.role(p.accent);
    const n = photos.length;
    const d = duration / n;
    const i = Math.min(n - 1, Math.floor(t / d));
    const local = t - i * d;
    const TT = Math.min(0.7, d * 0.45);
    const e = i > 0 ? ease.inOutCubic(clamp(local / TT)) : 1;

    const inset = p.frame === "inset" || anim === "stack";
    const pad = inset ? Math.min(w, h) * 0.08 : 0;
    const box = { x: pad, y: pad, w: w - pad * 2, h: h - pad * 2 - (inset && p.caption !== "none" ? 70 * u : 0) };
    const radius = inset ? 26 * u : 0;
    rc.fill(inset ? bg : rc.colors.black);

    // One slide: the photo with a slow camera move across its whole time on screen.
    const slide = (k: number, lt: number, alpha = 1, scale = 1, dx = 0, dy = 0) => {
      const item = photos[k];
      const life = clamp((lt + TT) / (d + TT));
      const dir = k % 2 ? -1 : 1;
      const zoom = anim === "kenburns" || anim === "reveal" ? lerp(1.04, 1.16, life) : lerp(1.02, 1.08, life);
      ctx.save();
      ctx.globalAlpha *= alpha;
      ctx.translate(box.x + box.w / 2 + dx, box.y + box.h / 2 + dy);
      ctx.scale(scale, scale);
      ctx.translate(-box.w / 2, -box.h / 2);
      if (radius) {
        rc.roundRect(0, 0, box.w, box.h, radius);
        ctx.clip();
      }
      rc.drawCover(item.id, 0, 0, box.w, box.h, { zoom, panX: dir * lerp(-1, 1, life), panY: lerp(-0.5, 0.5, life) * dir, treatment, tint: accent, time: lt + TT });
      ctx.restore();
    };

    if (anim === "stack") {
      // Earlier prints stay underneath, slightly rotated, like photos dropped on a table.
      for (let k = Math.max(0, i - 2); k < i; k++) {
        const rot = ((k * 37) % 7 - 3) * 0.02;
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.rotate(rot);
        ctx.translate(-w / 2, -h / 2);
        ctx.shadowColor = "rgba(0,0,0,0.25)";
        ctx.shadowBlur = 30 * u;
        ctx.fillStyle = "#fff";
        rc.roundRect(box.x - 10 * u, box.y - 10 * u, box.w + 20 * u, box.h + 20 * u, radius + 6 * u);
        ctx.fill();
        ctx.shadowColor = "transparent";
        slide(k, d);
        ctx.restore();
      }
      const drop = ease.outCubic(clamp(local / TT));
      const rot = ((i * 37) % 7 - 3) * 0.02 * drop;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(rot + (1 - drop) * 0.15);
      const sc = lerp(1.25, 1, drop);
      ctx.scale(sc, sc);
      ctx.translate(-w / 2, -h / 2);
      ctx.globalAlpha = drop;
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur = 40 * u;
      ctx.fillStyle = "#fff";
      rc.roundRect(box.x - 10 * u, box.y - 10 * u, box.w + 20 * u, box.h + 20 * u, radius + 6 * u);
      ctx.fill();
      ctx.shadowColor = "transparent";
      slide(i, local);
      ctx.restore();
    } else if (e >= 1 || i === 0) {
      // Opening slide fades/zooms in from the scene start.
      const intro = ease.outCubic(clamp(t / 0.6));
      slide(i, local, i === 0 ? intro : 1, i === 0 ? lerp(1.04, 1, intro) : 1);
    } else {
      const prevT = d + local;
      switch (anim) {
        case "push":
          slide(i - 1, prevT, 1, 1, -(box.w + pad) * e, 0);
          slide(i, local, 1, 1, (box.w + pad) * (1 - e), 0);
          break;
        case "zoom":
          slide(i - 1, prevT, 1 - e, 1 + 0.5 * e);
          slide(i, local, e, 0.85 + 0.15 * e);
          break;
        case "reveal": {
          // A brand-coloured panel sweeps across, then pulls away to reveal the next photo.
          const cover = ease.inOutCubic(clamp(local / (TT * 0.5)));
          const uncover = ease.inOutCubic(clamp((local - TT * 0.5) / (TT * 0.5)));
          if (uncover <= 0) slide(i - 1, prevT);
          else slide(i, local);
          ctx.save();
          if (radius) {
            rc.roundRect(box.x, box.y, box.w, box.h, radius);
            ctx.clip();
          }
          ctx.fillStyle = accent;
          const x0 = box.x + box.w * uncover, x1 = box.x + box.w * cover;
          ctx.fillRect(x0, box.y, x1 - x0, box.h);
          if (cover > 0.5 && uncover < 0.8) rc.drawLogo((x0 + x1) / 2, box.y + box.h / 2, rc.logoHeight(120), bestOn(accent, [rc.colors.white, rc.colors.black]), { knockout: true, alpha: clamp((x1 - x0) / (box.w * 0.4)) });
          ctx.restore();
          break;
        }
        case "split":
        case "blinds": {
          slide(i - 1, prevT);
          const strips = anim === "split" ? 5 : 8;
          for (let s = 0; s < strips; s++) {
            const k = ease.outCubic(clamp((local - s * (TT / strips) * 0.6) / (TT * 0.6)));
            if (k <= 0) continue;
            ctx.save();
            ctx.beginPath();
            if (anim === "split") {
              const sw = box.w / strips;
              ctx.rect(box.x + s * sw, box.y + box.h * (1 - k) * (s % 2 ? -1 : 1), sw + 1, box.h);
            } else {
              const sh = box.h / strips;
              ctx.rect(box.x, box.y + s * sh, box.w, sh * k + 1);
            }
            ctx.clip();
            slide(i, local);
            ctx.restore();
          }
          break;
        }
        default:
          slide(i - 1, prevT);
          slide(i, local, e);
      }
    }

    // Brand overlays.
    const onPhotoInk = rc.colors.white;
    if (p.showLogo) {
      const lh = rc.logoHeight(54);
      const lx = box.x + 40 * u + rc.logoWidth(lh) / 2, ly = box.y + 40 * u + lh / 2;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = 16 * u;
      rc.drawLogo(lx, ly, lh, inset ? onPhotoInk : onPhotoInk, { knockout: true, alpha: clamp(t / 0.5) });
      ctx.restore();
    }
    const cap = captionFor(rc, p.caption);
    if (cap) {
      const a = ease.outCubic(seg(t, 0.3, 0.9));
      if (inset) {
        rc.text(cap, w / 2, h - pad - 18 * u, 40 * u, bestOn(bg, [rc.colors.black, rc.colors.white]), { align: "center", alpha: a });
      } else {
        const g = ctx.createLinearGradient(0, h * 0.6, 0, h);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(1, rgba(rc.colors.black, 0.65 * a));
        ctx.fillStyle = g;
        ctx.fillRect(0, h * 0.6, w, h * 0.4);
        rc.text(cap, 60 * u, h - 70 * u + (1 - a) * 20 * u, 54 * u, onPhotoInk, { alpha: a });
      }
    }
    if (p.credits) {
      const ids = [photos[i].id];
      if (inset) drawCredits(rc, ids, w - pad, h - pad * 0.4, bestOn(bg, [rc.colors.black, rc.colors.white]));
      else drawCredits(rc, ids, w - 30 * u, h - 26 * u, onPhotoInk);
    }
  },
};

/* ============================== Bento grid ============================== */

interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Photo id, or a brand tile index when negative. */
  id: string | null;
  tile: number;
}

function gridFor(w: number, h: number) {
  const r = w / h;
  if (r > 1.3) return { cols: 4, rows: 3 };
  if (r > 0.9) return { cols: 3, rows: 3 };
  if (r > 0.7) return { cols: 3, rows: 4 };
  return { cols: 2, rows: 4 };
}

function spanFor(item: GalleryItem, index: number, rc: RenderCtx, cols: number, rows: number): [number, number] {
  let s = item.span;
  if (s === "auto") {
    const info = rc.mediaInfo(item.id);
    const r = info ? info.width / Math.max(1, info.height) : 1;
    s = index === 0 ? "2x2" : r > 1.45 ? "2x1" : r < 0.75 ? "1x2" : "1x1";
  }
  const [a, b] = s.split("x").map(Number);
  return [Math.min(a, cols), Math.min(b, rows)];
}

/** Pack photos into the grid first-fit, then fill the gaps with brand tiles. */
function layout(rc: RenderCtx, items: GalleryItem[], brandTiles: boolean, gap: number, pad: number, bottom = 0): Cell[] {
  const { cols, rows } = gridFor(rc.w, rc.h);
  const used: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
  const placed: { c: number; r: number; sw: number; sh: number; id: string | null; tile: number }[] = [];
  const fits = (c: number, r: number, sw: number, sh: number) => {
    if (c + sw > cols || r + sh > rows) return false;
    for (let y = r; y < r + sh; y++) for (let x = c; x < c + sw; x++) if (used[y][x]) return false;
    return true;
  };
  const place = (sw: number, sh: number) => {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (fits(c, r, sw, sh)) return { c, r };
    return null;
  };
  const mark = (c: number, r: number, sw: number, sh: number) => {
    for (let y = r; y < r + sh; y++) for (let x = c; x < c + sw; x++) used[y][x] = true;
  };
  items.forEach((it, i) => {
    let [sw, sh] = spanFor(it, i, rc, cols, rows);
    let spot = place(sw, sh);
    if (!spot) {
      sw = 1;
      sh = 1;
      spot = place(1, 1);
    }
    if (!spot) return;
    mark(spot.c, spot.r, sw, sh);
    placed.push({ ...spot, sw, sh, id: it.id, tile: 0 });
  });
  // Fill what's left: brand tiles, or repeat photos so the grid never has holes.
  let t = 0;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (used[r][c]) continue;
      // Merge a free pair into a wide tile when possible, for calmer rhythm.
      const wide = c + 1 < cols && !used[r][c + 1] && t % 2 === 0;
      const sw = wide ? 2 : 1;
      mark(c, r, sw, 1);
      placed.push({ c, r, sw, sh: 1, id: brandTiles || !items.length ? null : items[t % items.length].id, tile: t++ });
    }
  const cw = (rc.w - pad * 2 - gap * (cols - 1)) / cols;
  const ch = (rc.h - pad * 2 - bottom - gap * (rows - 1)) / rows;
  return placed.map((p) => ({
    x: pad + p.c * (cw + gap),
    y: pad + p.r * (ch + gap),
    w: p.sw * cw + (p.sw - 1) * gap,
    h: p.sh * ch + (p.sh - 1) * gap,
    id: p.id,
    tile: p.tile,
  }));
}

function brandTile(rc: RenderCtx, cell: Cell) {
  const { ctx } = rc;
  const c = rc.colors;
  const kinds = [
    () => {
      ctx.fillStyle = c.primary;
      ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
      rc.drawLogo(cell.x + cell.w / 2, cell.y + cell.h / 2, Math.min(cell.w, cell.h) * 0.42 * rc.brand.logoScale, bestOn(c.primary, [c.white, c.black]), { knockout: true });
    },
    () => {
      ctx.fillStyle = c.black;
      ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
      const size = Math.min(cell.h * 0.3, (cell.w * 0.8) / Math.max(4, rc.brand.name.length * 0.55));
      const m = rc.measureWordmark(size);
      rc.drawWordmark(cell.x + cell.w / 2 - m.w / 2, cell.y + cell.h / 2, size, c.white);
    },
    () => {
      ctx.fillStyle = c.secondary;
      ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
      rc.drawLogoOutline(cell.x + cell.w / 2, cell.y + cell.h / 2, Math.min(cell.w, cell.h) * 0.5, bestOn(c.secondary, [c.black, c.white]));
    },
    () => {
      ctx.fillStyle = mix(c.white, c.primary, 0.08);
      ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
      const txt = rc.brand.tagline || rc.brand.website;
      const size = Math.min(cell.h * 0.16, (cell.w * 0.85) / Math.max(6, txt.length * 0.5));
      rc.text(txt, cell.x + cell.w / 2, cell.y + cell.h / 2, size, c.black, { align: "center", baseline: "middle" });
    },
  ];
  kinds[cell.tile % kinds.length]();
}

type BentoAnim = "pop" | "rise" | "mask" | "cascade" | "shuffle" | "zoomout";

export const bentoScene: SceneDef = {
  type: "bento",
  name: "Bento grid",
  description: "Photos arranged in a bento grid that adapts to every format. Set each photo's tile size, mix in brand tiles, and pick how the tiles animate in.",
  defaultDuration: 4,
  minDuration: 2,
  maxDuration: 15,
  params: [
    { key: "images", label: "Photos and tile sizes", type: "gallery", default: "", spans: true },
    {
      key: "animation",
      label: "Animation",
      type: "select",
      default: "pop",
      options: [
        { value: "pop", label: "Pop in" },
        { value: "rise", label: "Rise up" },
        { value: "mask", label: "Mask reveal" },
        { value: "cascade", label: "Diagonal cascade" },
        { value: "shuffle", label: "Shuffle in" },
        { value: "zoomout", label: "Zoom out from hero" },
      ],
    },
    { key: "motion", label: "Slow motion inside tiles", type: "boolean", default: true },
    { key: "brandTiles", label: "Fill gaps with brand tiles", type: "boolean", default: true },
    { key: "background", label: "Background", type: "role", default: "white" },
    { key: "gap", label: "Gap", type: "number", default: 14, min: 0, max: 48, step: 1, unit: "px" },
    { key: "radius", label: "Corner radius", type: "number", default: 22, min: 0, max: 60, step: 1, unit: "px" },
    treatmentParam,
    accentParam,
    { key: "credits", label: "Show photo credits", type: "boolean", default: true },
  ],
  render(rc, t, duration, p) {
    const { ctx, w, h, u } = rc;
    const bg = rc.role(p.background);
    const photos = photosFor(rc, p.images);
    if (!photos.length && !p.brandTiles) return emptyState(rc, bg);
    rc.fill(bg);
    const gap = Number(p.gap) * u;
    const pad = Math.max(gap, 24 * u);
    const radius = Number(p.radius) * u;
    const hasCredits = Boolean(p.credits) && photos.some((g) => rc.mediaInfo(g.id)?.credit);
    const cells = layout(rc, photos, Boolean(p.brandTiles), gap, pad, hasCredits ? 26 * u : 0);
    const anim = String(p.animation) as BentoAnim;
    const treatment = String(p.treatment) as Treatment;
    const accent = rc.role(p.accent);
    const life = seg(t, 0, duration);

    // Hero (first, largest) cell for the zoom-out animation.
    const hero = cells.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a), cells[0]);

    cells.forEach((cell, i) => {
      const order = anim === "cascade" ? (cell.x / w + cell.y / h) * 0.9 : i * 0.09;
      const start = anim === "zoomout" ? (cell === hero ? 0 : 0.7 + order * 0.5) : 0.05 + order;
      const k = seg(t, start, start + 0.55);
      if (k <= 0) return;
      const eo = ease.outCubic(k);
      ctx.save();
      let alpha = 1;
      const cx = cell.x + cell.w / 2, cy = cell.y + cell.h / 2;
      switch (anim) {
        case "pop": {
          const s = ease.outBack(k);
          ctx.translate(cx, cy);
          ctx.scale(s, s);
          ctx.translate(-cx, -cy);
          break;
        }
        case "rise":
          ctx.translate(0, (1 - eo) * 120 * u);
          alpha = eo;
          break;
        case "mask":
          ctx.beginPath();
          ctx.rect(cell.x, cell.y + cell.h * (1 - eo), cell.w, cell.h * eo + 1);
          ctx.clip();
          break;
        case "cascade":
          alpha = eo;
          ctx.translate(cx, cy);
          ctx.scale(lerp(0.92, 1, eo), lerp(0.92, 1, eo));
          ctx.translate(-cx, -cy);
          break;
        case "shuffle": {
          const ang = ((i * 97) % 360) * (Math.PI / 180);
          ctx.translate(Math.cos(ang) * (1 - eo) * w * 0.6, Math.sin(ang) * (1 - eo) * h * 0.6);
          ctx.translate(cx, cy);
          ctx.rotate((1 - eo) * (i % 2 ? 0.3 : -0.3));
          ctx.translate(-cx, -cy);
          break;
        }
        case "zoomout":
          alpha = cell === hero ? 1 : eo;
          break;
      }
      ctx.globalAlpha *= alpha;
      rc.roundRect(cell.x, cell.y, cell.w, cell.h, radius);
      ctx.clip();
      if (cell.id) {
        const drift = p.motion ? life : 0;
        const dir = i % 2 ? 1 : -1;
        const zoom = p.motion ? lerp(1.12, 1.02, ease.outCubic(seg(t, start, duration))) : 1;
        rc.drawCover(cell.id, cell.x, cell.y, cell.w, cell.h, { zoom, panX: dir * lerp(-0.6, 0.6, drift), panY: lerp(-0.3, 0.3, drift), treatment, tint: accent, time: t - start });
      } else {
        brandTile(rc, cell);
      }
      ctx.restore();
    });

    if (anim === "zoomout" && hero) {
      // Fake the camera pull-back by drawing the hero full-frame first, then shrinking it into place.
      const k = ease.inOutQuint(seg(t, 0.1, 1.0));
      if (k < 1 && hero.id) {
        const x = lerp(0, hero.x, k), y = lerp(0, hero.y, k), cw = lerp(w, hero.w, k), chh = lerp(h, hero.h, k);
        ctx.save();
        rc.roundRect(x, y, cw, chh, radius * k);
        ctx.clip();
        rc.drawCover(hero.id, x, y, cw, chh, { zoom: 1.12, treatment, tint: accent, time: t });
        ctx.restore();
      }
    }

    if (hasCredits) drawCredits(rc, cells.filter((c) => c.id).map((c) => c.id!), w - pad, h - pad - 4 * u, bestOn(bg, [rc.colors.black, rc.colors.white]));
  },
};

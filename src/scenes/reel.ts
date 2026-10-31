/**
 * "Brand Reel" scenes: short, punchy beats for a vertical social reel. Each
 * scene is built to hold up for only one to three seconds and to cut on a beat.
 */
import { bestOn, mix, rgba } from "../brand/color";
import { clamp, ease, lerp, seg, type ParamDef, type RenderCtx, type SceneDef } from "../engine/kit";
import type { ColorRole, ParamValue } from "../types";

const captionParam: ParamDef = {
  key: "caption",
  label: "Caption",
  type: "select",
  default: "website",
  options: [
    { value: "none", label: "None" },
    { value: "website", label: "Website" },
    { value: "credit", label: "Credit line" },
    { value: "handle", label: "Social handle" },
  ],
};

function captionText(rc: RenderCtx, v: ParamValue) {
  if (v === "website") return rc.brand.website;
  if (v === "credit") return rc.brand.credit;
  if (v === "handle") return rc.brand.handle ? "@" + rc.brand.handle : "";
  return "";
}

function inkOn(rc: RenderCtx, bg: string) {
  return bestOn(bg, [rc.colors.black, rc.colors.white]);
}

/* ------------------------------------------------------------------ */

export const blueprintScene: SceneDef = {
  type: "blueprint",
  name: "Blueprint build",
  description: "A design cursor drags out guides, the mark is drawn as line art, extrudes into 3D, then settles flat and solid.",
  defaultDuration: 3,
  minDuration: 2,
  maxDuration: 6,
  params: [
    { key: "background", label: "Background", type: "role", default: "primary" },
    { key: "cursor", label: "Cursor colour", type: "role", default: "secondary" },
    { key: "showCursor", label: "Show the cursor", type: "boolean", default: true },
  ],
  render(rc, t, duration, p) {
    const { ctx, w, h, u } = rc;
    const bg = rc.role(p.background);
    const ink = inkOn(rc, bg);
    rc.fill(bg);
    const L = rc.logoHeight(330);
    const lw = rc.logoWidth(L);
    const cx = w / 2, cy = h / 2;
    const x0 = cx - lw / 2, y0 = cy - L / 2;
    const T = duration;

    // Guides.
    const guideA = 1 - seg(t, T * 0.75, T * 0.9);
    ctx.save();
    ctx.strokeStyle = rgba(ink, 0.22 * guideA);
    ctx.lineWidth = Math.max(1, 1.4 * u);
    [y0, cy, y0 + L].forEach((y, i) => {
      const k = ease.outCubic(seg(t, 0.05 + i * 0.06, 0.6 + i * 0.06));
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w * k, y);
      ctx.stroke();
    });
    [x0, cx, x0 + lw].forEach((x, i) => {
      const k = ease.outCubic(seg(t, 0.1 + i * 0.06, 0.65 + i * 0.06));
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h * k);
      ctx.stroke();
    });
    ctx.restore();

    // Cursor drags a selection box around the mark.
    const drag = ease.inOutCubic(seg(t, 0.35, 1.0));
    const sel = { x: x0, y: y0, w: lw * drag, h: L * drag };
    if (drag > 0 && guideA > 0) {
      ctx.save();
      ctx.globalAlpha = guideA;
      ctx.strokeStyle = rc.role(p.cursor);
      ctx.lineWidth = 2 * u;
      ctx.strokeRect(sel.x, sel.y, sel.w, sel.h);
      const hs = 10 * u;
      ctx.fillStyle = "#FFFFFF";
      [[sel.x, sel.y], [sel.x + sel.w, sel.y], [sel.x, sel.y + sel.h], [sel.x + sel.w, sel.y + sel.h]].forEach(([x, y]) => {
        ctx.fillRect(x - hs / 2, y - hs / 2, hs, hs);
        ctx.strokeRect(x - hs / 2, y - hs / 2, hs, hs);
      });
      ctx.restore();
    }

    // Line art, revealed with a diagonal sweep.
    const draw = ease.inOutCubic(seg(t, 0.6, 1.4));
    const extrude = ease.inOutCubic(seg(t, 1.35, 1.9)) * (1 - ease.inOutCubic(seg(t, T * 0.72, T * 0.92)));
    const solid = ease.outCubic(seg(t, 1.35, 1.7));
    if (draw > 0 && solid < 1) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(w * 2 * draw, 0);
      ctx.lineTo(0, h * 2 * draw);
      ctx.closePath();
      ctx.clip();
      rc.drawLogoOutline(cx, cy, L, ink, 1 - solid);
      ctx.restore();
    }

    // Extrusion: stacked offset copies form the sides, then the face sits on top.
    if (solid > 0) {
      const depth = 46 * u * extrude;
      const steps = Math.ceil(depth / Math.max(1, 1.5 * u));
      const side = mix(ink, bg, 0.35);
      for (let i = steps; i > 0; i--) {
        const k = i / steps;
        rc.drawLogo(cx + depth * k * 0.7, cy + depth * k, L, mix(side, ink, 1 - k), { knockout: true, alpha: solid });
      }
      if (extrude > 0.01) {
        ctx.save();
        ctx.shadowColor = rgba("#000000", 0.25 * extrude);
        ctx.shadowBlur = 60 * u;
        ctx.shadowOffsetY = 40 * u;
        rc.drawLogo(cx, cy, L, ink, { alpha: solid, knockout: true });
        ctx.restore();
      } else {
        rc.drawLogo(cx, cy, L, ink, { alpha: solid, knockout: true });
      }
    }

    if (p.showCursor && guideA > 0) {
      const path = ease.inOutCubic(seg(t, 0, 0.35));
      const cxp = drag > 0 ? sel.x + sel.w : lerp(w * 0.85, x0, path);
      const cyp = drag > 0 ? sel.y + sel.h : lerp(h * 0.8, y0, path);
      const off = ease.inCubic(seg(t, 1.4, 2.0));
      ctx.save();
      ctx.globalAlpha = guideA;
      rc.drawCursor(cxp + off * w * 0.4, cyp + off * h * 0.3, 34 * u, rc.role(p.cursor));
      ctx.restore();
    }
  },
};

/* ------------------------------------------------------------------ */

export const wordbuildScene: SceneDef = {
  type: "wordbuild",
  name: "Word build",
  description: "Letters appear one by one as outlines on type guides, fill in, then the lockup flips onto the brand colour.",
  defaultDuration: 3,
  minDuration: 1.6,
  maxDuration: 6,
  params: [
    { key: "background", label: "Background", type: "role", default: "black" },
    { key: "flipTo", label: "Flip to", type: "role", default: "primary" },
    { key: "flip", label: "Flip colours at the end", type: "boolean", default: true },
  ],
  render(rc, t, duration, p) {
    const { ctx, w, h, u } = rc;
    const flipAt = duration * 0.72;
    const flipped = p.flip && t >= flipAt;
    const bg = rc.role(flipped ? p.flipTo : p.background);
    const ink = inkOn(rc, bg);
    rc.fill(bg);

    let size = rc.nameSize(0.95);
    let M = size * 0.95 * rc.brand.logoScale;
    let mw = rc.logoWidth(M);
    let gap = M * 0.3;
    let word = rc.measureWordmark(size);
    const fit = Math.min(1, (w * 0.84) / (mw + gap + word.w));
    size *= fit; M *= fit; mw *= fit; gap *= fit;
    word = rc.measureWordmark(size);
    const x0 = w / 2 - (mw + gap + word.w) / 2;
    const cy = h / 2;
    const tx = x0 + mw + gap;
    const markColor = flipped ? ink : rc.colors.primary;

    const settle = flipped ? 1 : 0;
    const markIn = ease.outBack(seg(t, 0, 0.35));
    rc.drawLogo(x0 + mw / 2, cy, M * markIn, settle ? ink : markColor);

    if (rc.usesLettermark) {
      const k = ease.outCubic(seg(t, 0.3, flipAt - 0.2));
      ctx.save();
      ctx.beginPath();
      ctx.rect(tx, 0, word.w * k, h);
      ctx.clip();
      rc.drawWordmark(tx, cy, size, ink);
      ctx.restore();
      return;
    }

    // Type guides (cap height, x-height, baseline).
    const guides = flipped ? 0 : 1 - seg(t, flipAt - 0.3, flipAt);
    if (guides > 0) {
      ctx.save();
      ctx.strokeStyle = rgba(ink, 0.18 * guides);
      ctx.lineWidth = Math.max(1, 1.2 * u);
      [-0.36, -0.12, 0.36].forEach((k, i) => {
        const g = ease.outCubic(seg(t, 0.1 + i * 0.05, 0.5 + i * 0.05));
        const y = cy + k * size;
        ctx.beginPath();
        ctx.moveTo(w / 2 - (w / 2) * g, y);
        ctx.lineTo(w / 2 + (w / 2) * g, y);
        ctx.stroke();
      });
      ctx.restore();
    }

    const name = rc.brand.name;
    ctx.save();
    ctx.font = rc.font(size);
    ctx.textBaseline = "middle";
    const span = Math.max(0.3, flipAt - 0.6);
    for (let i = 0; i < name.length; i++) {
      const start = 0.3 + (i / name.length) * span;
      const appear = seg(t, start, start + 0.08);
      if (appear <= 0) continue;
      const fill = flipped ? 1 : seg(t, start + 0.18, start + 0.4);
      const x = tx + ctx.measureText(name.slice(0, i)).width;
      const ch = name[i];
      ctx.lineWidth = Math.max(1, 1.6 * u);
      ctx.strokeStyle = rgba(ink, 0.7 * (1 - fill));
      ctx.strokeText(ch, x, cy + size * 0.04);
      ctx.fillStyle = rgba(ink, fill);
      ctx.fillText(ch, x, cy + size * 0.04);
    }
    ctx.restore();
  },
};

/* ------------------------------------------------------------------ */

export const assembleScene: SceneDef = {
  type: "assemble",
  name: "Assemble + glow",
  description: "The mark flies in as four pieces, locks together and lights up with a soft glow.",
  defaultDuration: 2,
  minDuration: 1.2,
  maxDuration: 5,
  params: [
    { key: "background", label: "Background", type: "role", default: "black" },
    { key: "mark", label: "Mark colour", type: "role", default: "primary" },
    captionParam,
  ],
  render(rc, t, duration, p) {
    const { ctx, w, h, u } = rc;
    const bg = rc.role(p.background);
    rc.fill(bg);
    const L = rc.logoHeight(300);
    const lw = rc.logoWidth(L);
    const cx = w / 2, cy = h / 2;
    const k = ease.outQuint(seg(t, 0, 0.8));
    const glow = ease.outCubic(seg(t, 0.7, 1.3));
    const color = rc.role(p.mark);

    // Ambient bloom behind the mark.
    if (glow > 0) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, L * 1.4);
      g.addColorStop(0, rgba(color, 0.35 * glow));
      g.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    const pieces: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    pieces.forEach(([sx, sy], i) => {
      const d = (1 - k) * 260 * u * (1 + i * 0.15);
      ctx.save();
      ctx.beginPath();
      ctx.rect(sx < 0 ? cx - lw : cx, sy < 0 ? cy - L : cy, lw, L);
      ctx.clip();
      ctx.translate(sx * d, sy * d);
      ctx.translate(cx, cy);
      ctx.rotate((1 - k) * 0.5 * sx * sy);
      ctx.translate(-cx, -cy);
      if (glow > 0) {
        ctx.shadowColor = rgba(color, 0.9);
        ctx.shadowBlur = 50 * u * glow;
      }
      rc.drawLogo(cx, cy, L, color, { alpha: clamp(k * 1.5) });
      ctx.restore();
    });

    const pulse = 1 + 0.02 * Math.sin(seg(t, 1.0, duration) * Math.PI);
    if (glow > 0) rc.drawLogo(cx, cy, L * pulse, mix(color, "#FFFFFF", 0.35), { alpha: glow * 0.35 });
    rc.caption(captionText(rc, p.caption), inkOn(rc, bg), seg(t, 0.8, 1.2) * 0.8);
  },
};

/* ------------------------------------------------------------------ */

export const stackScene: SceneDef = {
  type: "stack",
  name: "Palette cards",
  description: "Brand colours slide up as a stack of cards, each with its hex code.",
  defaultDuration: 2,
  minDuration: 1.2,
  maxDuration: 5,
  params: [{ key: "background", label: "Background", type: "role", default: "black" }],
  render(rc, t, _duration, p) {
    const { ctx, w, h, u } = rc;
    const bg = rc.role(p.background);
    rc.fill(bg);
    // Secondary, a blend, primary, then whichever neutral isn't the background.
    const c = rc.colors;
    const list = [c.secondary, mix(c.primary, c.secondary, 0.5), c.primary, bg === c.white ? c.black : c.white];
    const cw = Math.min(w * 0.64, 680 * u);
    const ch = 150 * u;
    const gap = 14 * u;
    const total = list.length * ch + (list.length - 1) * gap;
    const top = h / 2 - total / 2;
    list.forEach((color, i) => {
      const k = ease.outQuint(seg(t, i * 0.1, 0.55 + i * 0.1));
      if (k <= 0) return;
      const y = top + i * (ch + gap) + (1 - k) * h * 0.6;
      const x = w / 2 - cw / 2;
      ctx.fillStyle = color;
      rc.roundRect(x, y, cw, ch, 16 * u);
      ctx.fill();
      if (color.toUpperCase() === rc.colors.white.toUpperCase()) {
        ctx.strokeStyle = "rgba(0,0,0,0.08)";
        ctx.stroke();
      }
      rc.text(color.toUpperCase(), w / 2, y + ch / 2, 22 * u, bestOn(color, ["#000000", "#FFFFFF"]), { family: `"JetBrains Mono", ui-monospace, monospace`, align: "center", baseline: "middle", tracking: 0.06, alpha: seg(t, 0.4 + i * 0.1, 0.7 + i * 0.1) });
    });
  },
};

/* ------------------------------------------------------------------ */

function drawTile(rc: RenderCtx, x: number, y: number, s: number, kind: number) {
  const { ctx } = rc;
  const c = rc.colors;
  const tiles: [string, (cx: number, cy: number) => void][] = [
    [c.primary, (cx, cy) => rc.drawLogo(cx, cy, s * 0.42, c.white, { knockout: true })],
    [c.black, (cx, cy) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, s, s);
      ctx.clip();
      rc.text(rc.brand.name, cx - s * 0.2, cy + s * 0.2, s * 0.62, c.white, {});
      ctx.restore();
    }],
    [c.secondary, (cx, cy) => rc.drawLogoOutline(cx, cy, s * 0.5, bestOn(c.secondary, [c.black, c.white]))],
    [c.white, (cx, cy) => rc.drawLogo(cx, cy, s * 0.4, c.primary)],
    [mix(c.primary, c.black, 0.55), (cx, cy) => rc.drawLogoGradient(cx, cy, s * 0.46, [[0, "#FFFFFF"], [0.45, mix(c.primary, "#FFFFFF", 0.4)], [0.55, c.primary], [1, "#FFFFFF"]])],
    [c.black, (cx, cy) => rc.text(rc.brand.website || rc.brand.name, cx, cy, s * 0.1, c.white, { align: "center", baseline: "middle", family: `"JetBrains Mono", monospace` })],
  ];
  const [bg, draw] = tiles[kind % tiles.length];
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, s, s);
  draw(x + s / 2, y + s / 2);
}

export const socialScene: SceneDef = {
  type: "social",
  name: "Social profile",
  description: "A phone slides in showing the brand's social profile: avatar, bio, link and a grid of on-brand posts.",
  defaultDuration: 2.5,
  minDuration: 1.5,
  maxDuration: 6,
  params: [
    { key: "background", label: "Background", type: "role", default: "black" },
    { key: "posts", label: "Posts", type: "text", default: "24" },
    { key: "followers", label: "Followers", type: "text", default: "12.4k" },
    { key: "following", label: "Following", type: "text", default: "310" },
  ],
  render(rc, t, duration, p) {
    const { ctx, w, h, u } = rc;
    rc.fill(rc.role(p.background));
    const k = ease.outQuint(seg(t, 0, 0.7));
    const pan = ease.inOutCubic(seg(t, 0.6, duration));
    const PW = Math.min(w * 0.82, 760 * u);
    const PH = PW * 2.05;
    const x = w / 2 - PW / 2 + (1 - k) * w * 0.15 + PW * 0.18;
    const y = h * 0.12 + (1 - k) * h * 0.8 - pan * 60 * u;
    const ui = `"Inter", system-ui, sans-serif`;

    ctx.save();
    ctx.translate(x + PW / 2, y + PH / 2);
    ctx.rotate(-0.04 * k);
    ctx.translate(-PW / 2, -PH / 2);
    const g = ctx.createLinearGradient(0, 0, PW, 0);
    g.addColorStop(0, "#5B5E66");
    g.addColorStop(0.08, "#D9DBE0");
    g.addColorStop(0.16, "#33353B");
    g.addColorStop(1, "#1C1D21");
    ctx.fillStyle = g;
    rc.roundRect(0, 0, PW, PH, PW * 0.14);
    ctx.fill();
    const inset = PW * 0.028;
    const sw = PW - inset * 2, sh = PH - inset * 2;
    ctx.save();
    rc.roundRect(inset, inset, sw, sh, PW * 0.12);
    ctx.clip();
    ctx.translate(inset, inset);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, sw, sh);
    const s = sw / 400;
    // Avatar with a gradient ring.
    const ax = 60 * s, ay = 150 * s, ar = 38 * s;
    const ring = ctx.createLinearGradient(ax - ar, ay + ar, ax + ar, ay - ar);
    ring.addColorStop(0, rc.colors.secondary);
    ring.addColorStop(1, rc.colors.primary);
    ctx.fillStyle = ring;
    ctx.beginPath(); ctx.arc(ax, ay, ar + 4 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath(); ctx.arc(ax, ay, ar + 1.5 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rc.colors.black;
    ctx.beginPath(); ctx.arc(ax, ay, ar - 1 * s, 0, Math.PI * 2); ctx.fill();
    rc.drawLogo(ax, ay, ar * 0.95, rc.colors.primary, { knockout: true });
    // Name and stats.
    const tc = "#111216";
    rc.text(rc.brand.handle || rc.brand.name, 120 * s, 122 * s, 15 * s, tc, { family: ui, weight: 600 });
    [[p.posts, "posts"], [p.followers, "followers"], [p.following, "following"]].forEach(([n, l], i) => {
      const sx = 120 * s + i * 82 * s;
      rc.text(String(n), sx, 152 * s, 16 * s, tc, { family: ui, weight: 700 });
      rc.text(String(l), sx, 172 * s, 12 * s, "#55575E", { family: ui, weight: 400 });
    });
    rc.text(rc.brand.tagline, 22 * s, 220 * s, 13 * s, tc, { family: ui, weight: 500 });
    rc.text(rc.brand.website, 22 * s, 240 * s, 13 * s, mix(rc.colors.primary, "#1A4BFF", 0.25), { family: ui, weight: 500 });
    // Buttons.
    [["Follow", rc.colors.primary, bestOn(rc.colors.primary, ["#FFFFFF", "#111216"])], ["Message", "#EFEFF2", tc]].forEach(([label, fill, ink], i) => {
      const bx = 22 * s + i * 182 * s;
      ctx.fillStyle = fill;
      rc.roundRect(bx, 260 * s, 172 * s, 32 * s, 8 * s);
      ctx.fill();
      rc.text(label, bx + 86 * s, 276 * s, 13 * s, ink, { family: ui, weight: 600, align: "center", baseline: "middle" });
    });
    // Post grid.
    const tile = (sw - 2 * 2 * s) / 3;
    for (let i = 0; i < 9; i++) {
      const col = i % 3, row = Math.floor(i / 3);
      const pop = ease.outCubic(seg(t, 0.45 + i * 0.05, 0.8 + i * 0.05));
      ctx.save();
      ctx.globalAlpha = pop;
      drawTile(rc, col * (tile + 2 * s), 310 * s + row * (tile + 2 * s), tile, i);
      ctx.restore();
    }
    ctx.restore();
    ctx.restore();
  },
};

/* ------------------------------------------------------------------ */

export const chromeScene: SceneDef = {
  type: "chrome",
  name: "Chrome mark",
  description: "The mark turns in a polished chrome or glass finish on a dark field, with a sweeping highlight.",
  defaultDuration: 2,
  minDuration: 1.2,
  maxDuration: 5,
  params: [
    { key: "background", label: "Background", type: "role", default: "black" },
    {
      key: "finish",
      label: "Finish",
      type: "select",
      default: "chrome",
      options: [
        { value: "chrome", label: "Chrome" },
        { value: "glass", label: "Tinted glass" },
        { value: "gold", label: "Warm metal" },
      ],
    },
    captionParam,
  ],
  render(rc, t, duration, p) {
    const { ctx, w, h, u } = rc;
    const bg = rc.role(p.background);
    rc.fill(bg);
    const vg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    vg.addColorStop(0, mix(bg, "#FFFFFF", 0.06));
    vg.addColorStop(1, mix(bg, "#000000", 0.4));
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    const L = rc.logoHeight(340);
    const turn = Math.cos(lerp(-1.1, 0.25, ease.outCubic(seg(t, 0, duration))));
    const sweep = seg(t, 0.2, duration);
    const pr = rc.colors.primary;
    const stops: Record<string, [number, string][]> = {
      chrome: [[0, "#5D6168"], [clamp(sweep - 0.18), "#E9ECF1"], [clamp(sweep), "#FFFFFF"], [clamp(sweep + 0.06), "#2A2C31"], [clamp(sweep + 0.3), "#B9BDC4"], [1, "#3B3E44"]],
      glass: [[0, mix(pr, "#000000", 0.4)], [clamp(sweep - 0.15), mix(pr, "#FFFFFF", 0.3)], [clamp(sweep), "#FFFFFF"], [clamp(sweep + 0.1), pr], [1, mix(pr, "#000000", 0.5)]],
      gold: [[0, "#5A3A12"], [clamp(sweep - 0.15), "#E8B867"], [clamp(sweep), "#FFF1CF"], [clamp(sweep + 0.1), "#9A6522"], [1, "#4A2E0E"]],
    };
    const cx = w / 2, cy = h / 2 - 20 * u;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(Math.max(0.08, Math.abs(turn)), 1);
    // A thin dark edge sells the thickness while it turns.
    rc.drawLogo(6 * u * Math.sign(turn), 0, L, mix(bg, "#000000", 0.5), { knockout: true, alpha: 1 - Math.abs(turn) * 0.6 });
    rc.drawLogoGradient(0, 0, L, stops[String(p.finish)] ?? stops.chrome, Math.PI / 2.6);
    ctx.restore();
    // Floor reflection.
    ctx.save();
    ctx.translate(cx, cy + L * 1.05);
    ctx.scale(Math.max(0.08, Math.abs(turn)), -0.35);
    rc.drawLogoGradient(0, 0, L, stops[String(p.finish)] ?? stops.chrome, Math.PI / 2.6, { alpha: 0.12 });
    ctx.restore();
    rc.caption(captionText(rc, p.caption), inkOn(rc, bg), seg(t, 0.4, 0.8) * 0.8);
  },
};

/* ------------------------------------------------------------------ */

export const marqueeScene: SceneDef = {
  type: "marquee",
  name: "Giant type",
  description: "The brand name runs across the frame at huge size, cropped by the edges, with the mark held in front.",
  defaultDuration: 2,
  minDuration: 1.2,
  maxDuration: 5,
  params: [
    { key: "background", label: "Background", type: "role", default: "black" },
    { key: "textColor", label: "Type colour", type: "role", default: "primary" },
    { key: "showMark", label: "Mark in front", type: "boolean", default: true },
  ],
  render(rc, t, duration, p) {
    const { ctx, w, h } = rc;
    const bg = rc.role(p.background);
    rc.fill(bg);
    const size = h * 0.42;
    ctx.save();
    ctx.font = rc.font(size, Math.max(700, rc.brand.font.weight));
    const text = rc.brand.name;
    const tw = ctx.measureText(text).width;
    ctx.restore();
    const k = ease.inOutCubic(seg(t, 0, duration));
    const x = lerp(w * 0.15, w * 0.85 - tw, k);
    const g = ctx.createLinearGradient(0, 0, w, 0);
    const c = rc.role(p.textColor);
    g.addColorStop(0, c);
    g.addColorStop(1, mix(c, rc.colors.secondary, 0.6));
    ctx.save();
    ctx.font = rc.font(size, Math.max(700, rc.brand.font.weight));
    ctx.textBaseline = "middle";
    ctx.fillStyle = g;
    ctx.fillText(text, x, h / 2);
    ctx.restore();
    if (p.showMark) {
      const m = ease.outBack(seg(t, 0.15, 0.6));
      ctx.save();
      ctx.shadowColor = rgba("#000000", 0.5);
      ctx.shadowBlur = 40 * rc.u;
      rc.drawLogoGradient(w / 2, h / 2, rc.logoHeight(380) * m, [[0, "#FFFFFF"], [0.5, "#C9CCD2"], [0.52, "#6D7078"], [1, "#F4F5F7"]], Math.PI / 3, { alpha: 0.96 });
      ctx.restore();
    }
  },
};

/* ------------------------------------------------------------------ */

export const flashScene: SceneDef = {
  type: "flash",
  name: "Colour flashes",
  description: "A fast run of cuts showing the mark on each brand colour, alternating solid and line art. Great as a closer.",
  defaultDuration: 2.5,
  minDuration: 1,
  maxDuration: 6,
  params: [
    { key: "cuts", label: "Number of cuts", type: "number", default: 6, min: 3, max: 12, step: 1 },
    { key: "lineArt", label: "Mix in line-art versions", type: "boolean", default: true },
    { ...captionParam, default: "credit" },
  ],
  render(rc, t, duration, p) {
    const n = Number(p.cuts);
    const i = Math.min(n - 1, Math.floor((t / duration) * n));
    const local = t - (i * duration) / n;
    const order: ColorRole[] = ["black", "primary", "white", "secondary"];
    const bg = rc.colors[order[i % order.length]];
    rc.fill(bg);
    const ink = i % order.length === 0 ? rc.colors.primary : inkOn(rc, bg);
    const L = rc.logoHeight(i === n - 1 ? 200 : 160 + (i % 3) * 30);
    const pop = 1 + 0.06 * (1 - ease.outCubic(clamp(local / 0.25)));
    if (p.lineArt && i % 3 === 2) rc.drawLogoOutline(rc.w / 2, rc.h / 2, L * pop, ink);
    else rc.drawLogo(rc.w / 2, rc.h / 2, L * pop, ink, { knockout: true });
    rc.caption(captionText(rc, p.caption), inkOn(rc, bg), 0.75);
  },
};

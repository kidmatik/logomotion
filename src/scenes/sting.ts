/**
 * Logo sting: a 3–5 second logo reveal to put at the start or end of any video.
 * Every style builds up to the same moment (LAND), so the sound design can hit
 * it exactly, then the name and an optional line settle into a lockup.
 */
import { bestOn } from "../brand/color";
import { ease, lerp, seg, type RenderCtx, type SceneDef } from "../engine/kit";
import type { ParamValue } from "../types";

/** Seconds into the scene when the mark lands, whatever the style. */
export const STING_LAND = 1.0;
/** When the name starts to appear (a second, softer hit in the soundtrack). */
export const STING_NAME = STING_LAND + 0.6;
/** Length of the "animate out" ending. */
export const STING_EXIT = 0.55;

interface Geo {
  cx: number;
  cy: number;
  M: number;
  markCol: string;
  accent: string;
  bg: string;
  maxR: number;
  others: string[];
}

interface Style {
  /** Drawn under the mark. */
  pre?(rc: RenderCtx, t: number, g: Geo): void;
  /** Draw the mark during its build. Return false to use the plain mark. */
  mark?(rc: RenderCtx, t: number, g: Geo): boolean;
  /** Drawn over everything. */
  post?(rc: RenderCtx, t: number, g: Geo): void;
}

const plain = (rc: RenderCtx, g: Geo, scale = 1, alpha = 1) => rc.drawLogo(g.cx, g.cy, g.M * Math.max(0, scale), g.markCol, { alpha });

const STYLES: Record<string, Style> = {
  /** Streaks fly in, the mark pops and a ring shockwave goes out. */
  burst: {
    pre(rc, t, g) {
      const { ctx, u } = rc;
      const k = ease.inCubic(seg(t, 0, STING_LAND));
      if (t < STING_LAND) {
        ctx.save();
        ctx.lineCap = "round";
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2 + 0.26;
          const r = lerp(g.maxR * 0.62, g.M * 0.25, k);
          const len = g.M * (0.15 + 0.45 * (1 - k)) * (i % 2 ? 0.7 : 1);
          ctx.strokeStyle = g.others[i % g.others.length];
          ctx.lineWidth = (i % 2 ? 8 : 14) * u;
          ctx.beginPath();
          ctx.moveTo(g.cx + Math.cos(a) * r, g.cy + Math.sin(a) * r);
          ctx.lineTo(g.cx + Math.cos(a) * (r + len), g.cy + Math.sin(a) * (r + len));
          ctx.stroke();
        }
        ctx.restore();
      }
      const ring = seg(t, STING_LAND, STING_LAND + 0.75);
      if (ring > 0 && ring < 1) {
        const e = ease.outCubic(ring);
        ctx.save();
        ctx.strokeStyle = g.accent;
        ctx.globalAlpha = 1 - ring;
        ctx.lineWidth = 22 * u * (1 - e) + 2 * u;
        ctx.beginPath();
        ctx.arc(g.cx, g.cy, g.M * 0.55 + e * g.maxR * 0.6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    },
    mark(rc, t, g) {
      plain(rc, g, ease.outBack(seg(t, STING_LAND - 0.12, STING_LAND + 0.3)));
      return true;
    },
  },

  /** Panels in the brand colours sweep across and leave the logo behind. */
  shutters: {
    mark(rc, t, g) {
      plain(rc, g, lerp(1.3, 1, ease.outCubic(seg(t, 0.45, STING_LAND + 0.25))));
      return true;
    },
    post(rc, t, g) {
      const { ctx, w, h } = rc;
      const cols = g.others.slice(0, 3);
      cols.forEach((c, i) => {
        const k = ease.inOutQuint(seg(t, i * 0.1, STING_LAND - (cols.length - 1 - i) * 0.1));
        if (k >= 1) return;
        const skew = w * 0.18;
        const x = lerp(-w - skew, w + skew, k);
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + w + skew, 0);
        ctx.lineTo(x + w, h);
        ctx.lineTo(x - skew, h);
        ctx.closePath();
        ctx.fill();
      });
    },
  },

  /** The mark arrives in strips from alternating sides, with a colour echo. */
  slices: {
    mark(rc, t, g) {
      if (t >= STING_LAND + 0.05) return false;
      const { ctx, w } = rc;
      const N = 7;
      const mw = rc.logoWidth(g.M);
      const top = g.cy - g.M / 2, sh = g.M / N;
      for (let j = 0; j < N; j++) {
        const end = STING_LAND - (N - 1 - j) * 0.05;
        const k = ease.outQuint(seg(t, end - 0.6, end));
        const dir = j % 2 ? 1 : -1;
        const dx = dir * (1 - k) * w * 0.7;
        for (const [col, lag, alpha] of [[g.accent, 1.35, 0.7], [g.markCol, 1, 1]] as const) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(g.cx - mw, top + j * sh - 0.5, mw * 2, sh + 1);
          ctx.clip();
          ctx.translate(dx * lag, 0);
          rc.drawLogo(g.cx, g.cy, g.M, col, { alpha: alpha * Math.min(1, k * 3), knockout: col === g.accent });
          ctx.restore();
        }
      }
      return true;
    },
  },

  /** Brand-colour dots orbit, spiral in and collapse into the mark. */
  orbit: {
    pre(rc, t, g) {
      const { ctx, u } = rc;
      if (t < STING_LAND) {
        const k = ease.inCubic(seg(t, 0, STING_LAND - 0.05));
        const R = lerp(g.M * 1.15, 0, k);
        g.others.slice(0, 3).forEach((c, i) => {
          const a = t * 7 + (i * Math.PI * 2) / 3;
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.arc(g.cx + Math.cos(a) * R, g.cy + Math.sin(a) * R, (18 + 14 * ease.outCubic(seg(t, 0, 0.4))) * u, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      const f = seg(t, STING_LAND - 0.05, STING_LAND + 0.5);
      if (f > 0 && f < 1) {
        ctx.save();
        ctx.globalAlpha = (1 - f) * 0.9;
        ctx.fillStyle = g.accent;
        ctx.beginPath();
        ctx.arc(g.cx, g.cy, g.M * 0.95 * ease.outCubic(f), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    },
    mark(rc, t, g) {
      plain(rc, g, ease.outBack(seg(t, STING_LAND - 0.05, STING_LAND + 0.35)));
      return true;
    },
  },

  /** The line art is drawn on, then the solid mark wipes in over it. */
  draw: {
    mark(rc, t, g) {
      if (t >= STING_LAND + 0.15) return false;
      const { ctx, u } = rc;
      const mw = rc.logoWidth(g.M);
      const x0 = g.cx - mw / 2 - 10 * u;
      const draw = ease.inOutCubic(seg(t, 0.05, STING_LAND - 0.25));
      const fill = ease.inOutCubic(seg(t, STING_LAND - 0.3, STING_LAND + 0.1));
      const W = mw + 20 * u;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, g.cy - g.M, W * draw, g.M * 2);
      ctx.clip();
      rc.drawLogoOutline(g.cx, g.cy, g.M, g.markCol, 1 - fill * 0.6);
      ctx.restore();
      if (fill > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0, g.cy - g.M, W * fill, g.M * 2);
        ctx.clip();
        plain(rc, g);
        ctx.restore();
      }
      // The "pen": an accent bar riding the edge that is being drawn.
      const edge = fill > 0 && fill < 1 ? fill : draw < 1 ? draw : -1;
      if (edge > 0) {
        ctx.fillStyle = g.accent;
        ctx.fillRect(x0 + W * edge - 3 * u, g.cy - g.M * 0.65, 6 * u, g.M * 1.3);
      }
      return true;
    },
  },

  /** A disc of colour opens like a lens iris to show the logo. */
  iris: {
    mark(rc, t, g) {
      plain(rc, g, lerp(0.82, 1, ease.outCubic(seg(t, 0.35, STING_LAND + 0.2))));
      return true;
    },
    post(rc, t, g) {
      const { ctx } = rc;
      const outer = ease.inOutCubic(seg(t, 0, 0.55)) * g.maxR;
      const inner = ease.inOutQuint(seg(t, 0.35, STING_LAND)) * g.maxR * 1.02;
      if (inner >= g.maxR) return;
      ctx.save();
      ctx.fillStyle = g.accent;
      ctx.beginPath();
      ctx.arc(g.cx, g.cy, Math.max(outer, inner + 0.5), 0, Math.PI * 2);
      ctx.arc(g.cx, g.cy, inner, 0, Math.PI * 2, true);
      ctx.fill();
      // A thin second ring in another brand colour for depth.
      const c2 = g.others.find((c) => c !== g.accent);
      if (c2 && inner > 0) {
        ctx.strokeStyle = c2;
        ctx.lineWidth = 10 * rc.u;
        ctx.beginPath();
        ctx.arc(g.cx, g.cy, inner + 5 * rc.u, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    },
  },
};

function lineText(rc: RenderCtx, v: ParamValue, custom: ParamValue) {
  if (v === "website") return rc.brand.website;
  if (v === "tagline") return rc.brand.tagline;
  if (v === "handle") return rc.brand.handle ? "@" + rc.brand.handle : "";
  if (v === "custom") return String(custom || "");
  return "";
}

export const stingScene: SceneDef = {
  type: "sting",
  name: "Logo sting",
  description: "A short, punchy logo reveal for the start or end of any video. Every style lands on the same beat as the sound hit.",
  defaultDuration: 4,
  minDuration: 2.5,
  maxDuration: 8,
  params: [
    {
      key: "style",
      label: "Reveal",
      type: "select",
      default: "burst",
      visual: true,
      previewAt: "motion",
      options: [
        { value: "burst", label: "Burst" },
        { value: "shutters", label: "Shutters" },
        { value: "slices", label: "Slices" },
        { value: "orbit", label: "Orbit" },
        { value: "draw", label: "Draw on" },
        { value: "iris", label: "Iris" },
      ],
    },
    {
      key: "ending",
      label: "Ending",
      type: "select",
      default: "hold",
      help: "Hold for an outro. Animate out for an intro that cuts into your video.",
      options: [
        { value: "hold", label: "Hold on the logo (outro)" },
        { value: "out", label: "Animate out (intro)" },
      ],
    },
    { key: "background", label: "Background", type: "role", default: "white", group: "Colours" },
    { key: "markColor", label: "Mark colour", type: "role", default: "primary", group: "Colours" },
    { key: "nameColor", label: "Name colour", type: "role", default: "black", group: "Colours" },
    { key: "accent", label: "Accent", type: "role", default: "secondary", group: "Colours" },
    { key: "showName", label: "Show the name", type: "boolean", default: true, group: "Lockup" },
    {
      key: "layout",
      label: "Lockup",
      type: "select",
      default: "auto",
      group: "Lockup",
      options: [
        { value: "auto", label: "Auto (by format)" },
        { value: "horizontal", label: "Side by side" },
        { value: "stacked", label: "Stacked" },
      ],
    },
    { key: "size", label: "Logo size", type: "number", default: 100, min: 50, max: 150, step: 5, unit: "%", group: "Lockup" },
    {
      key: "line",
      label: "Line under the logo",
      type: "select",
      default: "website",
      group: "Lockup",
      options: [
        { value: "none", label: "None" },
        { value: "website", label: "Website" },
        { value: "tagline", label: "Tagline" },
        { value: "handle", label: "Social handle" },
        { value: "custom", label: "Custom text" },
      ],
    },
    { key: "customLine", label: "Custom text", type: "text", default: "", placeholder: "e.g. Coming soon", group: "Lockup" },
  ],
  render(rc, t, duration, p) {
    const { ctx, w, h, u } = rc;
    const bg = rc.role(p.background);
    rc.fill(bg);
    const style = STYLES[String(p.style)] ?? STYLES.burst;
    const scale = (Number(p.size) || 100) / 100;

    // Lockup geometry.
    const hasName = !!p.showName && (rc.usesLettermark || !!rc.brand.name);
    const stacked = p.layout === "stacked" || (p.layout === "auto" && h >= w * 0.95);
    let M = rc.logoHeight(hasName ? (stacked ? 320 : 260) : 400) * scale;
    let size = rc.nameSize(stacked ? 0.85 : 1) * scale;
    let mw = rc.logoWidth(M);
    let gap = M * 0.32;
    let word = hasName ? rc.measureWordmark(size) : { w: 0, h: 0 };
    const total = !hasName ? mw : stacked ? Math.max(mw, word.w) : mw + gap + word.w;
    const fit = Math.min(1, (w * 0.84) / Math.max(1, total), (h * 0.62) / Math.max(1, stacked && hasName ? M + gap + word.h : M));
    M *= fit; size *= fit; mw *= fit; gap *= fit;
    if (hasName) word = rc.measureWordmark(size);

    const line = lineText(rc, p.line, p.customLine);
    const lineSize = Math.max(22 * u, Math.min(40 * u, size * 0.36));
    const lineGap = line ? lineSize * 1.6 : 0;
    const blockH = (stacked && hasName ? M + gap + word.h : M) + (line ? lineGap + lineSize : 0);
    const top = h / 2 - blockH / 2;

    const move = hasName ? ease.inOutQuint(seg(t, STING_LAND + 0.15, STING_LAND + 0.75)) : 0;
    const lift = line ? ease.inOutQuint(seg(t, STING_LAND + 0.15, STING_LAND + 0.75)) : 0;
    let markX = w / 2, markY = h / 2, textX = 0, textY = 0;
    if (stacked && hasName) {
      markY = lerp(h / 2, top + M / 2, Math.max(move, lift));
      textX = w / 2 - word.w / 2;
      textY = top + M + gap + word.h / 2;
    } else {
      const lockW = mw + (hasName ? gap + word.w : 0);
      markX = lerp(w / 2, w / 2 - lockW / 2 + mw / 2, move);
      markY = lerp(h / 2, top + M / 2, lift);
      textX = w / 2 - lockW / 2 + mw + gap;
      textY = markY;
    }

    const all = [rc.colors.primary, rc.colors.secondary, rc.colors.black, rc.colors.white];
    const accent = rc.role(p.accent);
    const others = [accent, ...all.filter((c) => c !== accent)].filter((c) => c.toLowerCase() !== bg.toLowerCase());
    const g: Geo = { cx: markX, cy: markY, M, markCol: rc.role(p.markColor), accent, bg, maxR: Math.hypot(w, h) / 2 + 20 * u, others: others.length ? others : [accent] };

    // Exit for intros: the lockup shrinks away and the frame clears to the background.
    const exit = p.ending === "out" ? ease.inCubic(seg(t, duration - STING_EXIT, duration - 0.04)) : 0;
    ctx.save();
    if (exit > 0) {
      ctx.globalAlpha = 1 - exit;
      ctx.translate(w / 2, h / 2);
      const s = 1 - 0.18 * exit;
      ctx.scale(s, s);
      ctx.translate(-w / 2, -h / 2);
    }

    style.pre?.(rc, t, g);
    if (!style.mark?.(rc, t, g)) plain(rc, g);

    // Name revealed through a mask that opens away from the mark.
    const nameIn = ease.outCubic(seg(t, STING_NAME, STING_NAME + 0.55));
    if (hasName && nameIn > 0) {
      ctx.save();
      ctx.beginPath();
      if (stacked) ctx.rect(0, textY - word.h, w, word.h * 2 * nameIn);
      else ctx.rect(textX - 4, 0, (word.w + 8) * nameIn + 2, h);
      ctx.clip();
      const slide = stacked ? 0 : (1 - nameIn) * -40 * u;
      const drop = stacked ? (1 - nameIn) * 30 * u : 0;
      rc.drawWordmark(textX + slide, textY + drop, size, rc.role(p.nameColor));
      ctx.restore();
    }

    const lineIn = ease.outCubic(seg(t, STING_NAME + 0.35, STING_NAME + 0.9));
    if (line && lineIn > 0) {
      const ink = bestOn(bg, [rc.colors.black, rc.colors.white]);
      rc.text(line, w / 2, top + blockH - lineSize * 0.15 + (1 - lineIn) * 16 * u, lineSize, ink, {
        family: `"JetBrains Mono", ui-monospace, monospace`,
        weight: 500,
        align: "center",
        alpha: lineIn * 0.85,
        tracking: 0.06,
      });
    }
    ctx.restore();

    style.post?.(rc, t, g);
  },
};

import { bestOn, mix } from "../brand/color";
import { ease, seg, type SceneDef } from "../engine/kit";
import type { ColorRole } from "../types";

interface Block {
  role: ColorRole;
  x: number; y: number; w: number; h: number;
  /** Direction the tint ramp runs: tints stacked down the right edge. */
  ramp: boolean;
}

const LANDSCAPE: Block[] = [
  { role: "primary", x: 0, y: 0, w: 0.5, h: 1, ramp: true },
  { role: "black", x: 0.5, y: 0, w: 0.25, h: 0.5, ramp: true },
  { role: "white", x: 0.75, y: 0, w: 0.25, h: 0.5, ramp: true },
  { role: "secondary", x: 0.5, y: 0.5, w: 0.5, h: 0.5, ramp: false },
];

const PORTRAIT: Block[] = [
  { role: "primary", x: 0, y: 0, w: 1, h: 0.45, ramp: true },
  { role: "black", x: 0, y: 0.45, w: 0.5, h: 0.27, ramp: true },
  { role: "white", x: 0.5, y: 0.45, w: 0.5, h: 0.27, ramp: true },
  { role: "secondary", x: 0, y: 0.72, w: 1, h: 0.28, ramp: false },
];

const LABELS: Record<ColorRole, string> = { primary: "Primary", secondary: "Secondary", black: "Black", white: "White" };

/** Colour palette: brand colours wipe in as blocks with tint ramps and hex codes. */
export const paletteScene: SceneDef = {
  type: "palette",
  name: "Colour palette",
  description: "The brand colours wipe in as blocks, each with tints, shades and its hex code.",
  defaultDuration: 3,
  minDuration: 2,
  maxDuration: 8,
  params: [
    { key: "showHex", label: "Show hex codes", type: "boolean", default: true },
    { key: "showRamps", label: "Show tint ramps", type: "boolean", default: true },
  ],
  render(rc, t, _duration, p) {
    const { ctx, w, h, u } = rc;
    rc.fill(rc.colors.white);
    const blocks = rc.portrait ? PORTRAIT : LANDSCAPE;
    blocks.forEach((b, i) => {
      const k = ease.inOutQuint(seg(t, 0.1 + i * 0.16, 0.9 + i * 0.16));
      if (k <= 0) return;
      const color = rc.colors[b.role];
      const x = b.x * w, y = b.y * h, bw = b.w * w, bh = b.h * h;
      ctx.save();
      ctx.beginPath();
      // Primary wipes from the left, others drop from the top.
      if (i === 0) ctx.rect(x, y, bw * k, bh);
      else ctx.rect(x, y, bw, bh * k);
      ctx.clip();
      ctx.fillStyle = color;
      ctx.fillRect(x, y, bw, bh);

      if (b.ramp && p.showRamps) {
        const steps = 6;
        const rw = Math.min(70 * u, bw * 0.12);
        const towards = b.role === "white" ? rc.colors.black : rc.colors.white;
        for (let s = 0; s < steps; s++) {
          const kk = ease.outCubic(seg(t, 0.6 + i * 0.16 + s * 0.05, 1.0 + i * 0.16 + s * 0.05));
          ctx.fillStyle = mix(color, towards, ((s + 1) / (steps + 1)) * 0.85);
          const sh = bh / steps;
          ctx.fillRect(x + bw - rw * kk, y + s * sh, rw, sh + 1);
        }
      }

      const ink = bestOn(color, [rc.colors.white, rc.colors.black, "#000000", "#FFFFFF"]);
      const ta = ease.outCubic(seg(t, 0.7 + i * 0.16, 1.2 + i * 0.16));
      rc.text(LABELS[b.role], x + 30 * u, y + 56 * u, 26 * u, ink, { weight: 500, alpha: ta, family: `"Inter", system-ui` });
      if (p.showHex) rc.text(color.toUpperCase(), x + 30 * u, y + bh - 30 * u, 26 * u, ink, { weight: 500, alpha: ta * 0.85, family: `"Inter", system-ui` });
      if (b.role === "white") {
        ctx.strokeStyle = "rgba(0,0,0,0.06)";
        ctx.strokeRect(x, y, bw, bh);
      }
      ctx.restore();
    });
  },
};

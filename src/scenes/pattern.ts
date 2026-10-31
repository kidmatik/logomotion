import { ease, seg, type SceneDef } from "../engine/kit";

/** Pattern grid: the mark tiles the frame, popping in from the centre outwards. */
export const patternScene: SceneDef = {
  type: "pattern",
  name: "Pattern grid",
  description: "The mark repeats across the frame as a brand pattern, popping in from the centre.",
  defaultDuration: 2.6,
  minDuration: 1.6,
  maxDuration: 8,
  params: [
    { key: "background", label: "Background", type: "role", default: "primary" },
    { key: "mark", label: "Mark colour", type: "role", default: "white" },
    { key: "accent", label: "Accent marks", type: "role", default: "secondary" },
    { key: "density", label: "Density", type: "number", default: 6, min: 3, max: 12, step: 1 },
  ],
  render(rc, t, duration, p) {
    const { ctx, w, h } = rc;
    rc.fill(rc.role(p.background));
    const cols = Number(p.density);
    const cell = w / cols;
    const rows = Math.ceil(h / cell) + 2;
    const drift = ease.inOutCubic(seg(t, 0, duration)) * cell;
    const maxD = Math.hypot(cols / 2, rows / 2);
    ctx.save();
    ctx.translate(-drift * 0.5, -drift);
    for (let r = -1; r < rows; r++) {
      for (let c = -1; c <= cols; c++) {
        const x = c * cell + cell / 2 + (r % 2 ? cell / 2 : 0);
        const y = r * cell + cell / 2;
        const d = Math.hypot(c - cols / 2, r - rows / 2) / maxD;
        const k = ease.outBack(seg(t, d * 0.8, d * 0.8 + 0.5));
        if (k <= 0) continue;
        const accent = (r * 7 + c * 3) % 5 === 0;
        const color = rc.role(accent ? p.accent : p.mark);
        rc.drawLogo(x, y, cell * 0.42 * k * rc.brand.logoScale, color, { alpha: accent ? 1 : 0.92, knockout: true });
      }
    }
    ctx.restore();
  },
};

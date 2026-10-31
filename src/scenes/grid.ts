import { mix } from "../brand/color";
import { ease, seg, type SceneDef } from "../engine/kit";

/** Construction grid: guide lines and anchors sketch the mark, which then fills in. */
export const gridScene: SceneDef = {
  type: "grid",
  name: "Construction grid",
  description: "Guide lines, a circle and anchor points sketch the mark before it fills with colour.",
  defaultDuration: 3.2,
  minDuration: 2,
  maxDuration: 8,
  params: [
    { key: "background", label: "Background", type: "role", default: "white", roles: ["white", "black"] },
    { key: "markColor", label: "Mark colour", type: "role", default: "primary" },
    { key: "showCircle", label: "Show circle guide", type: "boolean", default: true },
  ],
  render(rc, t, duration, p) {
    const { ctx, w, h, u } = rc;
    const bg = rc.role(p.background);
    const ink = bg === rc.colors.black ? rc.colors.white : rc.colors.black;
    const guide = mix(bg, ink, 0.14);
    const ghost = mix(bg, ink, 0.07);
    rc.fill(bg);

    const L = rc.logoHeight(rc.portrait ? 360 : 420);
    const bw = rc.logoWidth(L);
    const cx = w / 2, cy = h / 2;
    const left = cx - bw / 2, right = cx + bw / 2, top = cy - L / 2, bottom = cy + L / 2;

    const out = ease.inOutCubic(seg(t, duration - 0.9, duration - 0.2));
    const guidesAlpha = 1 - out;

    ctx.save();
    ctx.globalAlpha = guidesAlpha;
    ctx.strokeStyle = guide;
    ctx.lineWidth = Math.max(1, 1.5 * u);

    // Horizontal and vertical guides grow out from the centre.
    const hLines = [top, cy, bottom];
    const vLines = [left, cx, right];
    hLines.forEach((y, i) => {
      const k = ease.outCubic(seg(t, 0.05 + i * 0.08, 0.9 + i * 0.08));
      ctx.beginPath();
      ctx.moveTo(cx - (w / 2) * k, y);
      ctx.lineTo(cx + (w / 2) * k, y);
      ctx.stroke();
    });
    vLines.forEach((x, i) => {
      const k = ease.outCubic(seg(t, 0.15 + i * 0.08, 1.0 + i * 0.08));
      ctx.beginPath();
      ctx.moveTo(x, cy - (h / 2) * k);
      ctx.lineTo(x, cy + (h / 2) * k);
      ctx.stroke();
    });

    if (p.showCircle) {
      const k = ease.inOutCubic(seg(t, 0.4, 1.4));
      const r = (Math.hypot(bw, L) / 2) * 1.02;
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
      ctx.stroke();
    }

    // Anchor squares at the bounding-box corners.
    const s = 14 * u;
    [[left, top], [right, top], [left, bottom], [right, bottom]].forEach(([x, y], i) => {
      const k = ease.outBack(seg(t, 0.8 + i * 0.06, 1.2 + i * 0.06));
      if (k <= 0) return;
      ctx.fillStyle = bg;
      ctx.strokeStyle = guide;
      ctx.lineWidth = Math.max(1, 2 * u);
      const ss = s * k;
      ctx.fillRect(x - ss / 2, y - ss / 2, ss, ss);
      ctx.strokeRect(x - ss / 2, y - ss / 2, ss, ss);
    });
    ctx.restore();

    // Ghost mark, then the filled mark.
    const ghostIn = ease.outCubic(seg(t, 0.6, 1.3));
    rc.drawLogo(cx, cy, L, ghost, { alpha: ghostIn * (1 - out * 0.5), knockout: true });
    const fillIn = ease.inOutCubic(seg(t, 1.5, 2.2));
    const scale = 1 + 0.04 * ease.outCubic(seg(t, 1.5, duration));
    rc.drawLogo(cx, cy, L * scale, rc.role(p.markColor), { alpha: fillIn });
  },
};

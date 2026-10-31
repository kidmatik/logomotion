import { mix, rgba } from "../brand/color";
import { ease, lerp, seg, type SceneDef } from "../engine/kit";

/** Draw an app-icon tile with the mark knocked out on it. Shared with the phone scene. */
export function drawIconTile(
  rc: import("../engine/kit").RenderCtx,
  cx: number,
  cy: number,
  size: number,
  tile: string,
  mark: string,
  opts: { shadow?: boolean } = {},
) {
  const { ctx } = rc;
  const r = size * 0.23;
  ctx.save();
  if (opts.shadow) {
    ctx.shadowColor = rgba(tile, 0.45);
    ctx.shadowBlur = size * 0.25;
    ctx.shadowOffsetY = size * 0.08;
  }
  const g = ctx.createLinearGradient(cx, cy - size / 2, cx, cy + size / 2);
  g.addColorStop(0, mix(tile, "#FFFFFF", 0.08));
  g.addColorStop(1, mix(tile, "#000000", 0.08));
  ctx.fillStyle = g;
  rc.roundRect(cx - size / 2, cy - size / 2, size, size, r);
  ctx.fill();
  ctx.restore();
  // Keep the mark inside the tile with clear space on every side.
  const ratio = rc.assets.logo?.ratio ?? 1;
  const markH = Math.min(size * 0.56, (size * 0.56) / ratio) * Math.min(1.25, rc.brand.logoScale);
  rc.drawLogo(cx, cy, markH, mark, { knockout: true });
}

export const iconScene: SceneDef = {
  type: "icon",
  name: "App icon",
  description: "A soft glow of the mark condenses into a rounded app-icon tile.",
  defaultDuration: 2.6,
  minDuration: 1.6,
  maxDuration: 6,
  params: [
    { key: "background", label: "Background", type: "role", default: "white" },
    { key: "tile", label: "Tile colour", type: "role", default: "primary" },
    { key: "mark", label: "Mark on tile", type: "role", default: "white" },
  ],
  render(rc, t, duration, p) {
    const { ctx, w, h, u } = rc;
    const bg = rc.role(p.background);
    const tile = rc.role(p.tile);
    rc.fill(bg);
    const cx = w / 2, cy = h / 2;
    const S = 400 * u;

    // Glow: a blurred bloom that tightens into the tile.
    const glow = 1 - ease.inOutCubic(seg(t, 0.4, 1.3));
    const bloom = ease.outCubic(seg(t, 0, 0.8));
    if (glow > 0) {
      const R = S * lerp(0.4, 1.1, bloom);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      g.addColorStop(0, rgba(tile, 0.55 * glow));
      g.addColorStop(1, rgba(tile, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.filter = `blur(${Math.round(30 * u * glow)}px)`;
      rc.drawLogo(cx, cy, rc.logoHeight(220) * lerp(0.7, 1, bloom), mix(tile, bg, 0.3), { alpha: glow, knockout: true });
      ctx.restore();
    }

    const k = ease.outBack(seg(t, 0.75, 1.45));
    if (k > 0) {
      const floatY = Math.sin(seg(t, 1.4, duration) * Math.PI) * -8 * u;
      ctx.save();
      ctx.globalAlpha = Math.min(1, seg(t, 0.75, 1.0) * 1.5);
      drawIconTile(rc, cx, cy + floatY, S * lerp(0.6, 1, k), tile, rc.role(p.mark), { shadow: true });
      ctx.restore();
    }
  },
};
